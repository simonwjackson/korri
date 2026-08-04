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
#[serde(tag = "kind", content = "value", rename_all = "kebab-case")]
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

fn session_route_context_unavailable() -> SessionControlFailure {
    SessionControlFailure {
        reason: SessionControlFailureReason::Unavailable,
        message: "Gameplay controls need a current active-session route and live executor state."
            .into(),
    }
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
                ServerMode::Brain(brain) => {
                    let config_state = brain.config_snapshot.reload();
                    match plugin_policy::registry_for_snapshot(&config_state.snapshot) {
                        Ok(registry) => (brain.native_platform == NativePlatform::EmbeddedAndroid)
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
                                    message: "Moonlight is disabled or Artemis is unavailable"
                                        .into(),
                                })
                            }),
                        Err(error) => MoonlightResolveOutcome::Unavailable(RpcFailure {
                            code: "PluginPolicyInvalid".into(),
                            message: error.to_string(),
                        }),
                    }
                }
                ServerMode::Host(_) => MoonlightResolveOutcome::Unavailable(RpcFailure {
                    code: "MoonlightUnavailable".into(),
                    message: "Artemis is available only at the Android edge".into(),
                }),
            };
            RpcResponse::MoonlightResolve(outcome)
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
        // U2 can resolve declarations from an explicit route plus live executor
        // state. The existing upstream session status carries neither, so U3/U4
        // must publish that context before these RPCs can honestly materialize or
        // invoke a control. Never infer a route from game/title/provider strings.
        RpcRequest::SessionControls(_) => RpcResponse::SessionControls(
            SessionControlsOutcome::Err(session_route_context_unavailable()),
        ),
        RpcRequest::SessionControlInvoke(_) => RpcResponse::SessionControlInvoke(
            SessionControlInvokeOutcome::Err(session_route_context_unavailable()),
        ),
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
                    spec.with_launch_id(generate_launch_id())
                        .sign(&brain.local_launch_signing_key)
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
    router_with_capability_local_root_and_provision(
        rpc_capability,
        allowed_origin,
        local_storage_root,
        launcher::FileProvisionMode::Direct,
        generate_launch_signing_key(),
        NativePlatform::Standalone,
    )
}

/** Build the embedded Android/JNI brain router with the Artemis native edge. */
pub fn android_router_with_capability_and_local_root(
    rpc_capability: &str,
    allowed_origin: &str,
    local_storage_root: impl AsRef<Path>,
) -> Router {
    router_with_capability_local_root_and_provision(
        rpc_capability,
        allowed_origin,
        local_storage_root,
        launcher::FileProvisionMode::Deferred,
        generate_launch_signing_key(),
        NativePlatform::EmbeddedAndroid,
    )
}

fn router_with_capability_local_root_and_provision(
    rpc_capability: &str,
    allowed_origin: &str,
    local_storage_root: impl AsRef<Path>,
    local_file_provision: launcher::FileProvisionMode,
    local_launch_signing_key: Vec<u8>,
    native_platform: NativePlatform,
) -> Router {
    let local_storage_root = local_storage_root.as_ref().to_owned();
    let config_snapshot = config::snapshot::ConfigSnapshotCoordinator::new(&local_storage_root);
    let state = AppState {
        mode: ServerMode::Brain(BrainRuntime {
            upstream: upstreams::UpstreamRegistry::from_env_or_file(
                &local_storage_root.join("upstreams.json"),
            ),
            local_storage_root,
            local_file_provision,
            local_launch_signing_key,
            native_platform,
            config_snapshot,
            settings_write_lock: Arc::new(Mutex::new(())),
        }),
        rpc_capability: Some(rpc_capability.into()),
    };
    let origin: HeaderValue = allowed_origin
        .parse()
        .expect("allowed portal origin must be a valid header value");
    let cors = tower_http::cors::CorsLayer::new()
        .allow_origin(origin)
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

/// Starts the exact same Axum router used by the Linux binary on localhost.
pub fn start_local_server(
    allowed_origin: &str,
    local_storage_root: &str,
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
    let allowed_origin = allowed_origin.to_owned();
    let local_storage_root = local_storage_root.to_owned();
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
                        NativePlatform::EmbeddedAndroid,
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

/// Verify that a launcher-neutral instruction came from this embedded server.
pub fn verify_local_launch_spec(spec_json: &str) -> bool {
    let Ok(spec) = serde_json::from_str::<launcher::LaunchSpec>(spec_json) else {
        return false;
    };
    server_slot()
        .lock()
        .expect("server mutex poisoned")
        .as_ref()
        .is_some_and(|server| spec.verify(&server.launch_signing_key))
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
            NativePlatform::EmbeddedAndroid,
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

        spec["files"][0]["content"] = serde_json::Value::String("tampered".into());
        assert!(!verify_local_launch_spec(
            &serde_json::to_string(&spec).unwrap()
        ));
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
