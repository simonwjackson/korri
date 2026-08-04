//! Declaration-only plugins and their device-local registry.
//!
//! This is the narrow legacy plugin seam exercised by the Android application
//! checkpoint: a plugin identifies itself and contributes provider, system,
//! launcher, transport, runtime, and contextual session-control records. Plugins
//! still perform no effects; this module only evaluates, validates, normalizes,
//! and announces their declarations.

use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Component, Path},
};

use serde::{Deserialize, Deserializer};
use thiserror::Error;

use crate::script;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProviderRecord {
    pub id: String,
    pub title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ProviderContribution {
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    id: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    title: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SystemRecord {
    pub id: String,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    pub title: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AndroidLauncherRecord {
    pub package_name: String,
    pub class_name: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LinuxLauncherRecord {
    pub executable_env: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct LauncherRecord {
    pub id: String,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    pub plugin: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    pub command: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    pub systems: Option<Vec<String>>,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    pub android: Option<AndroidLauncherRecord>,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    pub linux: Option<LinuxLauncherRecord>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RuntimeSupportsRecord {
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    pub systems: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LinuxRuntimeRecord {
    pub path_env: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RuntimeRecord {
    pub id: String,
    pub kind: String,
    pub app: String,
    pub path: String,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    pub linux: Option<LinuxRuntimeRecord>,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    pub supports: Option<RuntimeSupportsRecord>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TransportRecord {
    pub id: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd)]
#[serde(rename_all = "kebab-case")]
pub enum SessionControlOwnerKind {
    Launcher,
    Transport,
    Runtime,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SessionControlOwner {
    pub kind: SessionControlOwnerKind,
    pub id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SessionControlOption {
    pub value: String,
    pub label: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum SessionControlDeclarationInteraction {
    Command,
    Toggle,
    Choice { options: Vec<SessionControlOption> },
    Range { min: f64, max: f64, step: f64 },
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
pub enum SessionControlEffect {
    #[serde(rename = "@korri:retroarch/open-menu")]
    RetroarchOpenMenu,
    #[serde(rename = "@korri:moonlight/disconnect")]
    MoonlightDisconnect,
    #[serde(rename = "@korri:moonlight/quit-host")]
    MoonlightQuitHost,
    #[serde(rename = "@korri:moonlight/toggle-keyboard")]
    MoonlightToggleKeyboard,
    #[serde(rename = "@korri:moonlight/toggle-full-keyboard")]
    MoonlightToggleFullKeyboard,
    #[serde(rename = "@korri:moonlight/set-fill-mode")]
    MoonlightSetFillMode,
    #[serde(rename = "@korri:moonlight/set-zoom-mode")]
    MoonlightSetZoomMode,
    #[serde(rename = "@korri:moonlight/rotate-screen")]
    MoonlightRotateScreen,
    #[serde(rename = "@korri:moonlight/toggle-hud")]
    MoonlightToggleHud,
    #[serde(rename = "@korri:moonlight/toggle-floating-menu")]
    MoonlightToggleFloatingMenu,
    #[serde(rename = "@korri:moonlight/toggle-keyboard-controller")]
    MoonlightToggleKeyboardController,
    #[serde(rename = "@korri:moonlight/switch-touch-sensitivity")]
    MoonlightSwitchTouchSensitivity,
    #[serde(rename = "@korri:moonlight/set-mouse-mode")]
    MoonlightSetMouseMode,
    #[serde(rename = "@korri:moonlight/set-local-cursor")]
    MoonlightSetLocalCursor,
    #[serde(rename = "@korri:moonlight/set-sgsr-quality")]
    MoonlightSetSgsrQuality,
    #[serde(rename = "@korri:moonlight/set-sgsr-sharpness")]
    MoonlightSetSgsrSharpness,
    #[serde(rename = "@korri:moonlight/set-face-button-flip")]
    MoonlightSetFaceButtonFlip,
    #[serde(rename = "@korri:moonlight/set-rumble")]
    MoonlightSetRumble,
    #[serde(rename = "@korri:moonlight/set-picture-in-picture")]
    MoonlightSetPictureInPicture,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum SessionControlExecutor {
    AndroidMoonlight,
    RetroarchControl,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SessionControlPlatform {
    Android,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum SessionControlIntegration {
    Moonlight,
    Retroarch,
}

impl SessionControlEffect {
    fn integration(self) -> SessionControlIntegration {
        match self {
            Self::RetroarchOpenMenu => SessionControlIntegration::Retroarch,
            Self::MoonlightDisconnect
            | Self::MoonlightQuitHost
            | Self::MoonlightToggleKeyboard
            | Self::MoonlightToggleFullKeyboard
            | Self::MoonlightSetFillMode
            | Self::MoonlightSetZoomMode
            | Self::MoonlightRotateScreen
            | Self::MoonlightToggleHud
            | Self::MoonlightToggleFloatingMenu
            | Self::MoonlightToggleKeyboardController
            | Self::MoonlightSwitchTouchSensitivity
            | Self::MoonlightSetMouseMode
            | Self::MoonlightSetLocalCursor
            | Self::MoonlightSetSgsrQuality
            | Self::MoonlightSetSgsrSharpness
            | Self::MoonlightSetFaceButtonFlip
            | Self::MoonlightSetRumble
            | Self::MoonlightSetPictureInPicture => SessionControlIntegration::Moonlight,
        }
    }

    pub fn executor(self) -> SessionControlExecutor {
        match self.integration() {
            SessionControlIntegration::Moonlight => SessionControlExecutor::AndroidMoonlight,
            SessionControlIntegration::Retroarch => SessionControlExecutor::RetroarchControl,
        }
    }

    pub fn platform(self) -> SessionControlPlatform {
        match self.integration() {
            SessionControlIntegration::Moonlight | SessionControlIntegration::Retroarch => {
                SessionControlPlatform::Android
            }
        }
    }

    fn plugin_id(self) -> &'static str {
        match self.integration() {
            SessionControlIntegration::Moonlight => "@korri:moonlight",
            SessionControlIntegration::Retroarch => "@korri:retroarch",
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionControlRecord {
    #[serde(skip)]
    pub plugin_id: String,
    #[serde(skip)]
    pub local_id: String,
    pub id: String,
    pub owner: SessionControlOwner,
    pub label: String,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    pub description: Option<String>,
    pub interaction: SessionControlDeclarationInteraction,
    pub effect: SessionControlEffect,
    #[serde(default)]
    pub destructive: bool,
    #[serde(default)]
    pub dismiss_on_success: bool,
}

#[derive(Clone, Debug)]
pub struct Plugin {
    id: String,
    title: String,
    description: Option<String>,
    providers: BTreeMap<String, ProviderRecord>,
    systems: BTreeMap<String, SystemRecord>,
    launchers: BTreeMap<String, LauncherRecord>,
    transports: BTreeMap<String, TransportRecord>,
    runtimes: BTreeMap<String, RuntimeRecord>,
    session_controls: BTreeMap<String, SessionControlRecord>,
}

impl Plugin {
    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn title(&self) -> &str {
        &self.title
    }

    pub fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }
}

#[derive(Clone, Debug)]
pub struct PluginRegistry {
    plugins: BTreeMap<String, Plugin>,
    enabled_plugin_ids: BTreeSet<String>,
    registered_provider_ids: BTreeSet<String>,
    registered_system_ids: BTreeSet<String>,
    registered_launcher_ids: BTreeSet<String>,
    registered_transport_ids: BTreeSet<String>,
    registered_runtime_ids: BTreeSet<String>,
    registered_session_controls: BTreeMap<String, SessionControlRecord>,
    providers: BTreeMap<String, ProviderRecord>,
    systems: BTreeMap<String, SystemRecord>,
    launchers: BTreeMap<String, LauncherRecord>,
    transports: BTreeMap<String, TransportRecord>,
    runtimes: BTreeMap<String, RuntimeRecord>,
    session_controls: BTreeMap<String, SessionControlRecord>,
}

impl PluginRegistry {
    pub fn new(
        plugins: Vec<Plugin>,
        enabled_plugin_ids: impl IntoIterator<Item = String>,
    ) -> Result<Self, PluginError> {
        let requested_enabled: BTreeSet<String> = enabled_plugin_ids.into_iter().collect();
        let mut by_id = BTreeMap::new();

        for plugin in plugins {
            let plugin_id = plugin.id.clone();
            if by_id.insert(plugin_id.clone(), plugin).is_some() {
                return Err(PluginError::DuplicatePluginId(plugin_id));
            }
        }

        let enabled_plugin_ids = requested_enabled;
        let mut registered_provider_ids = BTreeSet::new();
        let mut registered_system_ids = BTreeSet::new();
        let mut registered_launcher_ids = BTreeSet::new();
        let mut registered_transport_ids = BTreeSet::new();
        let mut registered_runtime_ids = BTreeSet::new();
        let mut registered_session_controls = BTreeMap::new();
        let mut providers = BTreeMap::new();
        let mut systems = BTreeMap::new();
        let mut launchers = BTreeMap::new();
        let mut transports = BTreeMap::new();
        let mut runtimes = BTreeMap::new();
        let mut session_controls = BTreeMap::new();

        for plugin in by_id.values() {
            registered_provider_ids
                .extend(plugin.providers.values().map(|record| record.id.clone()));
            registered_system_ids.extend(plugin.systems.values().map(|record| record.id.clone()));
            registered_launcher_ids
                .extend(plugin.launchers.values().map(|record| record.id.clone()));
            registered_transport_ids
                .extend(plugin.transports.values().map(|record| record.id.clone()));
            registered_runtime_ids.extend(plugin.runtimes.values().map(|record| record.id.clone()));
            for record in plugin.session_controls.values() {
                insert_unique(
                    &mut registered_session_controls,
                    record.id.clone(),
                    record.clone(),
                )?;
            }
        }

        for plugin_id in &enabled_plugin_ids {
            let plugin = by_id
                .get(plugin_id)
                .ok_or_else(|| PluginError::UnknownEnabledPlugin(plugin_id.clone()))?;

            for (record_id, record) in &plugin.providers {
                insert_unique(&mut providers, record_id.clone(), record.clone())?;
            }
            for (local_id, record) in &plugin.systems {
                insert_unique(
                    &mut systems,
                    plugin_record_id(plugin_id, local_id),
                    record.clone(),
                )?;
            }
            for (local_id, record) in &plugin.launchers {
                insert_unique(
                    &mut launchers,
                    plugin_record_id(plugin_id, local_id),
                    record.clone(),
                )?;
            }
            for (local_id, record) in &plugin.transports {
                insert_unique(
                    &mut transports,
                    plugin_record_id(plugin_id, local_id),
                    record.clone(),
                )?;
            }
            for (local_id, record) in &plugin.runtimes {
                insert_unique(
                    &mut runtimes,
                    plugin_record_id(plugin_id, local_id),
                    record.clone(),
                )?;
            }
            for record in plugin.session_controls.values() {
                insert_unique(&mut session_controls, record.id.clone(), record.clone())?;
            }
        }

        Ok(Self {
            plugins: by_id,
            enabled_plugin_ids,
            registered_provider_ids,
            registered_system_ids,
            registered_launcher_ids,
            registered_transport_ids,
            registered_runtime_ids,
            registered_session_controls,
            providers,
            systems,
            launchers,
            transports,
            runtimes,
            session_controls,
        })
    }

    pub fn registered_plugin_ids(&self) -> Vec<&str> {
        self.plugins.keys().map(String::as_str).collect()
    }

    pub fn enabled_plugin_ids(&self) -> Vec<&str> {
        self.enabled_plugin_ids.iter().map(String::as_str).collect()
    }

    pub fn owns_registered_provider_id(&self, id: &str) -> bool {
        self.registered_provider_ids.contains(id)
    }

    pub fn owns_registered_system_id(&self, id: &str) -> bool {
        self.registered_system_ids.contains(id)
    }

    pub fn owns_registered_launcher_id(&self, id: &str) -> bool {
        self.registered_launcher_ids.contains(id)
    }

    pub fn owns_registered_transport_id(&self, id: &str) -> bool {
        self.registered_transport_ids.contains(id)
    }

    pub fn owns_registered_runtime_id(&self, id: &str) -> bool {
        self.registered_runtime_ids.contains(id)
    }

    pub fn owns_registered_session_control_id(&self, id: &str) -> bool {
        self.registered_session_controls.contains_key(id)
    }

    pub fn registered_session_controls(&self) -> &BTreeMap<String, SessionControlRecord> {
        &self.registered_session_controls
    }

    pub fn providers(&self) -> &BTreeMap<String, ProviderRecord> {
        &self.providers
    }

    pub fn systems(&self) -> &BTreeMap<String, SystemRecord> {
        &self.systems
    }

    pub fn launchers(&self) -> &BTreeMap<String, LauncherRecord> {
        &self.launchers
    }

    pub fn transports(&self) -> &BTreeMap<String, TransportRecord> {
        &self.transports
    }

    pub fn runtimes(&self) -> &BTreeMap<String, RuntimeRecord> {
        &self.runtimes
    }

    pub fn session_controls(&self) -> &BTreeMap<String, SessionControlRecord> {
        &self.session_controls
    }
}

#[derive(Debug, Error)]
pub enum PluginError {
    #[error("plugin evaluation failed: {0}")]
    Evaluation(String),
    #[error("invalid plugin declaration: {0}")]
    InvalidDeclaration(#[from] serde_json::Error),
    #[error("invalid plugin id {0}")]
    InvalidPluginId(String),
    #[error("invalid {kind} contribution {record_id}: {reason}")]
    InvalidContribution {
        kind: &'static str,
        record_id: String,
        reason: String,
    },
    #[error("invalid {kind} contribution key: local ids must not be empty")]
    EmptyContributionId { kind: &'static str },
    #[error("duplicate plugin id {0}")]
    DuplicatePluginId(String),
    #[error("enabled plugin {0} is not registered")]
    UnknownEnabledPlugin(String),
    #[error("duplicate contributed record id {0}")]
    DuplicateContribution(String),
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct PluginDeclaration {
    namespace: String,
    name: String,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    title: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    description: Option<String>,
    #[serde(default)]
    contributes: PluginContributions,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct PluginContributions {
    #[serde(default)]
    config: PluginConfigContributions,
    #[serde(default, rename = "sessionControls")]
    session_controls: BTreeMap<String, SessionControlRecord>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct PluginConfigContributions {
    #[serde(default)]
    providers: BTreeMap<String, ProviderContribution>,
    #[serde(default)]
    systems: BTreeMap<String, SystemRecord>,
    #[serde(default)]
    launchers: BTreeMap<String, LauncherRecord>,
    #[serde(default)]
    transports: BTreeMap<String, TransportRecord>,
    #[serde(default)]
    runtimes: BTreeMap<String, RuntimeRecord>,
}

pub fn load_plugin_source(source: &str) -> Result<Plugin, PluginError> {
    let declaration_json = script::eval_plugin_ts(source).map_err(PluginError::Evaluation)?;
    decode_plugin_declaration(&declaration_json)
}

pub fn decode_plugin_declaration(declaration_json: &str) -> Result<Plugin, PluginError> {
    let declaration: PluginDeclaration = serde_json::from_str(declaration_json)?;
    normalize_plugin(declaration)
}

fn normalize_plugin(mut declaration: PluginDeclaration) -> Result<Plugin, PluginError> {
    let id = format!("{}:{}", declaration.namespace, declaration.name);
    if !is_provider_id(&id) {
        return Err(PluginError::InvalidPluginId(id));
    }

    let title = declaration
        .title
        .unwrap_or_else(|| titleize(&declaration.name));
    let mut providers = BTreeMap::new();

    for (record_id, contribution) in declaration.contributes.config.providers {
        if !is_provider_id(&record_id) {
            return Err(PluginError::InvalidContribution {
                kind: "provider",
                record_id,
                reason: "map key is not a provider id".to_owned(),
            });
        }
        if let Some(contributed_id) = contribution.id {
            if contributed_id != record_id {
                return Err(PluginError::InvalidContribution {
                    kind: "provider",
                    record_id,
                    reason: format!("record id {contributed_id} does not match its map key"),
                });
            }
        }
        providers.insert(
            record_id.clone(),
            ProviderRecord {
                id: record_id,
                title: contribution.title,
            },
        );
    }

    match providers.get_mut(&id) {
        Some(own_provider) => {
            if own_provider.title.is_none() {
                own_provider.title = Some(title.clone());
            }
        }
        None => {
            providers.insert(
                id.clone(),
                ProviderRecord {
                    id: id.clone(),
                    title: Some(title.clone()),
                },
            );
        }
    }

    for (local_id, system) in &declaration.contributes.config.systems {
        if local_id.is_empty() {
            return Err(PluginError::EmptyContributionId { kind: "system" });
        }
        if system.id != *local_id {
            return Err(PluginError::InvalidContribution {
                kind: "system",
                record_id: local_id.clone(),
                reason: format!("record id {} does not match its local key", system.id),
            });
        }
    }

    for (local_id, launcher) in &declaration.contributes.config.launchers {
        if local_id.is_empty() {
            return Err(PluginError::EmptyContributionId { kind: "launcher" });
        }
        let expected_id = plugin_record_id(&id, local_id);
        if launcher.id != expected_id {
            return Err(PluginError::InvalidContribution {
                kind: "launcher",
                record_id: local_id.clone(),
                reason: format!("record id {} must be {expected_id}", launcher.id),
            });
        }
        if let Some(provider_id) = &launcher.plugin {
            if !is_provider_id(provider_id) {
                return Err(PluginError::InvalidPluginId(provider_id.clone()));
            }
        }
        if launcher.command.as_deref() == Some("") {
            return Err(PluginError::EmptyContributionId {
                kind: "launcher command",
            });
        }
        if let Some(android) = &launcher.android {
            if !is_android_identifier(&android.package_name, false)
                || !is_android_identifier(&android.class_name, true)
            {
                return Err(PluginError::InvalidContribution {
                    kind: "launcher",
                    record_id: local_id.clone(),
                    reason: "Android package and class names must be fully qualified identifiers"
                        .to_owned(),
                });
            }
        }
        if launcher
            .linux
            .as_ref()
            .is_some_and(|linux| !is_environment_key(&linux.executable_env))
        {
            return Err(PluginError::InvalidContribution {
                kind: "launcher",
                record_id: local_id.clone(),
                reason: "Linux executable environment key is invalid".to_owned(),
            });
        }
    }

    for (local_id, transport) in &declaration.contributes.config.transports {
        if local_id.is_empty() {
            return Err(PluginError::EmptyContributionId { kind: "transport" });
        }
        let expected_id = plugin_record_id(&id, local_id);
        if transport.id != expected_id {
            return Err(PluginError::InvalidContribution {
                kind: "transport",
                record_id: local_id.clone(),
                reason: format!("record id {} must be {expected_id}", transport.id),
            });
        }
    }

    for (local_id, runtime) in &declaration.contributes.config.runtimes {
        if local_id.is_empty() {
            return Err(PluginError::EmptyContributionId { kind: "runtime" });
        }
        let expected_id = plugin_record_id(&id, local_id);
        if runtime.id != expected_id {
            return Err(PluginError::InvalidContribution {
                kind: "runtime",
                record_id: local_id.clone(),
                reason: format!("record id {} must be {expected_id}", runtime.id),
            });
        }
        if runtime.kind.is_empty()
            || runtime.app.is_empty()
            || !is_safe_absolute_path(&runtime.path)
            || runtime
                .linux
                .as_ref()
                .is_some_and(|linux| !is_environment_key(&linux.path_env))
        {
            return Err(PluginError::InvalidContribution {
                kind: "runtime",
                record_id: local_id.clone(),
                reason: "runtime kind and app must be non-empty, Android path must be a safe absolute path, and Linux environment key must be valid"
                    .to_owned(),
            });
        }
    }

    let owned_launchers: BTreeSet<String> = declaration
        .contributes
        .config
        .launchers
        .values()
        .map(|record| record.id.clone())
        .collect();
    let owned_transports: BTreeSet<String> = declaration
        .contributes
        .config
        .transports
        .values()
        .map(|record| record.id.clone())
        .collect();
    let owned_runtimes: BTreeSet<String> = declaration
        .contributes
        .config
        .runtimes
        .values()
        .map(|record| record.id.clone())
        .collect();

    for (local_id, control) in &mut declaration.contributes.session_controls {
        if local_id.is_empty() {
            return Err(PluginError::EmptyContributionId {
                kind: "session control",
            });
        }
        if !is_plugin_record_id(&control.id, &id) {
            return Err(PluginError::InvalidContribution {
                kind: "session control",
                record_id: local_id.clone(),
                reason: format!("record id {} must belong to {id}", control.id),
            });
        }
        let owns_context = match control.owner.kind {
            SessionControlOwnerKind::Launcher => owned_launchers.contains(&control.owner.id),
            SessionControlOwnerKind::Transport => owned_transports.contains(&control.owner.id),
            SessionControlOwnerKind::Runtime => owned_runtimes.contains(&control.owner.id),
        };
        if !owns_context {
            return Err(PluginError::InvalidContribution {
                kind: "session control",
                record_id: local_id.clone(),
                reason: format!(
                    "owner {} is not a {:?} contribution of {id}",
                    control.owner.id, control.owner.kind
                ),
            });
        }
        if control.effect.plugin_id() != id {
            return Err(PluginError::InvalidContribution {
                kind: "session control",
                record_id: local_id.clone(),
                reason: "effect belongs to another integration".to_owned(),
            });
        }
        validate_session_control(local_id, control)?;
        control.plugin_id = id.clone();
        control.local_id = local_id.clone();
    }

    Ok(Plugin {
        id,
        title,
        description: declaration.description,
        providers,
        systems: declaration.contributes.config.systems,
        launchers: declaration.contributes.config.launchers,
        transports: declaration.contributes.config.transports,
        runtimes: declaration.contributes.config.runtimes,
        session_controls: declaration.contributes.session_controls,
    })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum SessionControlKind {
    Command,
    Toggle,
    Choice,
    Range,
}

impl SessionControlEffect {
    fn control_kind(self) -> SessionControlKind {
        match self {
            Self::MoonlightSetFillMode
            | Self::MoonlightSetZoomMode
            | Self::MoonlightSetFaceButtonFlip
            | Self::MoonlightSetRumble
            | Self::MoonlightSetPictureInPicture => SessionControlKind::Toggle,
            Self::MoonlightSetMouseMode => SessionControlKind::Choice,
            Self::MoonlightSetSgsrQuality | Self::MoonlightSetSgsrSharpness => {
                SessionControlKind::Range
            }
            Self::RetroarchOpenMenu
            | Self::MoonlightDisconnect
            | Self::MoonlightQuitHost
            | Self::MoonlightToggleKeyboard
            | Self::MoonlightToggleFullKeyboard
            | Self::MoonlightRotateScreen
            | Self::MoonlightToggleHud
            | Self::MoonlightToggleFloatingMenu
            | Self::MoonlightToggleKeyboardController
            | Self::MoonlightSwitchTouchSensitivity
            | Self::MoonlightSetLocalCursor => SessionControlKind::Command,
        }
    }
}

fn validate_session_control(
    local_id: &str,
    control: &SessionControlRecord,
) -> Result<(), PluginError> {
    let invalid = |reason: &str| PluginError::InvalidContribution {
        kind: "session control",
        record_id: local_id.to_owned(),
        reason: reason.to_owned(),
    };

    if control.label.trim().is_empty() {
        return Err(invalid("label must not be empty"));
    }
    if control
        .description
        .as_ref()
        .is_some_and(|description| description.trim().is_empty())
    {
        return Err(invalid("description must not be empty"));
    }

    let declared_kind = match &control.interaction {
        SessionControlDeclarationInteraction::Command => SessionControlKind::Command,
        SessionControlDeclarationInteraction::Toggle => SessionControlKind::Toggle,
        SessionControlDeclarationInteraction::Choice { options } => {
            if options.is_empty() {
                return Err(invalid("choice controls must declare at least one option"));
            }
            let mut values = BTreeSet::new();
            for option in options {
                if option.value.trim().is_empty() || option.label.trim().is_empty() {
                    return Err(invalid("choice option values and labels must not be empty"));
                }
                if !values.insert(option.value.as_str()) {
                    return Err(invalid("choice option values must be unique"));
                }
            }
            SessionControlKind::Choice
        }
        SessionControlDeclarationInteraction::Range { min, max, step } => {
            if !min.is_finite()
                || !max.is_finite()
                || !step.is_finite()
                || *min > *max
                || *step <= 0.0
                || min + step == *min
            {
                return Err(invalid("range bounds and step are invalid"));
            }
            SessionControlKind::Range
        }
    };
    if declared_kind != control.effect.control_kind() {
        return Err(invalid(
            "control form does not match the allowlisted effect",
        ));
    }
    Ok(())
}

fn insert_unique<T>(
    records: &mut BTreeMap<String, T>,
    id: String,
    record: T,
) -> Result<(), PluginError> {
    if records.insert(id.clone(), record).is_some() {
        return Err(PluginError::DuplicateContribution(id));
    }
    Ok(())
}

fn plugin_record_id(plugin_id: &str, local_id: &str) -> String {
    format!("{plugin_id}/{local_id}")
}

fn is_plugin_record_id(value: &str, plugin_id: &str) -> bool {
    value
        .strip_prefix(plugin_id)
        .and_then(|suffix| suffix.strip_prefix('/'))
        .is_some_and(|local_id| {
            !local_id.is_empty()
                && local_id.chars().all(|character| {
                    character.is_ascii_lowercase()
                        || character.is_ascii_digit()
                        || matches!(character, '-' | '_' | '.')
                })
        })
}

fn is_provider_id(value: &str) -> bool {
    let Some(without_at) = value.strip_prefix('@') else {
        return false;
    };
    let Some((namespace, name)) = without_at.split_once(':') else {
        return false;
    };
    !namespace.contains(':') && is_provider_segment(namespace) && is_provider_segment(name)
}

fn is_provider_segment(value: &str) -> bool {
    let mut chars = value.chars();
    matches!(chars.next(), Some(first) if first.is_ascii_lowercase() || first.is_ascii_digit())
        && chars.all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '.' | '_' | '-')
        })
}

fn is_android_identifier(value: &str, allow_dollar: bool) -> bool {
    value.split('.').all(|segment| {
        let mut chars = segment.chars();
        matches!(chars.next(), Some(first) if first.is_ascii_alphabetic() || first == '_')
            && chars.all(|character| {
                character.is_ascii_alphanumeric()
                    || character == '_'
                    || (allow_dollar && character == '$')
            })
    }) && value.contains('.')
}

fn is_environment_key(value: &str) -> bool {
    let mut characters = value.chars();
    matches!(characters.next(), Some(first) if first.is_ascii_uppercase() || first == '_')
        && characters.all(|character| {
            character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
        })
}

fn is_safe_absolute_path(value: &str) -> bool {
    if value
        .chars()
        .any(|character| character.is_control() || matches!(character, '"' | '\\'))
    {
        return false;
    }
    let path = Path::new(value);
    path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::RootDir | Component::Normal(_)))
}

fn deserialize_optional_non_null<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}

fn titleize(id: &str) -> String {
    id.split(['-', '_', '.'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut characters = part.chars();
            match characters.next() {
                Some(first) => first.to_uppercase().chain(characters).collect(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
