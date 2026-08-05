//! Embedded-capable korrid server core: contracts, dispatch, and lifecycle.

use axum::{
    extract::State,
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{
    net::{Ipv4Addr, SocketAddrV4, TcpListener as StdTcpListener},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    thread::JoinHandle,
};
use tokio::sync::oneshot;
use typeshare::typeshare;

pub mod config;

pub const VERSION: &str = "korrid-v0";
const ANDROID_BUNDLED_PORTAL_ORIGIN: &str = "https://appassets.androidplatform.net";

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CatalogSnapshotRequest {}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "kebab-case")]
pub enum GameIdentity {
    Hash(String),
    Provider(GameProviderIdentity),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GameProviderIdentity {
    pub provider: String,
    #[serde(rename = "ref")]
    pub provider_ref: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Game {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identity: Option<GameIdentity>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CatalogHostFailure {
    pub host: String,
    pub code: String,
    pub message: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CatalogSnapshot {
    pub games: Vec<Game>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failures: Option<Vec<CatalogHostFailure>>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPrepareRequest {
    pub game_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPrepared {
    pub game_id: String,
    /** Identity created by korrid while preparing this exact launch. */
    pub launch_id: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct MoonlightResolveRequest {}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoonlightLaunchPrepareRequest {
    pub host_uuid: String,
    pub app_id: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub game_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoonlightLaunchCancelRequest {
    pub launch_id: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoonlightLaunchCancelled {
    pub launch_id: String,
}

#[typeshare]
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum MoonlightImplementation {
    Artemis,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedMoonlight {
    pub transport_id: String,
    pub implementation: MoonlightImplementation,
    pub sunshine_app: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum MoonlightResolveOutcome {
    Available(ResolvedMoonlight),
    Unavailable(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum MoonlightLaunchPrepareOutcome {
    Ok(launcher::MoonlightLaunchSpec),
    Err(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum MoonlightLaunchCancelOutcome {
    Ok(MoonlightLaunchCancelled),
    Err(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "kind", content = "payload", rename_all = "kebab-case")]
pub enum SessionControlInteraction {
    Command,
    Toggle {
        value: bool,
    },
    Choice {
        value: String,
        options: Vec<SessionControlChoice>,
    },
    Range {
        value: f64,
        min: f64,
        max: f64,
        step: f64,
    },
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SessionControlChoice {
    pub value: String,
    pub label: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionControl {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disabled_reason: Option<String>,
    pub destructive: bool,
    pub dismiss_on_success: bool,
    pub interaction: SessionControlInteraction,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SessionControlGroup {
    pub id: String,
    pub label: String,
    pub controls: Vec<SessionControl>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionControls {
    pub launch_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub groups: Vec<SessionControlGroup>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionControlsRequest {
    pub launch_id: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    content = "value",
    rename_all = "kebab-case",
    deny_unknown_fields
)]
pub enum SessionControlValue {
    Toggle(bool),
    Choice(String),
    Range(f64),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionControlInvokeRequest {
    pub launch_id: String,
    pub control_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<SessionControlValue>,
}

#[typeshare]
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum SessionControlFailureReason {
    StaleSession,
    UnknownControl,
    Disabled,
    InvalidValue,
    Unavailable,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SessionControlFailure {
    pub reason: SessionControlFailureReason,
    pub message: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum SessionControlsOutcome {
    Ok(SessionControls),
    Err(SessionControlFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionControlCompleted {
    pub launch_id: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum SessionControlInvokeResult {
    Completed(SessionControlCompleted),
    PlatformInstruction(launcher::PlatformInstruction),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum SessionControlInvokeOutcome {
    Ok(SessionControlInvokeResult),
    Err(SessionControlFailure),
}

/** Strict process-local publication from the live Artemis Game edge. */
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MoonlightExecutorState {
    pub launch_id: String,
    pub effects: Vec<MoonlightExecutorEffectState>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MoonlightExecutorEffectState {
    pub effect: launcher::AndroidMoonlightEffect,
    pub fulfillable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<SessionControlValue>,
}

impl MoonlightExecutorState {
    fn effect(
        &self,
        effect: launcher::AndroidMoonlightEffect,
    ) -> Option<&MoonlightExecutorEffectState> {
        self.effects.iter().find(|entry| entry.effect == effect)
    }

    fn is_strict(&self) -> bool {
        use launcher::AndroidMoonlightEffect as Effect;
        let expected = [
            Effect::Disconnect,
            Effect::QuitHost,
            Effect::ToggleKeyboard,
            Effect::ToggleFullKeyboard,
            Effect::SetFillMode,
            Effect::SetZoomMode,
            Effect::RotateScreen,
            Effect::ToggleHud,
            Effect::ToggleFloatingMenu,
            Effect::ToggleKeyboardController,
            Effect::SwitchTouchSensitivity,
            Effect::SetMouseMode,
            Effect::SetLocalCursor,
            Effect::SetSgsrEdgeThreshold,
            Effect::SetSgsrSharpness,
            Effect::SetFaceButtonFlip,
            Effect::SetRumble,
            Effect::SetPictureInPicture,
        ];
        if self.effects.len() != expected.len() {
            return false;
        }
        let mut seen = std::collections::BTreeSet::new();
        self.effects.iter().all(|entry| {
            seen.insert(entry.effect)
                && match (entry.effect, &entry.value) {
                    (
                        Effect::SetFillMode
                        | Effect::SetZoomMode
                        | Effect::SetFaceButtonFlip
                        | Effect::SetRumble
                        | Effect::SetPictureInPicture,
                        Some(SessionControlValue::Toggle(_)),
                    ) => true,
                    (Effect::SetMouseMode, Some(SessionControlValue::Choice(value))) => {
                        matches!(value.as_str(), "0" | "1" | "2" | "3" | "4" | "5")
                    }
                    (Effect::SetSgsrSharpness, Some(SessionControlValue::Range(value))) => {
                        valid_range_value(*value, 0.0, 50.0, 1.0)
                    }
                    (Effect::SetSgsrEdgeThreshold, Some(SessionControlValue::Range(value))) => {
                        valid_range_value(*value, 1.0, 32.0, 1.0)
                    }
                    (
                        Effect::Disconnect
                        | Effect::QuitHost
                        | Effect::ToggleKeyboard
                        | Effect::ToggleFullKeyboard
                        | Effect::RotateScreen
                        | Effect::ToggleHud
                        | Effect::ToggleFloatingMenu
                        | Effect::ToggleKeyboardController
                        | Effect::SwitchTouchSensitivity
                        | Effect::SetLocalCursor,
                        None,
                    ) => true,
                    _ => false,
                }
        }) && expected.iter().all(|effect| seen.contains(effect))
    }
}

fn ulp_at(value: f64) -> f64 {
    let magnitude = value.abs();
    if magnitude < f64::MIN_POSITIVE {
        return f64::from_bits(1);
    }
    let exponent = ((magnitude.to_bits() >> 52) & 0x7ff) as i32 - 1023;
    2.0_f64.powi(exponent - 52)
}

fn valid_range_value(value: f64, min: f64, max: f64, step: f64) -> bool {
    if !value.is_finite()
        || !min.is_finite()
        || !max.is_finite()
        || !step.is_finite()
        || step <= 0.0
        || min + step == min
        || min > max
        || value < min
        || value > max
    {
        return false;
    }
    if value == min || value == max {
        return true;
    }

    let offset = value - min;
    let steps = if offset.is_finite() {
        offset / step
    } else {
        value / step - min / step
    };
    if !steps.is_finite() {
        return false;
    }
    let nearest = steps.round().mul_add(step, min);
    if !nearest.is_finite() {
        return false;
    }

    // Subtraction, division, rounding, and the fused grid reconstruction can
    // each move the result by an ULP. Compare in value space, but cap that
    // tolerance to the declared step so absolute magnitude cannot admit a
    // material fraction of one step.
    let arithmetic_tolerance = 4.0 * ulp_at(value).max(ulp_at(min)).max(ulp_at(nearest));
    let grid_tolerance = step * 1e-9;
    (value - nearest).abs() <= arithmetic_tolerance.min(grid_tolerance)
}

/** Validate the invocation against the current materialized control before an
 * integration effect can be selected or protected. */
pub fn validate_session_control_invocation(
    active_launch_id: &str,
    request: &SessionControlInvokeRequest,
    control: &SessionControl,
) -> Result<(), SessionControlFailure> {
    if request.launch_id != active_launch_id {
        return Err(SessionControlFailure {
            reason: SessionControlFailureReason::StaleSession,
            message: "The gameplay session changed. Reopen the overlay and try again.".into(),
        });
    }
    if request.control_id != control.id {
        return Err(SessionControlFailure {
            reason: SessionControlFailureReason::UnknownControl,
            message: "That gameplay control is no longer available.".into(),
        });
    }
    if !control.enabled {
        return Err(SessionControlFailure {
            reason: SessionControlFailureReason::Disabled,
            message: control
                .disabled_reason
                .clone()
                .unwrap_or_else(|| "That gameplay control is currently unavailable.".into()),
        });
    }

    let valid = match (&control.interaction, &request.value) {
        (SessionControlInteraction::Command, None) => true,
        (SessionControlInteraction::Toggle { .. }, Some(SessionControlValue::Toggle(_))) => true,
        (
            SessionControlInteraction::Choice { options, .. },
            Some(SessionControlValue::Choice(value)),
        ) => options.iter().any(|option| option.value == *value),
        (
            SessionControlInteraction::Range {
                value: current,
                min,
                max,
                step,
            },
            Some(SessionControlValue::Range(submitted)),
        ) => {
            valid_range_value(*current, *min, *max, *step)
                && valid_range_value(*submitted, *min, *max, *step)
        }
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err(SessionControlFailure {
            reason: SessionControlFailureReason::InvalidValue,
            message: "That value is not valid for this gameplay control.".into(),
        })
    }
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SessionStatusRequest {}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveSession {
    pub launch_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub game_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SessionStatus {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active: Option<ActiveSession>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SessionStopRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub force: Option<bool>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionStopPhase {
    Stopped,
    Pending,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SessionStopResult {
    pub phase: SessionStopPhase,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct LocalGamesListRequest {}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct LocalGames {
    pub games: Vec<launcher::LocalGame>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failures: Option<Vec<RpcFailure>>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalGameLaunchRequest {
    pub game_id: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum LocalGamesListOutcome {
    Ok(LocalGames),
    Err(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum LocalGameLaunchOutcome {
    Ok(launcher::LaunchSpec),
    Err(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HealthRequest {}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SettingsSnapshotRequest {}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSetting {
    pub id: String,
    pub title: String,
    pub enabled: bool,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSnapshot {
    pub revision: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_name: Option<String>,
    pub plugins: Vec<PluginSetting>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdateRequest {
    pub expected_revision: String,
    pub setting_id: String,
    /** Text transport keeps the surface treaty generic. Plugin values are
     * exactly "true" or "false"; device-name values are the name itself. */
    pub value: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum SettingsSnapshotOutcome {
    Ok(SettingsSnapshot),
    Err(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum SettingsUpdateOutcome {
    Ok(SettingsSnapshot),
    Err(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Health {
    pub version: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct RpcFailure {
    pub code: String,
    pub message: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum CatalogSnapshotOutcome {
    Ok(CatalogSnapshot),
    Err(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum SessionPrepareOutcome {
    Ok(SessionPrepared),
    Err(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum SessionStatusOutcome {
    Ok(SessionStatus),
    Err(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum SessionStopOutcome {
    Ok(SessionStopResult),
    Err(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum HealthOutcome {
    Ok(Health),
    Err(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum RpcRequest {
    #[serde(rename = "app.catalog.snapshot")]
    CatalogSnapshot(CatalogSnapshotRequest),
    #[serde(rename = "app.moonlight.resolve")]
    MoonlightResolve(MoonlightResolveRequest),
    #[serde(rename = "app.moonlight.launch.prepare")]
    MoonlightLaunchPrepare(MoonlightLaunchPrepareRequest),
    #[serde(rename = "app.moonlight.launch.cancel")]
    MoonlightLaunchCancel(MoonlightLaunchCancelRequest),
    #[serde(rename = "app.session.prepare")]
    SessionPrepare(SessionPrepareRequest),
    #[serde(rename = "app.session.status")]
    SessionStatus(SessionStatusRequest),
    #[serde(rename = "app.session.stop")]
    SessionStop(SessionStopRequest),
    #[serde(rename = "app.session.controls")]
    SessionControls(SessionControlsRequest),
    #[serde(rename = "app.session.control.invoke")]
    SessionControlInvoke(SessionControlInvokeRequest),
    #[serde(rename = "app.local-games.list")]
    LocalGamesList(LocalGamesListRequest),
    #[serde(rename = "app.local-games.launch")]
    LocalGameLaunch(LocalGameLaunchRequest),
    #[serde(rename = "system.health")]
    Health(HealthRequest),
    #[serde(rename = "system.settings.snapshot")]
    SettingsSnapshot(SettingsSnapshotRequest),
    #[serde(rename = "system.settings.update")]
    SettingsUpdate(SettingsUpdateRequest),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "outcome")]
pub enum RpcResponse {
    #[serde(rename = "app.catalog.snapshot")]
    CatalogSnapshot(CatalogSnapshotOutcome),
    #[serde(rename = "app.moonlight.resolve")]
    MoonlightResolve(MoonlightResolveOutcome),
    #[serde(rename = "app.moonlight.launch.prepare")]
    MoonlightLaunchPrepare(MoonlightLaunchPrepareOutcome),
    #[serde(rename = "app.moonlight.launch.cancel")]
    MoonlightLaunchCancel(MoonlightLaunchCancelOutcome),
    #[serde(rename = "app.session.prepare")]
    SessionPrepare(SessionPrepareOutcome),
    #[serde(rename = "app.session.status")]
    SessionStatus(SessionStatusOutcome),
    #[serde(rename = "app.session.stop")]
    SessionStop(SessionStopOutcome),
    #[serde(rename = "app.session.controls")]
    SessionControls(SessionControlsOutcome),
    #[serde(rename = "app.session.control.invoke")]
    SessionControlInvoke(SessionControlInvokeOutcome),
    #[serde(rename = "app.local-games.list")]
    LocalGamesList(LocalGamesListOutcome),
    #[serde(rename = "app.local-games.launch")]
    LocalGameLaunch(LocalGameLaunchOutcome),
    #[serde(rename = "system.health")]
    Health(HealthOutcome),
    #[serde(rename = "system.settings.snapshot")]
    SettingsSnapshot(SettingsSnapshotOutcome),
    #[serde(rename = "system.settings.update")]
    SettingsUpdate(SettingsUpdateOutcome),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum NativePlatform {
    Standalone,
    EmbeddedAndroid,
}

#[derive(Clone)]
struct BrainRuntime {
    upstream: upstreams::UpstreamRegistry,
    local_storage_root: PathBuf,
    local_file_provision: launcher::FileProvisionMode,
    local_launch_signing_key: Vec<u8>,
    local_launch_reservations: Arc<Mutex<launcher::LaunchPublicationReservations>>,
    moonlight_launch_authority: Arc<Mutex<launcher::MoonlightLaunchAuthority>>,
    active_android_launch: Arc<Mutex<Option<launcher::AndroidActiveLaunch>>>,
    moonlight_executor_state: Arc<Mutex<Option<MoonlightExecutorState>>>,
    native_platform: NativePlatform,
    config_snapshot: config::snapshot::ConfigSnapshotCoordinator,
    /** Serialises revision-check + replace; external file-manager edits are
     * detected by the revision inside this same critical section. */
    settings_write_lock: Arc<Mutex<()>>,
}

#[derive(Clone)]
enum ServerMode {
    Brain(BrainRuntime),
    Host(host::HostRuntime),
}

#[derive(Clone)]
struct AppState {
    mode: ServerMode,
    rpc_capability: Option<String>,
}

fn local_launch_failure(error: launcher::LaunchError) -> RpcFailure {
    let code = match &error {
        launcher::LaunchError::UnknownGame(_) => "LocalGameNotFound",
        launcher::LaunchError::RomMissing(_) => "LocalRomMissing",
        launcher::LaunchError::StorageAccess(_) => "LocalStorageUnavailable",
        launcher::LaunchError::Config(_) => "LocalConfigWriteFailed",
        launcher::LaunchError::ConfigUnauthorized(_) => "LocalConfigUnauthorized",
        launcher::LaunchError::RouteUnavailable(_) => "LocalRouteUnavailable",
        launcher::LaunchError::RouteCollision(_) => "LocalRouteCollision",
    };
    RpcFailure {
        code: code.into(),
        message: error.to_string(),
    }
}

fn snapshot_diagnostic_failure(diagnostic: &config::snapshot::SnapshotDiagnostic) -> RpcFailure {
    RpcFailure {
        code: snapshot_diagnostic_code(diagnostic.code).into(),
        message: diagnostic.message.clone(),
    }
}

fn snapshot_diagnostic_code(code: config::snapshot::SnapshotDiagnosticCode) -> &'static str {
    match code {
        config::snapshot::SnapshotDiagnosticCode::LocalConfigReloadFailed => {
            "LocalConfigReloadFailed"
        }
        config::snapshot::SnapshotDiagnosticCode::LocalConfigUnsupported => {
            "LocalConfigUnsupported"
        }
        config::snapshot::SnapshotDiagnosticCode::LocalConfigUnauthorized => {
            "LocalConfigUnauthorized"
        }
    }
}

fn route_diagnostic_failure(diagnostic: &config::resolver::RouteDiagnostic) -> RpcFailure {
    RpcFailure {
        code: route_diagnostic_code(diagnostic.code).into(),
        message: diagnostic.message.clone(),
    }
}

fn route_diagnostic_code(code: config::resolver::RouteDiagnosticCode) -> &'static str {
    match code {
        config::resolver::RouteDiagnosticCode::LocalRouteUnavailable => "LocalRouteUnavailable",
        config::resolver::RouteDiagnosticCode::LocalRouteCollision => "LocalRouteCollision",
    }
}

fn upstream_failure(error: upstreams::UpstreamError) -> RpcFailure {
    RpcFailure {
        code: error.code().into(),
        message: error.to_string(),
    }
}

/// Pure mapping from the legacy status union to the korrid-shaped outcome.
fn session_status_outcome(
    result: Result<upstream::UpstreamSessionStatus, upstreams::UpstreamError>,
) -> SessionStatusOutcome {
    match result {
        Ok(upstream::UpstreamSessionStatus::SessionStatus { active }) => {
            SessionStatusOutcome::Ok(SessionStatus {
                active: active.map(|active| ActiveSession {
                    launch_id: active.launch_id,
                    host: active.host,
                    game_id: active.game_id,
                    title: active.title,
                    phase: active.phase,
                }),
            })
        }
        Ok(upstream::UpstreamSessionStatus::SessiondNotConfigured {}) => {
            SessionStatusOutcome::Err(RpcFailure {
                code: "SessiondNotConfigured".into(),
                message: "host session daemon is not configured".into(),
            })
        }
        Ok(upstream::UpstreamSessionStatus::HostUnavailable {}) => {
            SessionStatusOutcome::Err(RpcFailure {
                code: "HostUnavailable".into(),
                message: "host is unavailable".into(),
            })
        }
        Err(error) => SessionStatusOutcome::Err(upstream_failure(error)),
    }
}

/// Pure mapping from the legacy stop union to the korrid-shaped outcome.
fn session_stop_outcome(
    result: Result<upstream::UpstreamSessionStop, upstreams::UpstreamError>,
) -> SessionStopOutcome {
    match result {
        Ok(upstream::UpstreamSessionStop::Stopped { .. }) => {
            SessionStopOutcome::Ok(SessionStopResult {
                phase: SessionStopPhase::Stopped,
            })
        }
        Ok(upstream::UpstreamSessionStop::StopPending { .. }) => {
            SessionStopOutcome::Ok(SessionStopResult {
                phase: SessionStopPhase::Pending,
            })
        }
        Ok(upstream::UpstreamSessionStop::NothingToStop {}) => {
            SessionStopOutcome::Ok(SessionStopResult {
                phase: SessionStopPhase::Stopped,
            })
        }
        Ok(upstream::UpstreamSessionStop::ConfirmationRequired { action }) => {
            SessionStopOutcome::Err(RpcFailure {
                code: "ConfirmationRequired".into(),
                message: action.unwrap_or_else(|| "session stop requires confirmation".into()),
            })
        }
        Ok(upstream::UpstreamSessionStop::SessiondNotConfigured {}) => {
            SessionStopOutcome::Err(RpcFailure {
                code: "SessiondNotConfigured".into(),
                message: "host session daemon is not configured".into(),
            })
        }
        Ok(upstream::UpstreamSessionStop::HostUnavailable {}) => {
            SessionStopOutcome::Err(RpcFailure {
                code: "HostUnavailable".into(),
                message: "host is unavailable".into(),
            })
        }
        Err(error) => SessionStopOutcome::Err(upstream_failure(error)),
    }
}

fn resolve_moonlight_outcome(
    config_state: &config::snapshot::ConfigSnapshotState,
    native_platform: NativePlatform,
) -> MoonlightResolveOutcome {
    if config_state.authorization == config::snapshot::SnapshotAuthorization::Unauthorized {
        return MoonlightResolveOutcome::Unavailable(
            config_state
                .diagnostic
                .as_ref()
                .map(snapshot_diagnostic_failure)
                .unwrap_or_else(|| RpcFailure {
                    code: "LocalConfigUnauthorized".into(),
                    message: "current configuration snapshot is unauthorized".into(),
                }),
        );
    }

    match plugin_policy::registry_for_snapshot(&config_state.snapshot) {
        Ok(registry) => (native_platform == NativePlatform::EmbeddedAndroid)
            .then(|| {
                config::resolver::resolve_moonlight_transport(
                    &registry,
                    config::resolver::RoutePlatform::Android,
                )
            })
            .flatten()
            .map(|resolved| {
                MoonlightResolveOutcome::Available(ResolvedMoonlight {
                    transport_id: resolved.transport_id,
                    implementation: MoonlightImplementation::Artemis,
                    sunshine_app: resolved.sunshine_app,
                })
            })
            .unwrap_or_else(|| {
                MoonlightResolveOutcome::Unavailable(RpcFailure {
                    code: "MoonlightUnavailable".into(),
                    message: "Moonlight is disabled or Artemis is unavailable".into(),
                })
            }),
        Err(error) => MoonlightResolveOutcome::Unavailable(RpcFailure {
            code: "PluginPolicyInvalid".into(),
            message: error.to_string(),
        }),
    }
}

fn authorize_moonlight_launch_against_current_policy(
    authority: &mut launcher::MoonlightLaunchAuthority,
    spec: &launcher::MoonlightLaunchSpec,
    current: MoonlightResolveOutcome,
) -> Result<(), launcher::MoonlightLaunchVerificationFailure> {
    match current {
        MoonlightResolveOutcome::Available(resolved)
            if spec.transport_id == resolved.transport_id
                && spec.implementation == resolved.implementation
                && spec.sunshine_app == resolved.sunshine_app =>
        {
            authority.authorize(spec)
        }
        MoonlightResolveOutcome::Available(_) | MoonlightResolveOutcome::Unavailable(_) => {
            Err(launcher::MoonlightLaunchVerificationFailure::Stale)
        }
    }
}

fn session_route_context_unavailable() -> SessionControlFailure {
    SessionControlFailure {
        reason: SessionControlFailureReason::Unavailable,
        message: "Gameplay controls need a current active-session route and live executor state."
            .into(),
    }
}

fn materialize_session_controls(
    brain: &BrainRuntime,
    launch_id: &str,
) -> Result<
    (
        launcher::AndroidActiveLaunch,
        Vec<(plugin::SessionControlRecord, SessionControl)>,
        Vec<SessionControlGroup>,
    ),
    SessionControlFailure,
> {
    let active = brain
        .active_android_launch
        .lock()
        .expect("active Android launch mutex poisoned")
        .clone()
        .ok_or_else(session_route_context_unavailable)?;
    if active.launch_id != launch_id {
        return Err(SessionControlFailure {
            reason: SessionControlFailureReason::StaleSession,
            message: "The gameplay session changed. Reopen the overlay and try again.".into(),
        });
    }
    let executor_state = brain
        .moonlight_executor_state
        .lock()
        .expect("Moonlight executor state mutex poisoned")
        .clone()
        .filter(|executor| executor.launch_id == active.launch_id)
        .ok_or_else(session_route_context_unavailable)?;
    let executor_live = active
        .executor
        .as_ref()
        .is_some_and(|executor| executor.id == "android-moonlight" && executor_state.is_strict());
    if !executor_live {
        return Err(session_route_context_unavailable());
    }
    let snapshot = brain.config_snapshot.reload();
    if snapshot.authorization == config::snapshot::SnapshotAuthorization::Unauthorized {
        return Err(session_route_context_unavailable());
    }
    let registry = plugin_policy::registry_for_snapshot(&snapshot.snapshot)
        .map_err(|_| session_route_context_unavailable())?;
    let contributors = active
        .contributors
        .iter()
        .map(|contributor| config::resolver::RouteContribution {
            kind: match contributor.kind {
                launcher::LaunchContributorKind::Launcher => {
                    plugin::SessionControlOwnerKind::Launcher
                }
                launcher::LaunchContributorKind::Transport => {
                    plugin::SessionControlOwnerKind::Transport
                }
                launcher::LaunchContributorKind::Runtime => {
                    plugin::SessionControlOwnerKind::Runtime
                }
            },
            id: contributor.id.clone(),
        })
        .collect();
    let context = config::resolver::ActiveRouteContext {
        platform: config::resolver::RoutePlatform::Android,
        contributors,
        executor_availability: config::resolver::SessionExecutorAvailability::from_available([
            plugin::SessionControlExecutor::AndroidMoonlight,
        ]),
    };
    let mut materialized = Vec::new();
    for record in config::resolver::resolve_session_controls(&registry, &context) {
        let Some(effect) = record.effect.android_moonlight_effect() else {
            continue;
        };
        let Some(live) = executor_state
            .effect(effect)
            .filter(|entry| entry.fulfillable)
        else {
            continue;
        };
        let interaction = match (&record.interaction, &live.value) {
            (plugin::SessionControlDeclarationInteraction::Command, None) => {
                SessionControlInteraction::Command
            }
            (
                plugin::SessionControlDeclarationInteraction::Toggle,
                Some(SessionControlValue::Toggle(value)),
            ) => SessionControlInteraction::Toggle { value: *value },
            (
                plugin::SessionControlDeclarationInteraction::Choice { options },
                Some(SessionControlValue::Choice(value)),
            ) if options.iter().any(|option| option.value == *value) => {
                SessionControlInteraction::Choice {
                    value: value.clone(),
                    options: options
                        .iter()
                        .map(|option| SessionControlChoice {
                            value: option.value.clone(),
                            label: option.label.clone(),
                        })
                        .collect(),
                }
            }
            (
                plugin::SessionControlDeclarationInteraction::Range { min, max, step },
                Some(SessionControlValue::Range(value)),
            ) if valid_range_value(*value, *min, *max, *step) => SessionControlInteraction::Range {
                value: *value,
                min: *min,
                max: *max,
                step: *step,
            },
            _ => continue,
        };
        let control = SessionControl {
            id: record.id.clone(),
            label: record.label.clone(),
            description: record.description.clone(),
            enabled: true,
            disabled_reason: None,
            destructive: record.destructive,
            dismiss_on_success: record.dismiss_on_success,
            interaction,
        };
        materialized.push((record, control));
    }
    let mut groups: Vec<SessionControlGroup> = Vec::new();
    for (record, control) in &materialized {
        if let Some(group) = groups.iter_mut().find(|group| group.id == record.plugin_id) {
            group.controls.push(control.clone());
        } else {
            groups.push(SessionControlGroup {
                id: record.plugin_id.clone(),
                label: registry
                    .plugin_title(&record.plugin_id)
                    .unwrap_or(&record.plugin_id)
                    .to_owned(),
                controls: vec![control.clone()],
            });
        }
    }
    Ok((active, materialized, groups))
}

async fn dispatch(state: &AppState, request: RpcRequest) -> RpcResponse {
    match request {
        RpcRequest::CatalogSnapshot(_) => {
            let outcome = match &state.mode {
                ServerMode::Brain(brain) => brain
                    .upstream
                    .catalog_snapshot()
                    .await
                    .map(CatalogSnapshotOutcome::Ok)
                    .unwrap_or_else(|error| CatalogSnapshotOutcome::Err(upstream_failure(error))),
                ServerMode::Host(host) => host
                    .catalog_snapshot()
                    .map(CatalogSnapshotOutcome::Ok)
                    .unwrap_or_else(CatalogSnapshotOutcome::Err),
            };
            RpcResponse::CatalogSnapshot(outcome)
        }
        RpcRequest::MoonlightResolve(_) => {
            let outcome = match &state.mode {
                ServerMode::Brain(brain) => resolve_moonlight_outcome(
                    &brain.config_snapshot.reload(),
                    brain.native_platform,
                ),
                ServerMode::Host(_) => MoonlightResolveOutcome::Unavailable(RpcFailure {
                    code: "MoonlightUnavailable".into(),
                    message: "Artemis is available only at the Android edge".into(),
                }),
            };
            RpcResponse::MoonlightResolve(outcome)
        }
        RpcRequest::MoonlightLaunchPrepare(request) => {
            let outcome = match &state.mode {
                ServerMode::Brain(brain) => {
                    let mut authority = brain
                        .moonlight_launch_authority
                        .lock()
                        .expect("Moonlight launch authority poisoned");
                    match resolve_moonlight_outcome(
                        &brain.config_snapshot.reload(),
                        brain.native_platform,
                    ) {
                        MoonlightResolveOutcome::Available(resolved)
                            if !request.host_uuid.is_empty()
                                && request.app_id > 0
                                && request.app_id <= i32::MAX as u32 =>
                        {
                            let spec = authority.prepare(
                                resolved.transport_id,
                                resolved.implementation,
                                resolved.sunshine_app,
                                request.host_uuid,
                                request.app_id,
                                request.game_id,
                                request.title,
                            );
                            MoonlightLaunchPrepareOutcome::Ok(spec)
                        }
                        MoonlightResolveOutcome::Available(_) => {
                            MoonlightLaunchPrepareOutcome::Err(RpcFailure {
                                code: "InvalidMoonlightLaunchTarget".into(),
                                message:
                                    "Moonlight host UUID and positive Android app ID are required"
                                        .into(),
                            })
                        }
                        MoonlightResolveOutcome::Unavailable(failure) => {
                            MoonlightLaunchPrepareOutcome::Err(failure)
                        }
                    }
                }
                ServerMode::Host(_) => MoonlightLaunchPrepareOutcome::Err(RpcFailure {
                    code: "MoonlightUnavailable".into(),
                    message: "Artemis is available only at the Android edge".into(),
                }),
            };
            RpcResponse::MoonlightLaunchPrepare(outcome)
        }
        RpcRequest::MoonlightLaunchCancel(request) => {
            let outcome = match &state.mode {
                ServerMode::Brain(brain) => {
                    let cancelled = brain
                        .moonlight_launch_authority
                        .lock()
                        .expect("Moonlight launch authority poisoned")
                        .cancel(&request.launch_id);
                    if cancelled {
                        MoonlightLaunchCancelOutcome::Ok(MoonlightLaunchCancelled {
                            launch_id: request.launch_id,
                        })
                    } else {
                        MoonlightLaunchCancelOutcome::Err(RpcFailure {
                            code: "MoonlightLaunchReservationNotCurrent".into(),
                            message: "Moonlight launch reservation is not current and unused"
                                .into(),
                        })
                    }
                }
                ServerMode::Host(_) => MoonlightLaunchCancelOutcome::Err(RpcFailure {
                    code: "MoonlightUnavailable".into(),
                    message: "Artemis is available only at the Android edge".into(),
                }),
            };
            RpcResponse::MoonlightLaunchCancel(outcome)
        }
        RpcRequest::SessionPrepare(request) => {
            let outcome = match &state.mode {
                ServerMode::Brain(brain) => brain
                    .upstream
                    .prepare_stream(&request.game_id, request.host.as_deref())
                    .await
                    .map(SessionPrepareOutcome::Ok)
                    .unwrap_or_else(|error| SessionPrepareOutcome::Err(upstream_failure(error))),
                ServerMode::Host(host) => host
                    .prepare(&request.game_id)
                    .map(SessionPrepareOutcome::Ok)
                    .unwrap_or_else(SessionPrepareOutcome::Err),
            };
            RpcResponse::SessionPrepare(outcome)
        }
        RpcRequest::SessionStatus(_) => match &state.mode {
            ServerMode::Brain(brain) => RpcResponse::SessionStatus(session_status_outcome(
                brain.upstream.session_status().await,
            )),
            ServerMode::Host(_) => {
                RpcResponse::SessionStatus(SessionStatusOutcome::Err(RpcFailure {
                    code: "SessionStatusUnsupported".into(),
                    message: "host session status is not implemented".into(),
                }))
            }
        },
        RpcRequest::SessionStop(request) => match &state.mode {
            ServerMode::Brain(brain) => RpcResponse::SessionStop(session_stop_outcome(
                brain
                    .upstream
                    .session_stop(request.force.unwrap_or(false))
                    .await,
            )),
            ServerMode::Host(_) => RpcResponse::SessionStop(SessionStopOutcome::Err(RpcFailure {
                code: "SessionStopUnsupported".into(),
                message: "host session stop is not implemented".into(),
            })),
        },
        RpcRequest::SessionControls(request) => {
            let outcome = match &state.mode {
                ServerMode::Brain(brain) => materialize_session_controls(brain, &request.launch_id)
                    .map(|(active, _, groups)| SessionControls {
                        launch_id: active.launch_id,
                        title: active.title,
                        groups,
                    })
                    .map(SessionControlsOutcome::Ok)
                    .unwrap_or_else(SessionControlsOutcome::Err),
                ServerMode::Host(_) => {
                    SessionControlsOutcome::Err(session_route_context_unavailable())
                }
            };
            RpcResponse::SessionControls(outcome)
        }
        RpcRequest::SessionControlInvoke(request) => {
            let outcome = match &state.mode {
                ServerMode::Brain(brain) => {
                    let resolve = || materialize_session_controls(brain, &request.launch_id);
                    match resolve() {
                        Err(failure) => SessionControlInvokeOutcome::Err(failure),
                        Ok((active, materialized, _)) => {
                            let selected = materialized
                                .iter()
                                .find(|(_, control)| control.id == request.control_id);
                            match selected {
                                None => SessionControlInvokeOutcome::Err(SessionControlFailure {
                                    reason: SessionControlFailureReason::UnknownControl,
                                    message: "That gameplay control is no longer available.".into(),
                                }),
                                Some((_, control)) => {
                                    match validate_session_control_invocation(
                                        &active.launch_id,
                                        &request,
                                        control,
                                    ) {
                                        Err(failure) => SessionControlInvokeOutcome::Err(failure),
                                        Ok(()) => {
                                            match resolve() {
                                                Err(failure) => {
                                                    SessionControlInvokeOutcome::Err(failure)
                                                }
                                                Ok((current, latest, _)) => {
                                                    let selected =
                                                        latest.iter().find(|(_, control)| {
                                                            control.id == request.control_id
                                                        });
                                                    match selected {
                                                None => SessionControlInvokeOutcome::Err(
                                                    session_route_context_unavailable()),
                                                Some((record, control)) => match
                                                    validate_session_control_invocation(
                                                        &current.launch_id, &request, control)
                                                {
                                                    Err(failure) => SessionControlInvokeOutcome::Err(failure),
                                                    Ok(()) => {
                                                        let effect = record.effect.android_moonlight_effect()
                                                            .expect("Moonlight route effect");
                                                        let instruction = launcher::PlatformInstruction::protect(
                                                            current.launch_id,
                                                            control.id.clone(),
                                                            request.value.clone(),
                                                            launcher::PlatformEffect::AndroidMoonlight(effect),
                                                            &brain.local_launch_signing_key,
                                                        );
                                                        SessionControlInvokeOutcome::Ok(
                                                            SessionControlInvokeResult::PlatformInstruction(instruction))
                                                    }
                                                },
                                            }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                ServerMode::Host(_) => {
                    SessionControlInvokeOutcome::Err(session_route_context_unavailable())
                }
            };
            RpcResponse::SessionControlInvoke(outcome)
        }
        RpcRequest::LocalGamesList(_) => match &state.mode {
            ServerMode::Brain(brain) => {
                let config_state = brain.config_snapshot.reload();
                let registry = match plugin_policy::registry_for_snapshot(&config_state.snapshot) {
                    Ok(registry) => registry,
                    Err(error) => {
                        return RpcResponse::LocalGamesList(LocalGamesListOutcome::Err(
                            RpcFailure {
                                code: "PluginPolicyInvalid".into(),
                                message: error.to_string(),
                            },
                        ));
                    }
                };
                let catalog = launcher::local_games(&config_state, &registry);
                let mut failures = Vec::new();
                if let Some(diagnostic) = &config_state.diagnostic {
                    failures.push(snapshot_diagnostic_failure(diagnostic));
                }
                failures.extend(catalog.diagnostics.iter().map(route_diagnostic_failure));
                RpcResponse::LocalGamesList(LocalGamesListOutcome::Ok(LocalGames {
                    games: catalog.games,
                    failures: (!failures.is_empty()).then_some(failures),
                }))
            }
            ServerMode::Host(_) => {
                RpcResponse::LocalGamesList(LocalGamesListOutcome::Err(RpcFailure {
                    code: "OperationUnsupported".into(),
                    message: "local games are available only from the Android brain".into(),
                }))
            }
        },
        RpcRequest::LocalGameLaunch(request) => match &state.mode {
            ServerMode::Brain(brain) => {
                let config_state = brain.config_snapshot.reload();
                let registry = match plugin_policy::registry_for_snapshot(&config_state.snapshot) {
                    Ok(registry) => registry,
                    Err(error) => {
                        return RpcResponse::LocalGameLaunch(LocalGameLaunchOutcome::Err(
                            RpcFailure {
                                code: "PluginPolicyInvalid".into(),
                                message: error.to_string(),
                            },
                        ));
                    }
                };
                let outcome = launcher::launch_game(
                    &brain.local_storage_root,
                    &request.game_id,
                    brain.local_file_provision,
                    &config_state,
                    &registry,
                )
                .map(|spec| {
                    let signed = spec
                        .with_launch_id(generate_launch_id())
                        .sign(&brain.local_launch_signing_key);
                    brain
                        .local_launch_reservations
                        .lock()
                        .expect("local launch reservations poisoned")
                        .reserve(signed.launch_id.clone());
                    signed
                })
                .map(LocalGameLaunchOutcome::Ok)
                .unwrap_or_else(|error| LocalGameLaunchOutcome::Err(local_launch_failure(error)));
                RpcResponse::LocalGameLaunch(outcome)
            }
            ServerMode::Host(_) => {
                RpcResponse::LocalGameLaunch(LocalGameLaunchOutcome::Err(RpcFailure {
                    code: "OperationUnsupported".into(),
                    message: "local game launch is available only from the Android brain".into(),
                }))
            }
        },
        RpcRequest::Health(_) => RpcResponse::Health(HealthOutcome::Ok(Health {
            version: VERSION.into(),
        })),
        RpcRequest::SettingsSnapshot(_) => match &state.mode {
            ServerMode::Brain(brain) => RpcResponse::SettingsSnapshot(
                config::settings::read(&brain.local_storage_root)
                    .map(settings_snapshot)
                    .map(SettingsSnapshotOutcome::Ok)
                    .unwrap_or_else(|error| SettingsSnapshotOutcome::Err(settings_failure(error))),
            ),
            ServerMode::Host(_) => {
                RpcResponse::SettingsSnapshot(SettingsSnapshotOutcome::Err(RpcFailure {
                    code: "OperationUnsupported".into(),
                    message: "settings are available only from the Android brain".into(),
                }))
            }
        },
        RpcRequest::SettingsUpdate(request) => match &state.mode {
            ServerMode::Brain(brain) => {
                let _write = brain
                    .settings_write_lock
                    .lock()
                    .expect("settings write lock poisoned");
                let change = if request.setting_id == config::settings::DEVICE_NAME_SETTING_ID {
                    Ok(config::settings::SettingChange::DeviceName(request.value))
                } else {
                    request
                        .value
                        .parse::<bool>()
                        .map(|enabled| config::settings::SettingChange::PluginEnabled {
                            id: request.setting_id,
                            enabled,
                        })
                        .map_err(|_| {
                            config::settings::SettingsError::Invalid(
                                "plugin value must be true or false".into(),
                            )
                        })
                };
                let outcome = change.and_then(|change| {
                    config::settings::update(
                        &brain.local_storage_root,
                        &request.expected_revision,
                        change,
                    )
                });
                if outcome.is_ok() {
                    brain.config_snapshot.reload();
                }
                RpcResponse::SettingsUpdate(
                    outcome
                        .map(settings_snapshot)
                        .map(SettingsUpdateOutcome::Ok)
                        .unwrap_or_else(|error| {
                            SettingsUpdateOutcome::Err(settings_failure(error))
                        }),
                )
            }
            ServerMode::Host(_) => {
                RpcResponse::SettingsUpdate(SettingsUpdateOutcome::Err(RpcFailure {
                    code: "OperationUnsupported".into(),
                    message: "settings are available only from the Android brain".into(),
                }))
            }
        },
    }
}

fn settings_snapshot(settings: config::settings::ReadableSettings) -> SettingsSnapshot {
    SettingsSnapshot {
        revision: settings.revision,
        device_name: settings.device_name,
        plugins: settings
            .plugins
            .into_iter()
            .map(|plugin| PluginSetting {
                id: plugin.id,
                title: plugin.title,
                enabled: plugin.enabled,
            })
            .collect(),
    }
}

fn settings_failure(error: config::settings::SettingsError) -> RpcFailure {
    let code = match &error {
        config::settings::SettingsError::Conflict => "SettingsConflict",
        config::settings::SettingsError::Invalid(_) => "SettingsInvalid",
        config::settings::SettingsError::Storage(_) => "SettingsStorageUnavailable",
        config::settings::SettingsError::Candidate(_) => "SettingsCandidateInvalid",
    };
    RpcFailure {
        code: code.into(),
        message: error.to_string(),
    }
}

async fn rpc(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<RpcRequest>,
) -> Result<Json<RpcResponse>, StatusCode> {
    if let Some(capability) = &state.rpc_capability {
        let expected = format!("Bearer {capability}");
        if headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            != Some(expected.as_str())
        {
            return Err(StatusCode::UNAUTHORIZED);
        }
    }
    Ok(Json(dispatch(&state, request).await))
}

fn default_local_storage_root() -> PathBuf {
    std::env::var_os("KORRI_LOCAL_STORAGE_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir().join("korri"))
}

/// Build the localhost router protected by a per-server bearer capability.
/// The exact portal origin is the only browser origin allowed to send it.
pub fn router_with_capability(rpc_capability: &str, allowed_origin: &str) -> Router {
    router_with_capability_and_local_root(
        rpc_capability,
        allowed_origin,
        default_local_storage_root(),
    )
}

pub fn router_with_capability_and_local_root(
    rpc_capability: &str,
    allowed_origin: &str,
    local_storage_root: impl AsRef<Path>,
) -> Router {
    let local_storage_root = local_storage_root.as_ref().to_owned();
    let signing_key = generate_launch_signing_key();
    let local_launch_reservations =
        Arc::new(Mutex::new(launcher::LaunchPublicationReservations::new()));
    let moonlight_launch_authority = Arc::new(Mutex::new(launcher::MoonlightLaunchAuthority::new(
        signing_key.clone(),
    )));
    let config_snapshot = config::snapshot::ConfigSnapshotCoordinator::new(&local_storage_root);
    router_with_capability_local_root_and_provision(
        rpc_capability,
        allowed_origin,
        local_storage_root,
        launcher::FileProvisionMode::Direct,
        signing_key,
        local_launch_reservations,
        moonlight_launch_authority,
        Arc::new(Mutex::new(None)),
        Arc::new(Mutex::new(None)),
        NativePlatform::Standalone,
        config_snapshot,
    )
}

/** Test-only Android router. Production selects this platform only through
 * the Android-gated JNI server entrypoint. */
#[cfg(test)]
fn android_router_with_capability_and_local_root(
    rpc_capability: &str,
    allowed_origin: &str,
    local_storage_root: impl AsRef<Path>,
) -> Router {
    let local_storage_root = local_storage_root.as_ref().to_owned();
    let signing_key = generate_launch_signing_key();
    let local_launch_reservations =
        Arc::new(Mutex::new(launcher::LaunchPublicationReservations::new()));
    let moonlight_launch_authority = Arc::new(Mutex::new(launcher::MoonlightLaunchAuthority::new(
        signing_key.clone(),
    )));
    let config_snapshot = config::snapshot::ConfigSnapshotCoordinator::new(&local_storage_root);
    router_with_capability_local_root_and_provision(
        rpc_capability,
        allowed_origin,
        local_storage_root,
        launcher::FileProvisionMode::Deferred,
        signing_key,
        local_launch_reservations,
        moonlight_launch_authority,
        Arc::new(Mutex::new(None)),
        Arc::new(Mutex::new(None)),
        NativePlatform::EmbeddedAndroid,
        config_snapshot,
    )
}

fn router_with_capability_local_root_and_provision(
    rpc_capability: &str,
    allowed_origin: &str,
    local_storage_root: impl AsRef<Path>,
    local_file_provision: launcher::FileProvisionMode,
    local_launch_signing_key: Vec<u8>,
    local_launch_reservations: Arc<Mutex<launcher::LaunchPublicationReservations>>,
    moonlight_launch_authority: Arc<Mutex<launcher::MoonlightLaunchAuthority>>,
    active_android_launch: Arc<Mutex<Option<launcher::AndroidActiveLaunch>>>,
    moonlight_executor_state: Arc<Mutex<Option<MoonlightExecutorState>>>,
    native_platform: NativePlatform,
    config_snapshot: config::snapshot::ConfigSnapshotCoordinator,
) -> Router {
    let local_storage_root = local_storage_root.as_ref().to_owned();
    let state = AppState {
        mode: ServerMode::Brain(BrainRuntime {
            upstream: upstreams::UpstreamRegistry::from_env_or_file(
                &local_storage_root.join("upstreams.json"),
            ),
            local_storage_root,
            local_file_provision,
            local_launch_signing_key,
            local_launch_reservations,
            moonlight_launch_authority,
            active_android_launch,
            moonlight_executor_state,
            native_platform,
            config_snapshot,
            settings_write_lock: Arc::new(Mutex::new(())),
        }),
        rpc_capability: Some(rpc_capability.into()),
    };
    let configured_origin: HeaderValue = allowed_origin
        .parse()
        .expect("allowed portal origin must be a valid header value");
    let allowed_origins = if native_platform == NativePlatform::EmbeddedAndroid {
        let bundled_origin = HeaderValue::from_static(ANDROID_BUNDLED_PORTAL_ORIGIN);
        let mut origins = vec![configured_origin];
        if origins[0] != bundled_origin {
            origins.push(bundled_origin);
        }
        tower_http::cors::AllowOrigin::list(origins)
    } else {
        tower_http::cors::AllowOrigin::exact(configured_origin)
    };
    let cors = tower_http::cors::CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods([Method::POST])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);
    Router::new()
        .route("/rpc", post(rpc))
        .layer(cors)
        .with_state(state)
}

/// Build the LAN-facing native host router. Host RPC is intentionally open
/// for this trusted-network slice; the brain router remains capability-bound.
pub fn host_router(config_path: impl AsRef<Path>) -> Router {
    host_router_with_storage(config_path, None::<PathBuf>)
}

pub fn host_router_with_storage(
    config_path: impl AsRef<Path>,
    storage_root: Option<impl Into<PathBuf>>,
) -> Router {
    let state = AppState {
        mode: ServerMode::Host(host::HostRuntime::from_paths(
            config_path.as_ref(),
            storage_root.map(Into::into),
        )),
        rpc_capability: None,
    };
    Router::new().route("/rpc", post(rpc)).with_state(state)
}

/// Generate an unguessable capability for one server lifetime.
pub fn generate_rpc_capability() -> String {
    let bytes: [u8; 32] = rand::random();
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/** Create the identity korrid carries through one prepared launch. */
pub fn generate_launch_id() -> String {
    let bytes: [u8; 16] = rand::random();
    hex::encode(bytes)
}

fn generate_launch_signing_key() -> Vec<u8> {
    let bytes: [u8; 32] = rand::random();
    bytes.to_vec()
}

#[derive(Debug, thiserror::Error)]
pub enum ServerError {
    #[error("korrid server is already running")]
    AlreadyRunning,
    #[error("korrid server is not running")]
    NotRunning,
    #[error("failed to start korrid server: {details}")]
    StartFailed { details: String },
}

struct ServerHandle {
    port: u16,
    rpc_capability: String,
    launch_signing_key: Vec<u8>,
    local_launch_reservations: Arc<Mutex<launcher::LaunchPublicationReservations>>,
    active_android_launch: Arc<Mutex<Option<launcher::AndroidActiveLaunch>>>,
    moonlight_executor_state: Arc<Mutex<Option<MoonlightExecutorState>>>,
    platform_instruction_verifier: Option<launcher::PlatformInstructionVerifier>,
    moonlight_launch_authority: Arc<Mutex<launcher::MoonlightLaunchAuthority>>,
    moonlight_config_snapshot: config::snapshot::ConfigSnapshotCoordinator,
    native_platform: NativePlatform,
    stop: oneshot::Sender<()>,
    thread: JoinHandle<()>,
}

static SERVER: OnceLock<Mutex<Option<ServerHandle>>> = OnceLock::new();

fn server_slot() -> &'static Mutex<Option<ServerHandle>> {
    SERVER.get_or_init(|| Mutex::new(None))
}

pub fn korrid_version() -> String {
    VERSION.into()
}

/// Starts the standalone localhost brain. Platform-native integrations are
/// unavailable through this public host entrypoint.
pub fn start_local_server(
    allowed_origin: &str,
    local_storage_root: &str,
) -> Result<u16, ServerError> {
    start_local_server_for_platform(
        allowed_origin,
        local_storage_root,
        NativePlatform::Standalone,
    )
}

/** Android production reaches Artemis only through this target-gated JNI
 * entrypoint, never through caller-provided platform data. */
#[cfg(target_os = "android")]
pub(crate) fn start_embedded_android_server(
    allowed_origin: &str,
    local_storage_root: &str,
) -> Result<u16, ServerError> {
    start_local_server_for_platform(
        allowed_origin,
        local_storage_root,
        NativePlatform::EmbeddedAndroid,
    )
}

fn start_local_server_for_platform(
    allowed_origin: &str,
    local_storage_root: &str,
    native_platform: NativePlatform,
) -> Result<u16, ServerError> {
    let mut slot = server_slot().lock().expect("server mutex poisoned");
    if slot.is_some() {
        return Err(ServerError::AlreadyRunning);
    }

    let listener =
        StdTcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0)).map_err(|error| {
            ServerError::StartFailed {
                details: error.to_string(),
            }
        })?;
    listener
        .set_nonblocking(true)
        .map_err(|error| ServerError::StartFailed {
            details: error.to_string(),
        })?;
    let port = listener
        .local_addr()
        .map_err(|error| ServerError::StartFailed {
            details: error.to_string(),
        })?
        .port();
    let rpc_capability = generate_rpc_capability();
    let server_capability = rpc_capability.clone();
    let launch_signing_key = generate_launch_signing_key();
    let server_signing_key = launch_signing_key.clone();
    let local_launch_reservations =
        Arc::new(Mutex::new(launcher::LaunchPublicationReservations::new()));
    let server_local_launch_reservations = Arc::clone(&local_launch_reservations);
    let moonlight_launch_authority = Arc::new(Mutex::new(launcher::MoonlightLaunchAuthority::new(
        launch_signing_key.clone(),
    )));
    let server_moonlight_launch_authority = Arc::clone(&moonlight_launch_authority);
    let active_android_launch = Arc::new(Mutex::new(None));
    let router_active_android_launch = Arc::clone(&active_android_launch);
    let moonlight_executor_state = Arc::new(Mutex::new(None));
    let router_moonlight_executor_state = Arc::clone(&moonlight_executor_state);
    let allowed_origin = allowed_origin.to_owned();
    let local_storage_root = local_storage_root.to_owned();
    let moonlight_config_snapshot =
        config::snapshot::ConfigSnapshotCoordinator::new(&local_storage_root);
    let server_config_snapshot = moonlight_config_snapshot.clone();
    let (stop, stopped) = oneshot::channel();
    let thread = std::thread::Builder::new()
        .name("korrid".into())
        .spawn(move || {
            let runtime = tokio::runtime::Runtime::new().expect("create Tokio runtime");
            runtime.block_on(async move {
                let listener = tokio::net::TcpListener::from_std(listener)
                    .expect("convert localhost listener");
                axum::serve(
                    listener,
                    router_with_capability_local_root_and_provision(
                        &server_capability,
                        &allowed_origin,
                        &local_storage_root,
                        launcher::FileProvisionMode::Deferred,
                        server_signing_key,
                        server_local_launch_reservations,
                        server_moonlight_launch_authority,
                        router_active_android_launch,
                        router_moonlight_executor_state,
                        native_platform,
                        server_config_snapshot,
                    ),
                )
                .with_graceful_shutdown(async {
                    let _ = stopped.await;
                })
                .await
                .expect("serve korrid");
            });
        })
        .map_err(|error| ServerError::StartFailed {
            details: error.to_string(),
        })?;

    *slot = Some(ServerHandle {
        port,
        rpc_capability,
        launch_signing_key,
        local_launch_reservations,
        active_android_launch,
        moonlight_executor_state,
        platform_instruction_verifier: None,
        moonlight_launch_authority,
        moonlight_config_snapshot,
        native_platform,
        stop,
        thread,
    });
    Ok(port)
}

pub fn stop_local_server() -> Result<(), ServerError> {
    let handle = server_slot()
        .lock()
        .expect("server mutex poisoned")
        .take()
        .ok_or(ServerError::NotRunning)?;
    let _ = handle.stop.send(());
    handle.thread.join().map_err(|_| ServerError::StartFailed {
        details: "server thread panicked".into(),
    })?;
    Ok(())
}

pub fn local_server_port() -> Option<u16> {
    server_slot()
        .lock()
        .expect("server mutex poisoned")
        .as_ref()
        .map(|server| server.port)
}

pub fn local_server_capability() -> Option<String> {
    server_slot()
        .lock()
        .expect("server mutex poisoned")
        .as_ref()
        .map(|server| server.rpc_capability.clone())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ActiveAndroidLaunchFailure {
    InvalidSpec,
    Integrity,
    Stale,
    NotStarted,
    AlreadyPublished,
    ServerUnavailable,
}

fn active_launch_reservation_failure(
    failure: launcher::LaunchPublicationReservationFailure,
) -> ActiveAndroidLaunchFailure {
    match failure {
        launcher::LaunchPublicationReservationFailure::Stale => ActiveAndroidLaunchFailure::Stale,
        launcher::LaunchPublicationReservationFailure::NotStarted => {
            ActiveAndroidLaunchFailure::NotStarted
        }
        launcher::LaunchPublicationReservationFailure::AlreadyPublished
        | launcher::LaunchPublicationReservationFailure::Replay => {
            ActiveAndroidLaunchFailure::AlreadyPublished
        }
    }
}

fn publish_verified_android_launch(
    server: &mut ServerHandle,
    launch: launcher::AndroidActiveLaunch,
) -> launcher::AndroidActiveLaunch {
    let same_launch = server
        .active_android_launch
        .lock()
        .expect("active Android launch mutex poisoned")
        .as_ref()
        .is_some_and(|active| active.launch_id == launch.launch_id);
    if !same_launch {
        server.platform_instruction_verifier = Some(launcher::PlatformInstructionVerifier::new(
            launch.launch_id.clone(),
        ));
    }
    *server
        .active_android_launch
        .lock()
        .expect("active Android launch mutex poisoned") = Some(launch.clone());
    launch
}

/** Publish signed local context only after Java reports Android start success. */
pub fn publish_local_active_launch(
    spec_json: &str,
) -> Result<launcher::AndroidActiveLaunch, ActiveAndroidLaunchFailure> {
    let spec = serde_json::from_str::<launcher::LaunchSpec>(spec_json)
        .map_err(|_| ActiveAndroidLaunchFailure::InvalidSpec)?;
    let mut slot = server_slot().lock().expect("server mutex poisoned");
    let server = slot
        .as_mut()
        .ok_or(ActiveAndroidLaunchFailure::ServerUnavailable)?;
    if !spec.verify(&server.launch_signing_key) {
        return Err(ActiveAndroidLaunchFailure::Integrity);
    }
    if spec.context.foreground.kind == launcher::LaunchForegroundKind::ArtemisGame {
        return Err(ActiveAndroidLaunchFailure::InvalidSpec);
    }
    server
        .local_launch_reservations
        .lock()
        .expect("local launch reservations poisoned")
        .publish(&spec.launch_id)
        .map_err(active_launch_reservation_failure)?;
    Ok(publish_verified_android_launch(
        server,
        launcher::AndroidActiveLaunch::from_context(spec.launch_id, spec.context),
    ))
}

/** Publish a signed Moonlight context. Rust signs an Artemis marker; Java is
 * the authority for its own application package and Game component names. */
pub fn publish_moonlight_active_launch(
    spec_json: &str,
    application_package: &str,
    game_class_name: &str,
) -> Result<launcher::AndroidActiveLaunch, ActiveAndroidLaunchFailure> {
    if application_package.is_empty() || game_class_name.is_empty() {
        return Err(ActiveAndroidLaunchFailure::InvalidSpec);
    }
    let spec = serde_json::from_str::<launcher::MoonlightLaunchSpec>(spec_json)
        .map_err(|_| ActiveAndroidLaunchFailure::InvalidSpec)?;
    let mut slot = server_slot().lock().expect("server mutex poisoned");
    let server = slot
        .as_mut()
        .ok_or(ActiveAndroidLaunchFailure::ServerUnavailable)?;
    if !spec.verify(&server.launch_signing_key)
        || spec.context.foreground.kind != launcher::LaunchForegroundKind::ArtemisGame
    {
        return Err(ActiveAndroidLaunchFailure::Integrity);
    }
    server
        .moonlight_launch_authority
        .lock()
        .expect("Moonlight launch authority poisoned")
        .publish(&spec)
        .map_err(active_launch_reservation_failure)?;
    let mut context = spec.context;
    context.foreground = launcher::LaunchForegroundRule {
        kind: launcher::LaunchForegroundKind::Component,
        package_name: Some(application_package.to_owned()),
        class_name: Some(game_class_name.to_owned()),
    };
    Ok(publish_verified_android_launch(
        server,
        launcher::AndroidActiveLaunch::from_context(spec.launch_id, context),
    ))
}

pub fn active_android_launch() -> Option<launcher::AndroidActiveLaunch> {
    server_slot()
        .lock()
        .expect("server mutex poisoned")
        .as_ref()
        .and_then(|server| {
            server
                .active_android_launch
                .lock()
                .expect("active Android launch mutex poisoned")
                .clone()
        })
}

/** Late end evidence for A cannot clear replacement B. */
pub fn clear_active_android_launch(launch_id: &str) -> bool {
    let mut slot = server_slot().lock().expect("server mutex poisoned");
    let Some(server) = slot.as_mut() else {
        return false;
    };
    let mut active = server
        .active_android_launch
        .lock()
        .expect("active Android launch mutex poisoned");
    if active
        .as_ref()
        .is_none_or(|current| current.launch_id != launch_id)
    {
        return false;
    }
    *active = None;
    drop(active);
    *server
        .moonlight_executor_state
        .lock()
        .expect("Moonlight executor state mutex poisoned") = None;
    server.platform_instruction_verifier = None;
    true
}

pub fn publish_moonlight_executor_state(state_json: &str) -> bool {
    let Ok(state) = serde_json::from_str::<MoonlightExecutorState>(state_json) else {
        return false;
    };
    if !state.is_strict() {
        return false;
    }
    let mut slot = server_slot().lock().expect("server mutex poisoned");
    let Some(server) = slot.as_mut() else {
        return false;
    };
    let active = server
        .active_android_launch
        .lock()
        .expect("active Android launch mutex poisoned");
    let current = active.as_ref().is_some_and(|launch| {
        launch.launch_id == state.launch_id
            && launch
                .executor
                .as_ref()
                .is_some_and(|executor| executor.id == "android-moonlight")
    });
    drop(active);
    if !current {
        return false;
    }
    *server
        .moonlight_executor_state
        .lock()
        .expect("Moonlight executor state mutex poisoned") = Some(state);
    true
}

pub fn clear_moonlight_executor_state(launch_id: &str) -> bool {
    let mut slot = server_slot().lock().expect("server mutex poisoned");
    let Some(server) = slot.as_mut() else {
        return false;
    };
    let mut state = server
        .moonlight_executor_state
        .lock()
        .expect("Moonlight executor state mutex poisoned");
    if state
        .as_ref()
        .is_none_or(|current| current.launch_id != launch_id)
    {
        return false;
    }
    *state = None;
    true
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizedPlatformInstruction {
    pub launch_id: String,
    pub effect: launcher::AndroidMoonlightEffect,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<SessionControlValue>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum PlatformInstructionAuthorization {
    Authorized(AuthorizedPlatformInstruction),
    InvalidSpec,
    Integrity,
    Stale,
    Replay,
    NoActiveLaunch,
    ExecutorUnavailable,
    ServerUnavailable,
}

/** Verify, consume once, and return only the closed authorized effect/value. */
pub fn authorize_platform_instruction(instruction_json: &str) -> PlatformInstructionAuthorization {
    let Ok(instruction) = serde_json::from_str::<launcher::PlatformInstruction>(instruction_json)
    else {
        return PlatformInstructionAuthorization::InvalidSpec;
    };
    let mut slot = server_slot().lock().expect("server mutex poisoned");
    let Some(server) = slot.as_mut() else {
        return PlatformInstructionAuthorization::ServerUnavailable;
    };
    let Some(verifier) = server.platform_instruction_verifier.as_mut() else {
        return PlatformInstructionAuthorization::NoActiveLaunch;
    };
    if let Err(failure) = verifier.authorize(&instruction, &server.launch_signing_key) {
        return match failure {
            launcher::PlatformInstructionVerificationFailure::Integrity => {
                PlatformInstructionAuthorization::Integrity
            }
            launcher::PlatformInstructionVerificationFailure::StaleSession => {
                PlatformInstructionAuthorization::Stale
            }
            launcher::PlatformInstructionVerificationFailure::Replay => {
                PlatformInstructionAuthorization::Replay
            }
        };
    }
    let effect = match instruction.effect {
        launcher::PlatformEffect::AndroidMoonlight(effect) => effect,
    };
    let live = server
        .moonlight_executor_state
        .lock()
        .expect("Moonlight executor state mutex poisoned");
    if live
        .as_ref()
        .filter(|state| state.launch_id == instruction.launch_id)
        .and_then(|state| state.effect(effect))
        .is_none_or(|entry| !entry.fulfillable)
    {
        return PlatformInstructionAuthorization::ExecutorUnavailable;
    }
    PlatformInstructionAuthorization::Authorized(AuthorizedPlatformInstruction {
        launch_id: instruction.launch_id,
        effect,
        value: instruction.value,
    })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MoonlightLaunchAuthorization {
    Authorized,
    InvalidSpec,
    Integrity,
    Stale,
    Replay,
    ServerUnavailable,
}

/** Verify and atomically consume a signed Moonlight startup instruction. */
pub fn authorize_moonlight_launch_spec(spec_json: &str) -> MoonlightLaunchAuthorization {
    let Ok(spec) = serde_json::from_str::<launcher::MoonlightLaunchSpec>(spec_json) else {
        return MoonlightLaunchAuthorization::InvalidSpec;
    };
    let Some((authority, config_snapshot, native_platform)) = server_slot()
        .lock()
        .expect("server mutex poisoned")
        .as_ref()
        .map(|server| {
            (
                Arc::clone(&server.moonlight_launch_authority),
                server.moonlight_config_snapshot.clone(),
                server.native_platform,
            )
        })
    else {
        return MoonlightLaunchAuthorization::ServerUnavailable;
    };
    let mut authority = authority
        .lock()
        .expect("Moonlight launch authority poisoned");
    let verification = authorize_moonlight_launch_against_current_policy(
        &mut authority,
        &spec,
        resolve_moonlight_outcome(&config_snapshot.reload(), native_platform),
    );
    match verification {
        Ok(()) => MoonlightLaunchAuthorization::Authorized,
        Err(launcher::MoonlightLaunchVerificationFailure::Integrity) => {
            MoonlightLaunchAuthorization::Integrity
        }
        Err(launcher::MoonlightLaunchVerificationFailure::Stale) => {
            MoonlightLaunchAuthorization::Stale
        }
        Err(launcher::MoonlightLaunchVerificationFailure::Replay) => {
            MoonlightLaunchAuthorization::Replay
        }
    }
}

/// Verify and consume the latest launcher-neutral reservation before Android starts it.
pub fn verify_local_launch_spec(spec_json: &str) -> bool {
    let Ok(spec) = serde_json::from_str::<launcher::LaunchSpec>(spec_json) else {
        return false;
    };
    let slot = server_slot().lock().expect("server mutex poisoned");
    let Some(server) = slot.as_ref() else {
        return false;
    };
    if !spec.verify(&server.launch_signing_key) {
        return false;
    }
    let authorized = server
        .local_launch_reservations
        .lock()
        .expect("local launch reservations poisoned")
        .authorize(&spec.launch_id)
        .is_ok();
    authorized
}

pub mod host;
pub mod launcher;
pub mod plugin;
pub mod plugin_policy;
pub mod script;
pub mod upstream;
pub mod upstream_native;
pub mod upstreams;

#[cfg(target_os = "android")]
mod android;

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::{header, Request, StatusCode},
    };
    use tower::ServiceExt;

    const WL4_PLUGIN_LIBRARY: &str =
        include_str!("../../../docs/research/retroarch-plugin-route/library-wl4.yaml");

    fn write_wl4_plugin_config(root: &Path) {
        std::fs::write(root.join("config.yaml"), "{}\n").unwrap();
        std::fs::write(root.join("library.yaml"), WL4_PLUGIN_LIBRARY).unwrap();
    }

    fn control(interaction: SessionControlInteraction) -> SessionControl {
        SessionControl {
            id: "control".into(),
            label: "Control".into(),
            description: None,
            enabled: true,
            disabled_reason: None,
            destructive: false,
            dismiss_on_success: false,
            interaction,
        }
    }

    fn invocation(value: Option<SessionControlValue>) -> SessionControlInvokeRequest {
        SessionControlInvokeRequest {
            launch_id: "current".into(),
            control_id: "control".into(),
            value,
        }
    }

    fn moonlight_executor_state(launch_id: &str) -> MoonlightExecutorState {
        use launcher::AndroidMoonlightEffect as Effect;
        let value = |effect| match effect {
            Effect::SetFillMode
            | Effect::SetZoomMode
            | Effect::SetFaceButtonFlip
            | Effect::SetPictureInPicture => Some(SessionControlValue::Toggle(false)),
            Effect::SetRumble => Some(SessionControlValue::Toggle(true)),
            Effect::SetMouseMode => Some(SessionControlValue::Choice("0".into())),
            Effect::SetSgsrSharpness => Some(SessionControlValue::Range(20.0)),
            Effect::SetSgsrEdgeThreshold => Some(SessionControlValue::Range(8.0)),
            _ => None,
        };
        let effects = [
            Effect::Disconnect,
            Effect::QuitHost,
            Effect::ToggleKeyboard,
            Effect::ToggleFullKeyboard,
            Effect::SetFillMode,
            Effect::SetZoomMode,
            Effect::RotateScreen,
            Effect::ToggleHud,
            Effect::ToggleFloatingMenu,
            Effect::ToggleKeyboardController,
            Effect::SwitchTouchSensitivity,
            Effect::SetMouseMode,
            Effect::SetLocalCursor,
            Effect::SetSgsrEdgeThreshold,
            Effect::SetSgsrSharpness,
            Effect::SetFaceButtonFlip,
            Effect::SetRumble,
            Effect::SetPictureInPicture,
        ]
        .into_iter()
        .map(|effect| MoonlightExecutorEffectState {
            effect,
            fulfillable: true,
            value: value(effect),
        })
        .collect();
        MoonlightExecutorState {
            launch_id: launch_id.into(),
            effects,
        }
    }

    #[test]
    fn native_moonlight_authority_rejects_a_changed_plugin_owned_app_without_consuming() {
        let mut authority = launcher::MoonlightLaunchAuthority::new(b"test signing key".to_vec());
        let spec = authority.prepare(
            "@korri:moonlight/moonlight",
            MoonlightImplementation::Artemis,
            "Korri Stream",
            "host-uuid",
            7,
            None,
            None,
        );
        let changed = MoonlightResolveOutcome::Available(ResolvedMoonlight {
            transport_id: "@korri:moonlight/moonlight".into(),
            implementation: MoonlightImplementation::Artemis,
            sunshine_app: "Renamed Stream App".into(),
        });
        assert_eq!(
            authorize_moonlight_launch_against_current_policy(&mut authority, &spec, changed),
            Err(launcher::MoonlightLaunchVerificationFailure::Stale)
        );

        let original = MoonlightResolveOutcome::Available(ResolvedMoonlight {
            transport_id: "@korri:moonlight/moonlight".into(),
            implementation: MoonlightImplementation::Artemis,
            sunshine_app: "Korri Stream".into(),
        });
        assert!(
            authorize_moonlight_launch_against_current_policy(&mut authority, &spec, original)
                .is_ok()
        );
    }

    #[tokio::test]
    async fn embedded_android_test_router_resolves_artemis_and_honors_current_user_policy() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("config.yaml"), "{}\n").unwrap();
        std::fs::write(root.path().join("library.yaml"), "{}\n").unwrap();
        let app = android_router_with_capability_and_local_root(
            "right-token",
            "https://portal.example",
            root.path(),
        );
        let request = || {
            Request::builder()
                .method("POST")
                .uri("/rpc")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::AUTHORIZATION, "Bearer right-token")
                .body(Body::from(
                    r#"{"_tag":"app.moonlight.resolve","payload":{}}"#,
                ))
                .unwrap()
        };
        let outcome =
            |body: axum::body::Bytes| serde_json::from_slice::<serde_json::Value>(&body).unwrap();

        let response = app.clone().oneshot(request()).await.unwrap();
        let body = outcome(to_bytes(response.into_body(), usize::MAX).await.unwrap());
        assert_eq!(body["outcome"]["_tag"], "Available");
        assert_eq!(body["outcome"]["payload"]["implementation"], "artemis");

        for payload in [
            r#"{"hostUuid":"","appId":7}"#,
            r#"{"hostUuid":"host-uuid","appId":0}"#,
            r#"{"hostUuid":"host-uuid","appId":2147483648}"#,
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/rpc")
                        .header(header::CONTENT_TYPE, "application/json")
                        .header(header::AUTHORIZATION, "Bearer right-token")
                        .body(Body::from(format!(
                            r#"{{"_tag":"app.moonlight.launch.prepare","payload":{payload}}}"#
                        )))
                        .unwrap(),
                )
                .await
                .unwrap();
            let body = outcome(to_bytes(response.into_body(), usize::MAX).await.unwrap());
            assert_eq!(body["outcome"]["_tag"], "Err");
            assert_eq!(
                body["outcome"]["payload"]["code"],
                "InvalidMoonlightLaunchTarget"
            );
        }

        std::fs::write(
            root.path().join("config.yaml"),
            "host:\n  plugin:\n    '@korri:moonlight': false\n",
        )
        .unwrap();
        let response = app.oneshot(request()).await.unwrap();
        let body = outcome(to_bytes(response.into_body(), usize::MAX).await.unwrap());
        assert_eq!(body["outcome"]["_tag"], "Unavailable");
    }

    #[test]
    fn moonlight_resolution_withholds_retained_snapshot_while_unauthorized() {
        let state = config::snapshot::ConfigSnapshotState {
            snapshot: Arc::new(config::ConfigSnapshot::default()),
            generation: 1,
            diagnostic: Some(config::snapshot::SnapshotDiagnostic {
                code: config::snapshot::SnapshotDiagnosticCode::LocalConfigUnauthorized,
                message: "configured storage denial".into(),
            }),
            authorization: config::snapshot::SnapshotAuthorization::Unauthorized,
        };

        let outcome = resolve_moonlight_outcome(&state, NativePlatform::EmbeddedAndroid);
        let MoonlightResolveOutcome::Unavailable(failure) = outcome else {
            panic!("retained Moonlight declaration must be withheld");
        };
        assert_eq!(failure.code, "LocalConfigUnauthorized");
    }

    fn assert_invalid_range(interaction: SessionControlInteraction, submitted: f64) {
        assert_eq!(
            validate_session_control_invocation(
                "current",
                &invocation(Some(SessionControlValue::Range(submitted))),
                &control(interaction),
            )
            .expect_err("range invocation must be rejected")
            .reason,
            SessionControlFailureReason::InvalidValue
        );
    }

    #[test]
    fn session_control_values_are_validated_before_effect_resolution() {
        assert!(validate_session_control_invocation(
            "current",
            &invocation(None),
            &control(SessionControlInteraction::Command),
        )
        .is_ok());
        assert!(validate_session_control_invocation(
            "current",
            &invocation(Some(SessionControlValue::Toggle(true))),
            &control(SessionControlInteraction::Toggle { value: false }),
        )
        .is_ok());
        assert!(validate_session_control_invocation(
            "current",
            &invocation(Some(SessionControlValue::Choice("direct".into()))),
            &control(SessionControlInteraction::Choice {
                value: "trackpad".into(),
                options: vec![
                    SessionControlChoice {
                        value: "trackpad".into(),
                        label: "Trackpad".into(),
                    },
                    SessionControlChoice {
                        value: "direct".into(),
                        label: "Direct".into(),
                    },
                ],
            }),
        )
        .is_ok());
        assert!(validate_session_control_invocation(
            "current",
            &invocation(Some(SessionControlValue::Range(55.0))),
            &control(SessionControlInteraction::Range {
                value: 50.0,
                min: 0.0,
                max: 100.0,
                step: 5.0,
            }),
        )
        .is_ok());
    }

    #[test]
    fn range_validation_rejects_large_step_off_grid_values() {
        assert_invalid_range(
            SessionControlInteraction::Range {
                value: 0.0,
                min: 0.0,
                max: 2_000_000_000_000.0,
                step: 1_000_000_000_000.0,
            },
            1.0,
        );
    }

    #[test]
    fn range_validation_bounds_grid_tolerance_for_translated_large_ranges() {
        let min = 1_000_000_000_000_000.0;
        let interaction = SessionControlInteraction::Range {
            value: min,
            min,
            max: min + 10.0,
            step: 1.0,
        };

        assert_invalid_range(interaction.clone(), min + 0.5);
        for submitted in [min, min + 1.0, min + 10.0] {
            assert!(validate_session_control_invocation(
                "current",
                &invocation(Some(SessionControlValue::Range(submitted))),
                &control(interaction.clone()),
            )
            .is_ok());
        }
    }

    #[test]
    fn range_validation_rejects_steps_that_cannot_advance_from_min() {
        let min = 1_000_000_000_000_000.0;
        assert_invalid_range(
            SessionControlInteraction::Range {
                value: min,
                min,
                max: min + 10.0,
                step: 0.01,
            },
            min,
        );
    }

    #[test]
    fn range_validation_rejects_malformed_metadata_and_values() {
        let malformed = [
            SessionControlInteraction::Range {
                value: f64::NAN,
                min: 0.0,
                max: 10.0,
                step: 1.0,
            },
            SessionControlInteraction::Range {
                value: 5.0,
                min: f64::NEG_INFINITY,
                max: 10.0,
                step: 1.0,
            },
            SessionControlInteraction::Range {
                value: 5.0,
                min: 0.0,
                max: f64::INFINITY,
                step: 1.0,
            },
            SessionControlInteraction::Range {
                value: 5.0,
                min: 0.0,
                max: 10.0,
                step: f64::NAN,
            },
            SessionControlInteraction::Range {
                value: 5.0,
                min: 0.0,
                max: 10.0,
                step: 0.0,
            },
            SessionControlInteraction::Range {
                value: 5.0,
                min: 0.0,
                max: 10.0,
                step: -1.0,
            },
            SessionControlInteraction::Range {
                value: 5.0,
                min: 10.0,
                max: 0.0,
                step: 1.0,
            },
            SessionControlInteraction::Range {
                value: 11.0,
                min: 0.0,
                max: 10.0,
                step: 1.0,
            },
            SessionControlInteraction::Range {
                value: 5.5,
                min: 0.0,
                max: 10.0,
                step: 1.0,
            },
        ];
        for interaction in malformed {
            assert_invalid_range(interaction, 5.0);
        }

        let valid_metadata = SessionControlInteraction::Range {
            value: 5.0,
            min: 0.0,
            max: 10.0,
            step: 1.0,
        };
        for submitted in [f64::NAN, f64::NEG_INFINITY, f64::INFINITY, 5.5] {
            assert_invalid_range(valid_metadata.clone(), submitted);
        }
    }

    #[test]
    fn range_validation_preserves_exact_endpoints_and_decimal_steps() {
        let endpoint_range = control(SessionControlInteraction::Range {
            value: 10.0,
            min: 0.0,
            max: 10.0,
            step: 3.0,
        });
        for submitted in [0.0, 10.0] {
            assert!(validate_session_control_invocation(
                "current",
                &invocation(Some(SessionControlValue::Range(submitted))),
                &endpoint_range,
            )
            .is_ok());
        }

        assert!(validate_session_control_invocation(
            "current",
            &invocation(Some(SessionControlValue::Range(0.3))),
            &control(SessionControlInteraction::Range {
                value: 0.2,
                min: 0.0,
                max: 1.0,
                step: 0.1,
            }),
        )
        .is_ok());
    }

    #[test]
    fn malformed_disabled_and_stale_session_invocations_are_rejected() {
        let invalid_cases = [
            (
                control(SessionControlInteraction::Command),
                invocation(Some(SessionControlValue::Toggle(true))),
                SessionControlFailureReason::InvalidValue,
            ),
            (
                control(SessionControlInteraction::Choice {
                    value: "trackpad".into(),
                    options: vec![SessionControlChoice {
                        value: "trackpad".into(),
                        label: "Trackpad".into(),
                    }],
                }),
                invocation(Some(SessionControlValue::Choice("outside".into()))),
                SessionControlFailureReason::InvalidValue,
            ),
            (
                control(SessionControlInteraction::Range {
                    value: 50.0,
                    min: 0.0,
                    max: 100.0,
                    step: 5.0,
                }),
                invocation(Some(SessionControlValue::Range(101.0))),
                SessionControlFailureReason::InvalidValue,
            ),
            (
                control(SessionControlInteraction::Range {
                    value: 50.0,
                    min: 0.0,
                    max: 100.0,
                    step: 5.0,
                }),
                invocation(Some(SessionControlValue::Range(52.0))),
                SessionControlFailureReason::InvalidValue,
            ),
        ];
        for (control, request, reason) in invalid_cases {
            assert_eq!(
                validate_session_control_invocation("current", &request, &control)
                    .expect_err("invocation must be rejected")
                    .reason,
                reason
            );
        }

        let mut disabled = control(SessionControlInteraction::Command);
        disabled.enabled = false;
        disabled.disabled_reason = Some("No live executor".into());
        assert_eq!(
            validate_session_control_invocation("current", &invocation(None), &disabled)
                .unwrap_err()
                .reason,
            SessionControlFailureReason::Disabled
        );

        let mut stale = invocation(None);
        stale.launch_id = "old".into();
        assert_eq!(
            validate_session_control_invocation(
                "current",
                &stale,
                &control(SessionControlInteraction::Command),
            )
            .unwrap_err()
            .reason,
            SessionControlFailureReason::StaleSession
        );
    }

    #[test]
    fn status_with_active_session_maps_to_ok_with_details() {
        let outcome = session_status_outcome(Ok(upstream::UpstreamSessionStatus::SessionStatus {
            active: Some(upstream::UpstreamActiveSession {
                launch_id: "l1".into(),
                host: Some("aka".into()),
                game_id: Some("g1".into()),
                title: Some("Skate 3".into()),
                phase: Some("running".into()),
            }),
        }));
        let SessionStatusOutcome::Ok(status) = outcome else {
            panic!("expected Ok");
        };
        let active = status.active.expect("active session");
        assert_eq!(active.host.as_deref(), Some("aka"));
        assert_eq!(active.game_id.as_deref(), Some("g1"));
        assert_eq!(active.title.as_deref(), Some("Skate 3"));
        assert_eq!(active.phase.as_deref(), Some("running"));
    }

    #[test]
    fn status_without_active_session_maps_to_nothing_playing() {
        let outcome = session_status_outcome(Ok(upstream::UpstreamSessionStatus::SessionStatus {
            active: None,
        }));
        assert!(matches!(
            outcome,
            SessionStatusOutcome::Ok(SessionStatus { active: None })
        ));
    }

    #[test]
    fn absent_optional_fields_are_omitted_from_the_wire() {
        assert_eq!(
            serde_json::to_value(SessionStatus { active: None }).unwrap(),
            serde_json::json!({})
        );
        assert_eq!(
            serde_json::to_value(ActiveSession {
                launch_id: "l1".into(),
                host: None,
                game_id: None,
                title: None,
                phase: None,
            })
            .unwrap(),
            serde_json::json!({ "launchId": "l1" })
        );
        assert_eq!(
            serde_json::to_value(SessionStopRequest { force: None }).unwrap(),
            serde_json::json!({})
        );
    }

    async fn rpc_body(app: Router, body: &str) -> serde_json::Value {
        rpc_body_authorized(app, body, None).await
    }

    async fn rpc_body_authorized(
        app: Router,
        body: &str,
        capability: Option<&str>,
    ) -> serde_json::Value {
        let mut request = Request::builder()
            .method("POST")
            .uri("/rpc")
            .header(header::CONTENT_TYPE, "application/json");
        if let Some(capability) = capability {
            request = request.header(header::AUTHORIZATION, format!("Bearer {capability}"));
        }
        let response = app
            .oneshot(request.body(Body::from(body.to_owned())).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    #[tokio::test]
    async fn host_catalog_serves_configured_games_with_the_host_label() {
        let root = tempfile::tempdir().unwrap();
        let config = root.path().join("host.toml");
        std::fs::write(
            &config,
            r#"
label = "zao"

[[games]]
id = "neverball"
title = "Neverball"
command = ["neverball"]
"#,
        )
        .unwrap();

        let body = rpc_body(
            host_router(&config),
            r#"{"_tag":"app.catalog.snapshot","payload":{}}"#,
        )
        .await;
        assert_eq!(body["outcome"]["_tag"], "Ok");
        assert_eq!(body["outcome"]["payload"]["games"][0]["id"], "neverball");
        assert_eq!(body["outcome"]["payload"]["games"][0]["host"], "zao");
    }

    #[tokio::test]
    async fn host_catalog_keeps_serving_a_tagged_error_for_an_invalid_config() {
        let root = tempfile::tempdir().unwrap();
        let config = root.path().join("missing.toml");
        let app = host_router(&config);

        for _ in 0..2 {
            let body = rpc_body(
                app.clone(),
                r#"{"_tag":"app.catalog.snapshot","payload":{}}"#,
            )
            .await;
            assert_eq!(body["outcome"]["_tag"], "Err");
            assert_eq!(body["outcome"]["payload"]["code"], "HostConfigInvalid");
            assert!(body["outcome"]["payload"]["message"]
                .as_str()
                .unwrap()
                .contains("missing.toml"));
        }
    }

    #[tokio::test]
    async fn host_catalog_accepts_an_empty_games_list() {
        let root = tempfile::tempdir().unwrap();
        let config = root.path().join("host.toml");
        std::fs::write(&config, "label = \"zao\"\n").unwrap();

        let body = rpc_body(
            host_router(&config),
            r#"{"_tag":"app.catalog.snapshot","payload":{}}"#,
        )
        .await;
        assert_eq!(body["outcome"]["_tag"], "Ok");
        assert_eq!(body["outcome"]["payload"]["games"], serde_json::json!([]));
    }

    #[tokio::test]
    async fn brain_router_loads_and_routes_the_storage_root_upstream_config() {
        let root = tempfile::tempdir().unwrap();
        let host_config = root.path().join("host.toml");
        std::fs::write(
            &host_config,
            r#"
label = "zao"
[[games]]
id = "neverball"
title = "Neverball"
command = ["sh", "-c", "sleep 1"]
"#,
        )
        .unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let host = host_router(&host_config);
        tokio::spawn(async move { axum::serve(listener, host).await.unwrap() });
        std::fs::write(
            root.path().join("upstreams.json"),
            format!(r#"[{{"label":"zao","kind":"native","baseUrl":"http://{address}"}}]"#),
        )
        .unwrap();
        let brain = router_with_capability_and_local_root(
            "right-token",
            "https://portal.example",
            root.path(),
        );

        let catalog = rpc_body_authorized(
            brain.clone(),
            r#"{"_tag":"app.catalog.snapshot","payload":{}}"#,
            Some("right-token"),
        )
        .await;
        assert_eq!(catalog["outcome"]["payload"]["games"][0]["host"], "zao");
        let prepared = rpc_body_authorized(
            brain,
            r#"{"_tag":"app.session.prepare","payload":{"gameId":"neverball","host":"zao"}}"#,
            Some("right-token"),
        )
        .await;
        assert_eq!(prepared["outcome"]["_tag"], "Ok");
    }

    #[tokio::test]
    async fn host_router_rejects_brain_and_unmanaged_session_operations() {
        let root = tempfile::tempdir().unwrap();
        let config = root.path().join("host.toml");
        std::fs::write(&config, "label = \"zao\"\n").unwrap();
        let app = host_router(&config);

        for (request, code) in [
            (
                r#"{"_tag":"app.local-games.launch","payload":{"gameId":"wl4"}}"#,
                "OperationUnsupported",
            ),
            (
                r#"{"_tag":"app.session.status","payload":{}}"#,
                "SessionStatusUnsupported",
            ),
            (
                r#"{"_tag":"app.session.stop","payload":{}}"#,
                "SessionStopUnsupported",
            ),
        ] {
            let body = rpc_body(app.clone(), request).await;
            assert_eq!(body["outcome"]["_tag"], "Err");
            assert_eq!(body["outcome"]["payload"]["code"], code);
        }
    }

    #[tokio::test]
    async fn local_games_rpc_lists_wario_land_from_the_device_brain() {
        let root = tempfile::tempdir().unwrap();
        write_wl4_plugin_config(root.path());
        let app = router_with_capability_and_local_root(
            "right-token",
            "https://portal.example",
            root.path(),
        );
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/rpc")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, "Bearer right-token")
                    .body(Body::from(
                        r#"{"_tag":"app.local-games.list","payload":{}}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body = String::from_utf8_lossy(&body);
        assert!(body.contains("app.local-games.list"));
        assert!(body.contains("Wario Land 4"));
    }

    #[tokio::test]
    async fn settings_rpc_round_trips_a_conflict_safe_device_name_write() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("config.yaml"), "host:\n  title: old\n").unwrap();
        std::fs::write(root.path().join("library.yaml"), "{}\n").unwrap();
        let app = router_with_capability_and_local_root(
            "right-token",
            "https://portal.example",
            root.path(),
        );

        let before = rpc_body_authorized(
            app.clone(),
            r#"{"_tag":"system.settings.snapshot","payload":{}}"#,
            Some("right-token"),
        )
        .await;
        assert_eq!(before["outcome"]["payload"]["deviceName"], "old");
        assert_eq!(
            before["outcome"]["payload"]["plugins"]
                .as_array()
                .unwrap()
                .len(),
            4
        );
        let revision = before["outcome"]["payload"]["revision"].as_str().unwrap();
        let request = serde_json::json!({
            "_tag": "system.settings.update",
            "payload": {
                "expectedRevision": revision,
                "settingId": "device-name",
                "value": "usu"
            }
        })
        .to_string();
        let updated = rpc_body_authorized(app.clone(), &request, Some("right-token")).await;

        assert_eq!(updated["outcome"]["_tag"], "Ok");
        assert_eq!(updated["outcome"]["payload"]["deviceName"], "usu");
        assert!(std::fs::read_to_string(root.path().join("config.yaml"))
            .unwrap()
            .contains("title: usu"));

        let updated_revision = updated["outcome"]["payload"]["revision"].as_str().unwrap();
        std::fs::write(root.path().join("config.yaml"), "host:\n  title: outside\n").unwrap();
        let stale_request = serde_json::json!({
            "_tag": "system.settings.update",
            "payload": {
                "expectedRevision": updated_revision,
                "settingId": "device-name",
                "value": "overwritten"
            }
        })
        .to_string();
        let conflict = rpc_body_authorized(app, &stale_request, Some("right-token")).await;

        assert_eq!(conflict["outcome"]["_tag"], "Err");
        assert_eq!(conflict["outcome"]["payload"]["code"], "SettingsConflict");
        assert!(std::fs::read_to_string(root.path().join("config.yaml"))
            .unwrap()
            .contains("title: outside"));
    }

    #[tokio::test]
    async fn local_launch_rpc_uses_the_configured_root_and_returns_a_spec() {
        let root = tempfile::tempdir().unwrap();
        write_wl4_plugin_config(root.path());
        std::fs::create_dir_all(root.path().join("roms")).unwrap();
        std::fs::write(root.path().join("roms/wl4.gba"), b"rom").unwrap();
        let app = router_with_capability_and_local_root(
            "right-token",
            "https://portal.example",
            root.path(),
        );
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/rpc")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, "Bearer right-token")
                    .body(Body::from(
                        r#"{"_tag":"app.local-games.launch","payload":{"gameId":"wl4"}}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body = String::from_utf8_lossy(&body);
        assert!(body.contains("app.local-games.launch"));
        assert!(body.contains("com.korri.retroarch"));
        assert!(root.path().join("retroarch.cfg").is_file());
    }

    #[tokio::test]
    async fn embedded_local_launch_rpc_defers_the_config_and_save_tree() {
        let root = tempfile::tempdir().unwrap();
        write_wl4_plugin_config(root.path());
        std::fs::create_dir_all(root.path().join("roms")).unwrap();
        std::fs::write(root.path().join("roms/wl4.gba"), b"rom").unwrap();
        let app = router_with_capability_local_root_and_provision(
            "right-token",
            "https://portal.example",
            root.path(),
            launcher::FileProvisionMode::Deferred,
            b"test signing key".to_vec(),
            Arc::new(Mutex::new(launcher::LaunchPublicationReservations::new())),
            Arc::new(Mutex::new(launcher::MoonlightLaunchAuthority::new(
                b"test signing key".to_vec(),
            ))),
            Arc::new(Mutex::new(None)),
            Arc::new(Mutex::new(None)),
            NativePlatform::EmbeddedAndroid,
            config::snapshot::ConfigSnapshotCoordinator::new(root.path()),
        );
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/rpc")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, "Bearer right-token")
                    .body(Body::from(
                        r#"{"_tag":"app.local-games.launch","payload":{"gameId":"wl4"}}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let spec = &body["outcome"]["payload"];
        assert_eq!(spec["launchId"].as_str().unwrap().len(), 32);
        assert_eq!(spec["files"].as_array().unwrap().len(), 1);
        assert_eq!(spec["directories"].as_array().unwrap().len(), 4);
        assert!(!spec["integrity"].as_str().unwrap().is_empty());
        assert_eq!(
            spec["extras"]["KORRI_CONTROL_TOKEN"]
                .as_str()
                .unwrap()
                .len(),
            64
        );
        assert!(!root.path().join("retroarch.cfg").exists());
        assert!(!root.path().join("saves").exists());
    }

    #[tokio::test]
    async fn running_server_verifies_only_its_untampered_launch_spec() {
        struct StopServer;
        impl Drop for StopServer {
            fn drop(&mut self) {
                let _ = stop_local_server();
            }
        }

        let root = tempfile::tempdir().unwrap();
        write_wl4_plugin_config(root.path());
        std::fs::create_dir_all(root.path().join("roms")).unwrap();
        std::fs::write(root.path().join("roms/wl4.gba"), b"rom").unwrap();
        let port = start_local_server(
            "https://portal.example",
            root.path().to_str().expect("UTF-8 temp path"),
        )
        .unwrap();
        let _stop = StopServer;
        let capability = local_server_capability().unwrap();
        let client = reqwest::Client::new();
        let url = format!("http://127.0.0.1:{port}/rpc");
        let moonlight = client
            .post(&url)
            .bearer_auth(&capability)
            .json(&serde_json::json!({
                "_tag": "app.moonlight.resolve",
                "payload": {}
            }))
            .send()
            .await
            .unwrap()
            .json::<serde_json::Value>()
            .await
            .unwrap();
        assert_eq!(moonlight["outcome"]["_tag"], "Unavailable");

        stop_local_server().unwrap();
        let port = start_local_server_for_platform(
            "https://portal.example",
            root.path().to_str().expect("UTF-8 temp path"),
            NativePlatform::EmbeddedAndroid,
        )
        .unwrap();
        let capability = local_server_capability().unwrap();
        let url = format!("http://127.0.0.1:{port}/rpc");

        let mut response = None;
        for _ in 0..20 {
            match client
                .post(&url)
                .bearer_auth(&capability)
                .json(&serde_json::json!({
                    "_tag": "app.local-games.launch",
                    "payload": { "gameId": "wl4" }
                }))
                .send()
                .await
            {
                Ok(value) => {
                    response = Some(value.json::<serde_json::Value>().await.unwrap());
                    break;
                }
                Err(_) => std::thread::sleep(std::time::Duration::from_millis(10)),
            }
        }
        let response = response.expect("embedded server response");
        let mut spec = response["outcome"]["payload"].clone();
        let spec_json = serde_json::to_string(&spec).unwrap();
        assert!(verify_local_launch_spec(&spec_json));
        let local = publish_local_active_launch(&spec_json).unwrap();
        assert_eq!(
            publish_local_active_launch(&spec_json),
            Err(ActiveAndroidLaunchFailure::AlreadyPublished)
        );
        assert_eq!(local.game_id.as_deref(), Some("wl4"));
        assert_eq!(local.title.as_deref(), Some("Wario Land 4"));
        assert_eq!(
            local.contributors,
            vec![
                launcher::LaunchRouteContributor {
                    kind: launcher::LaunchContributorKind::Launcher,
                    id: "@korri:retroarch/retroarch".into(),
                },
                launcher::LaunchRouteContributor {
                    kind: launcher::LaunchContributorKind::Runtime,
                    id: "@korri:mgba/mgba".into(),
                },
            ]
        );
        assert!(!clear_active_android_launch("late-older-launch"));
        assert_eq!(active_android_launch().unwrap().launch_id, local.launch_id);
        let controls = client
            .post(&url)
            .bearer_auth(&capability)
            .json(&serde_json::json!({
                "_tag": "app.session.controls",
                "payload": { "launchId": local.launch_id.clone() }
            }))
            .send()
            .await
            .unwrap()
            .json::<serde_json::Value>()
            .await
            .unwrap();
        assert_eq!(controls["outcome"]["_tag"], "Err");
        assert_eq!(controls["outcome"]["payload"]["reason"], "Unavailable");
        assert!(clear_active_android_launch(&local.launch_id));
        assert!(active_android_launch().is_none());
        assert_eq!(
            publish_local_active_launch(&spec_json),
            Err(ActiveAndroidLaunchFailure::AlreadyPublished)
        );

        spec["files"][0]["content"] = serde_json::Value::String("tampered".into());
        assert!(!verify_local_launch_spec(
            &serde_json::to_string(&spec).unwrap()
        ));

        let prepare = || {
            client
                .post(&url)
                .bearer_auth(&capability)
                .json(&serde_json::json!({
                    "_tag": "app.moonlight.launch.prepare",
                    "payload": { "hostUuid": "host-uuid", "appId": 7 }
                }))
                .send()
        };
        let first = prepare()
            .await
            .unwrap()
            .json::<serde_json::Value>()
            .await
            .unwrap()["outcome"]["payload"]
            .clone();
        let first_json = serde_json::to_string(&first).unwrap();
        assert_eq!(
            authorize_moonlight_launch_spec(&first_json),
            MoonlightLaunchAuthorization::Authorized
        );
        assert_eq!(
            authorize_moonlight_launch_spec(&first_json),
            MoonlightLaunchAuthorization::Replay
        );
        let stream = publish_moonlight_active_launch(
            &first_json,
            "com.simonwjackson.korri",
            "com.limelight.Game",
        )
        .unwrap();
        assert_eq!(stream.launch_id, first["launchId"].as_str().unwrap());
        assert_eq!(
            stream.foreground.kind,
            launcher::LaunchForegroundKind::Component
        );
        assert_eq!(
            stream.foreground.package_name.as_deref(),
            Some("com.simonwjackson.korri")
        );
        assert_eq!(
            stream.foreground.class_name.as_deref(),
            Some("com.limelight.Game")
        );
        assert!(publish_moonlight_executor_state(
            &serde_json::to_string(&moonlight_executor_state(&stream.launch_id)).unwrap()
        ));
        let controls = client
            .post(&url)
            .bearer_auth(&capability)
            .json(&serde_json::json!({
                "_tag": "app.session.controls",
                "payload": { "launchId": stream.launch_id.clone() }
            }))
            .send()
            .await
            .unwrap()
            .json::<serde_json::Value>()
            .await
            .unwrap();
        assert_eq!(controls["outcome"]["_tag"], "Ok");
        assert_eq!(
            controls["outcome"]["payload"]["groups"][0]["id"],
            "@korri:moonlight"
        );
        assert_eq!(
            controls["outcome"]["payload"]["groups"][0]["label"],
            "Moonlight"
        );
        assert_eq!(
            controls["outcome"]["payload"]["groups"][0]["controls"]
                .as_array()
                .unwrap()
                .len(),
            18
        );
        let fill = controls["outcome"]["payload"]["groups"][0]["controls"]
            .as_array()
            .unwrap()
            .iter()
            .find(|control| control["id"] == "@korri:moonlight/fill")
            .unwrap();
        assert_eq!(
            fill["interaction"],
            serde_json::json!({
                "kind": "toggle", "payload": { "value": false }
            })
        );
        let invoke = client
            .post(&url)
            .bearer_auth(&capability)
            .json(&serde_json::json!({
                "_tag": "app.session.control.invoke",
                "payload": {
                    "launchId": stream.launch_id.clone(),
                    "controlId": "@korri:moonlight/fill",
                    "value": { "kind": "toggle", "value": true }
                }
            }))
            .send()
            .await
            .unwrap()
            .json::<serde_json::Value>()
            .await
            .unwrap();
        assert_eq!(invoke["outcome"]["_tag"], "Ok");
        let protected_fill = &invoke["outcome"]["payload"]["payload"];
        assert_eq!(
            protected_fill["effect"],
            serde_json::json!({
                "kind": "android-moonlight", "payload": "set-fill-mode"
            })
        );
        assert_eq!(
            authorize_platform_instruction(&serde_json::to_string(protected_fill).unwrap()),
            PlatformInstructionAuthorization::Authorized(AuthorizedPlatformInstruction {
                launch_id: stream.launch_id.clone(),
                effect: launcher::AndroidMoonlightEffect::SetFillMode,
                value: Some(SessionControlValue::Toggle(true)),
            })
        );
        let mut refreshed = moonlight_executor_state(&stream.launch_id);
        refreshed
            .effects
            .iter_mut()
            .find(|entry| entry.effect == launcher::AndroidMoonlightEffect::SetFillMode)
            .unwrap()
            .value = Some(SessionControlValue::Toggle(true));
        assert!(publish_moonlight_executor_state(
            &serde_json::to_string(&refreshed).unwrap()
        ));
        let refreshed_controls = client
            .post(&url)
            .bearer_auth(&capability)
            .json(&serde_json::json!({
                "_tag": "app.session.controls", "payload": { "launchId": stream.launch_id.clone() }
            }))
            .send()
            .await
            .unwrap()
            .json::<serde_json::Value>()
            .await
            .unwrap();
        let refreshed_fill = refreshed_controls["outcome"]["payload"]["groups"][0]["controls"]
            .as_array()
            .unwrap()
            .iter()
            .find(|control| control["id"] == "@korri:moonlight/fill")
            .unwrap();
        assert_eq!(refreshed_fill["interaction"]["payload"]["value"], true);
        let signing_key = server_slot()
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .launch_signing_key
            .clone();
        let instruction = launcher::PlatformInstruction::protect(
            stream.launch_id.clone(),
            "@korri:moonlight/disconnect",
            None,
            launcher::PlatformEffect::AndroidMoonlight(
                launcher::AndroidMoonlightEffect::Disconnect,
            ),
            &signing_key,
        );
        let instruction_json = serde_json::to_string(&instruction).unwrap();
        assert_eq!(
            authorize_platform_instruction(&instruction_json),
            PlatformInstructionAuthorization::Authorized(AuthorizedPlatformInstruction {
                launch_id: stream.launch_id.clone(),
                effect: launcher::AndroidMoonlightEffect::Disconnect,
                value: None,
            })
        );
        assert_eq!(
            publish_moonlight_active_launch(
                &first_json,
                "com.simonwjackson.korri",
                "com.limelight.Game",
            ),
            Err(ActiveAndroidLaunchFailure::AlreadyPublished)
        );
        assert_eq!(
            authorize_platform_instruction(&instruction_json),
            PlatformInstructionAuthorization::Replay
        );

        let second = prepare()
            .await
            .unwrap()
            .json::<serde_json::Value>()
            .await
            .unwrap()["outcome"]["payload"]
            .clone();
        let mut tampered = second.clone();
        tampered["appId"] = serde_json::json!(8);
        assert_eq!(
            authorize_moonlight_launch_spec(&serde_json::to_string(&tampered).unwrap()),
            MoonlightLaunchAuthorization::Integrity
        );

        let third = prepare()
            .await
            .unwrap()
            .json::<serde_json::Value>()
            .await
            .unwrap()["outcome"]["payload"]
            .clone();
        assert_eq!(
            authorize_moonlight_launch_spec(&serde_json::to_string(&second).unwrap()),
            MoonlightLaunchAuthorization::Stale
        );
        let mut unknown = third;
        unknown["signingKey"] = serde_json::json!("must not cross");
        assert_eq!(
            authorize_moonlight_launch_spec(&serde_json::to_string(&unknown).unwrap()),
            MoonlightLaunchAuthorization::InvalidSpec
        );

        let prepared_before_disable = prepare()
            .await
            .unwrap()
            .json::<serde_json::Value>()
            .await
            .unwrap()["outcome"]["payload"]
            .clone();
        std::fs::write(
            root.path().join("config.yaml"),
            "host:\n  plugin:\n    '@korri:moonlight': false\n",
        )
        .unwrap();
        assert_eq!(
            authorize_moonlight_launch_spec(
                &serde_json::to_string(&prepared_before_disable).unwrap()
            ),
            MoonlightLaunchAuthorization::Stale
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn local_launch_rpc_reports_initial_empty_unauthorized_config_for_non_static_ids() {
        use std::os::unix::fs::PermissionsExt;

        let root = tempfile::tempdir().unwrap();
        let app = router_with_capability_and_local_root(
            "right-token",
            "https://portal.example",
            root.path(),
        );
        std::fs::set_permissions(root.path(), std::fs::Permissions::from_mode(0o000)).unwrap();
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/rpc")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, "Bearer right-token")
                    .body(Body::from(
                        r#"{"_tag":"app.local-games.launch","payload":{"gameId":"tmnt-shredders-revenge"}}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        std::fs::set_permissions(root.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(String::from_utf8_lossy(&body).contains("LocalConfigUnauthorized"));
    }

    #[tokio::test]
    async fn local_launch_rpc_maps_missing_and_unknown_games_to_distinct_codes() {
        for (game_id, code) in [("wl4", "LocalRomMissing"), ("unknown", "LocalGameNotFound")] {
            let root = tempfile::tempdir().unwrap();
            write_wl4_plugin_config(root.path());
            let app = router_with_capability_and_local_root(
                "right-token",
                "https://portal.example",
                root.path(),
            );
            let body = format!(
                r#"{{"_tag":"app.local-games.launch","payload":{{"gameId":"{game_id}"}}}}"#
            );
            let response = app
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/rpc")
                        .header(header::CONTENT_TYPE, "application/json")
                        .header(header::AUTHORIZATION, "Bearer right-token")
                        .body(Body::from(body))
                        .unwrap(),
                )
                .await
                .unwrap();
            let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            assert!(String::from_utf8_lossy(&body).contains(code));
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn local_launch_rpc_distinguishes_config_authorization_and_write_failures() {
        use std::os::unix::fs::PermissionsExt;

        for (mode, code) in [
            (0o000, "LocalConfigUnauthorized"),
            (0o500, "LocalConfigWriteFailed"),
        ] {
            let root = tempfile::tempdir().unwrap();
            write_wl4_plugin_config(root.path());
            std::fs::create_dir_all(root.path().join("roms")).unwrap();
            std::fs::write(root.path().join("roms/wl4.gba"), b"rom").unwrap();
            let app = router_with_capability_and_local_root(
                "right-token",
                "https://portal.example",
                root.path(),
            );
            std::fs::set_permissions(root.path(), std::fs::Permissions::from_mode(mode)).unwrap();
            let response = app
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/rpc")
                        .header(header::CONTENT_TYPE, "application/json")
                        .header(header::AUTHORIZATION, "Bearer right-token")
                        .body(Body::from(
                            r#"{"_tag":"app.local-games.launch","payload":{"gameId":"wl4"}}"#,
                        ))
                        .unwrap(),
                )
                .await
                .unwrap();
            std::fs::set_permissions(root.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
            let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            assert!(
                String::from_utf8_lossy(&body).contains(code),
                "mode {mode:o} expected {code}, got {}",
                String::from_utf8_lossy(&body)
            );
        }
    }

    #[tokio::test]
    async fn rpc_rejects_missing_or_wrong_capability() {
        let app = router_with_capability("right-token", "https://portal.example");
        for authorization in [None, Some("Bearer wrong-token")] {
            let mut request = Request::builder()
                .method("POST")
                .uri("/rpc")
                .header(header::CONTENT_TYPE, "application/json");
            if let Some(value) = authorization {
                request = request.header(header::AUTHORIZATION, value);
            }
            let response = app
                .clone()
                .oneshot(
                    request
                        .body(Body::from(r#"{"_tag":"system.health","payload":{}}"#))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        }
    }

    #[tokio::test]
    async fn rpc_accepts_the_capability_and_exact_portal_origin() {
        let app = router_with_capability("right-token", "https://portal.example");
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/rpc")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, "Bearer right-token")
                    .header(header::ORIGIN, "https://portal.example")
                    .body(Body::from(r#"{"_tag":"system.health","payload":{}}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                .unwrap(),
            "https://portal.example"
        );
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(String::from_utf8_lossy(&body).contains("system.health"));
    }

    #[tokio::test]
    async fn cors_allows_authorized_preflight_only_for_the_exact_origin() {
        let app = router_with_capability("right-token", "https://portal.example");
        let allowed = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("OPTIONS")
                    .uri("/rpc")
                    .header(header::ORIGIN, "https://portal.example")
                    .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
                    .header(
                        header::ACCESS_CONTROL_REQUEST_HEADERS,
                        "content-type,authorization",
                    )
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(allowed.status(), StatusCode::OK);
        assert_eq!(
            allowed
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                .unwrap(),
            "https://portal.example"
        );
        assert!(allowed
            .headers()
            .get(header::ACCESS_CONTROL_ALLOW_HEADERS)
            .unwrap()
            .to_str()
            .unwrap()
            .contains("authorization"));

        let foreign = app
            .oneshot(
                Request::builder()
                    .method("OPTIONS")
                    .uri("/rpc")
                    .header(header::ORIGIN, "https://evil.example")
                    .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
                    .header(
                        header::ACCESS_CONTROL_REQUEST_HEADERS,
                        "content-type,authorization",
                    )
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_ne!(
            foreign
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                .unwrap(),
            "https://evil.example"
        );
    }

    #[tokio::test]
    async fn android_cors_allows_bundled_overlay_and_configured_shell_origins_only() {
        let root = tempfile::tempdir().unwrap();
        let app = android_router_with_capability_and_local_root(
            "right-token",
            "http://10.0.2.2:5173",
            root.path(),
        );
        for origin in [
            "https://appassets.androidplatform.net",
            "http://10.0.2.2:5173",
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method("OPTIONS")
                        .uri("/rpc")
                        .header(header::ORIGIN, origin)
                        .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
                        .header(
                            header::ACCESS_CONTROL_REQUEST_HEADERS,
                            "content-type,authorization",
                        )
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(
                response
                    .headers()
                    .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                    .unwrap(),
                origin
            );
        }

        let foreign = app
            .oneshot(
                Request::builder()
                    .method("OPTIONS")
                    .uri("/rpc")
                    .header(header::ORIGIN, "https://evil.example")
                    .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
                    .header(
                        header::ACCESS_CONTROL_REQUEST_HEADERS,
                        "content-type,authorization",
                    )
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(foreign
            .headers()
            .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
            .is_none());
    }

    #[test]
    fn status_daemon_variants_map_to_distinct_failure_codes() {
        let not_configured = session_status_outcome(Ok(
            upstream::UpstreamSessionStatus::SessiondNotConfigured {},
        ));
        let SessionStatusOutcome::Err(failure) = not_configured else {
            panic!("expected Err");
        };
        assert_eq!(failure.code, "SessiondNotConfigured");

        let unavailable =
            session_status_outcome(Ok(upstream::UpstreamSessionStatus::HostUnavailable {}));
        let SessionStatusOutcome::Err(failure) = unavailable else {
            panic!("expected Err");
        };
        assert_eq!(failure.code, "HostUnavailable");
    }

    #[test]
    fn stop_variants_map_to_stopped_and_pending_phases() {
        let stopped = session_stop_outcome(Ok(upstream::UpstreamSessionStop::Stopped {
            launch_id: Some("l1".into()),
        }));
        assert!(matches!(
            stopped,
            SessionStopOutcome::Ok(SessionStopResult {
                phase: SessionStopPhase::Stopped
            })
        ));

        let pending = session_stop_outcome(Ok(upstream::UpstreamSessionStop::StopPending {
            launch_id: None,
        }));
        assert!(matches!(
            pending,
            SessionStopOutcome::Ok(SessionStopResult {
                phase: SessionStopPhase::Pending
            })
        ));

        let nothing = session_stop_outcome(Ok(upstream::UpstreamSessionStop::NothingToStop {}));
        assert!(matches!(
            nothing,
            SessionStopOutcome::Ok(SessionStopResult {
                phase: SessionStopPhase::Stopped
            })
        ));

        let confirmation =
            session_stop_outcome(Ok(upstream::UpstreamSessionStop::ConfirmationRequired {
                action: Some("stop-session".into()),
            }));
        let SessionStopOutcome::Err(failure) = confirmation else {
            panic!("expected Err");
        };
        assert_eq!(failure.code, "ConfirmationRequired");
    }
}
