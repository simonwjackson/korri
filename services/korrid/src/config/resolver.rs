use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::plugin::{
    AndroidLauncherRecord, LauncherRecord, PluginRegistry, ProviderRecord, RuntimeRecord,
    SystemRecord,
};

use super::{AppPayload, ConfigSnapshot, Target};

const PROCESS_LAUNCHER_KIND: &str = "@korri:process";
const ANDROID_APP_COMMAND: &str = "android-app";
const RETROARCH_COMMAND: &str = "retroarch";
const LIBRETRO_CORE_KIND: &str = "libretro-core";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RouteCatalog {
    pub routes: Vec<ResolvedRoute>,
    pub diagnostics: Vec<RouteDiagnostic>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolvedAndroidComponent {
    pub package_name: String,
    pub class_name: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolvedRuntime {
    pub id: String,
    pub kind: String,
    pub app: String,
    pub path: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolvedFileTarget {
    pub storage_id: String,
    pub path: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolvedRoute {
    pub playable_id: String,
    pub title: Option<String>,
    pub release_id: String,
    pub provider_id: String,
    pub system_id: String,
    pub system_title: Option<String>,
    pub launcher_id: String,
    pub launcher_kind: String,
    pub integration_token: String,
    pub flattened_target: String,
    pub android_component: Option<ResolvedAndroidComponent>,
    pub runtime: Option<ResolvedRuntime>,
    pub file_target: Option<ResolvedFileTarget>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum RouteDiagnosticCode {
    LocalRouteUnavailable,
    LocalRouteCollision,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct RouteDiagnostic {
    pub code: RouteDiagnosticCode,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playable_id: Option<String>,
}

pub type RouteUnavailable = RouteDiagnostic;

#[derive(Clone, Debug)]
struct RouteLauncher {
    id: String,
    plugin: Option<String>,
    command: Option<String>,
    systems: Option<Vec<String>>,
    android: Option<AndroidLauncherRecord>,
}

#[derive(Clone, Debug, Default)]
struct Contributions {
    providers: BTreeMap<String, ProviderRecord>,
    systems: BTreeMap<String, SystemRecord>,
    launchers: BTreeMap<String, RouteLauncher>,
    runtimes: BTreeMap<String, RuntimeRecord>,
    provider_collisions: BTreeSet<String>,
    system_collisions: BTreeSet<String>,
    launcher_collisions: BTreeSet<String>,
}

pub fn resolve_launchable_routes<'a>(
    snapshot: &ConfigSnapshot,
    registry: &PluginRegistry,
    static_playable_ids: impl IntoIterator<Item = &'a str>,
) -> RouteCatalog {
    let contributions = compose_contributions(snapshot, registry);
    let static_playable_ids: BTreeSet<String> =
        static_playable_ids.into_iter().map(str::to_owned).collect();
    let mut routes = Vec::new();
    let mut diagnostics = Vec::new();

    for playable_id in snapshot.library.keys() {
        if static_playable_ids.contains(playable_id) {
            diagnostics.push(static_playable_collision(playable_id));
            continue;
        }

        match resolve_route_with_contributions(snapshot, &contributions, playable_id) {
            Ok(route) => routes.push(route),
            Err(diagnostic) => diagnostics.push(diagnostic),
        }
    }

    RouteCatalog {
        routes,
        diagnostics,
    }
}

pub fn resolve_route<'a>(
    snapshot: &ConfigSnapshot,
    registry: &PluginRegistry,
    static_playable_ids: impl IntoIterator<Item = &'a str>,
    playable_id: &str,
) -> Result<ResolvedRoute, RouteUnavailable> {
    if static_playable_ids
        .into_iter()
        .any(|static_playable_id| static_playable_id == playable_id)
    {
        return Err(static_playable_collision(playable_id));
    }

    let contributions = compose_contributions(snapshot, registry);
    resolve_route_with_contributions(snapshot, &contributions, playable_id)
}

fn resolve_route_with_contributions(
    snapshot: &ConfigSnapshot,
    contributions: &Contributions,
    playable_id: &str,
) -> Result<ResolvedRoute, RouteUnavailable> {
    let item = snapshot.library.get(playable_id).ok_or_else(|| {
        unavailable(
            Some(playable_id),
            format!("local playable {playable_id} is not present in library.yaml"),
        )
    })?;

    let release = select_launchable_release(playable_id, &item.releases.0)?;
    let launch = release
        .launch
        .as_ref()
        .expect("selected release has launch");
    let target = release
        .target
        .as_ref()
        .expect("selected release has target");
    let launcher_id = launch.use_launcher.as_ref().ok_or_else(|| {
        unavailable(
            Some(playable_id),
            format!(
                "release {} has no launch.use launcher selection",
                release.id.0
            ),
        )
    })?;

    if contributions.launcher_collisions.contains(&launcher_id.0) {
        return Err(collision(
            Some(playable_id),
            format!(
                "launcher {} is declared by both user configuration and an enabled plugin",
                launcher_id.0
            ),
        ));
    }
    let launcher = contributions.launchers.get(&launcher_id.0).ok_or_else(|| {
        unavailable(
            Some(playable_id),
            format!("launcher {} is unavailable", launcher_id.0),
        )
    })?;

    let system_id = release.system.0.as_str();
    if contributions.system_collisions.contains(system_id) {
        return Err(collision(
            Some(playable_id),
            format!(
                "system {system_id} is declared by both user configuration and an enabled plugin"
            ),
        ));
    }
    let system = contributions.systems.get(system_id).ok_or_else(|| {
        unavailable(
            Some(playable_id),
            format!("system {system_id} is unavailable"),
        )
    })?;

    let launcher_kind = launcher.plugin.as_deref().unwrap_or(PROCESS_LAUNCHER_KIND);
    if launcher_kind == PROCESS_LAUNCHER_KIND {
        return Err(unavailable(
            Some(playable_id),
            format!(
                "launcher {} has no plugin kind; process fallback is not supported",
                launcher.id
            ),
        ));
    }

    if let Some(systems) = &launcher.systems {
        if !systems.is_empty() && !systems.iter().any(|candidate| candidate == system_id) {
            return Err(unavailable(
                Some(playable_id),
                format!(
                    "launcher {} does not support system {system_id}",
                    launcher.id
                ),
            ));
        }
    }

    let command = launcher.command.as_deref().ok_or_else(|| {
        unavailable(
            Some(playable_id),
            format!("launcher {} has no integration command", launcher.id),
        )
    })?;
    if !matches!(command, ANDROID_APP_COMMAND | RETROARCH_COMMAND) {
        return Err(unavailable(
            Some(playable_id),
            format!(
                "launcher {} command {command} is not supported",
                launcher.id
            ),
        ));
    }

    let (provider_id, flattened_target, file_target) = match (command, target) {
        (
            ANDROID_APP_COMMAND,
            Target::ProviderRef {
                provider,
                provider_ref,
            },
        ) => (
            provider.0.clone(),
            format!("{}:{}", provider.0, provider_ref.0),
            None,
        ),
        (
            RETROARCH_COMMAND,
            Target::File {
                discovery: Some(_), ..
            },
        ) => {
            return Err(unavailable(
                Some(playable_id),
                format!(
                    "release {} file-target discovery metadata is not executable",
                    release.id.0
                ),
            ));
        }
        (
            RETROARCH_COMMAND,
            Target::File {
                storage,
                path,
                discovery: None,
            },
        ) => (
            launcher_kind.to_owned(),
            format!("{}:{}", storage.0, path.0),
            Some(ResolvedFileTarget {
                storage_id: storage.0.clone(),
                path: path.0.clone(),
            }),
        ),
        (_, other) => {
            return Err(unavailable(
                Some(playable_id),
                format!(
                    "release {} target kind {} is not supported for plugin routes",
                    release.id.0,
                    target_kind(other)
                ),
            ));
        }
    };

    if contributions.provider_collisions.contains(&provider_id) {
        return Err(collision(
            Some(playable_id),
            format!("provider {provider_id} is declared by both user configuration and an enabled plugin"),
        ));
    }
    if !contributions.providers.contains_key(&provider_id) {
        return Err(unavailable(
            Some(playable_id),
            format!("provider {provider_id} is unavailable"),
        ));
    }
    if command == ANDROID_APP_COMMAND && launcher_kind != provider_id {
        return Err(unavailable(
            Some(playable_id),
            format!(
                "launcher {} belongs to {launcher_kind}, not provider {provider_id}",
                launcher.id
            ),
        ));
    }

    let runtime = match command {
        ANDROID_APP_COMMAND => {
            if launch.runtime.is_some() {
                return Err(unavailable(
                    Some(playable_id),
                    format!("launcher {} does not accept a runtime", launcher.id),
                ));
            }
            None
        }
        RETROARCH_COMMAND => {
            let runtime_id = launch.runtime.as_ref().ok_or_else(|| {
                unavailable(
                    Some(playable_id),
                    format!("launcher {} requires launch.runtime", launcher.id),
                )
            })?;
            let runtime = contributions.runtimes.get(&runtime_id.0).ok_or_else(|| {
                unavailable(
                    Some(playable_id),
                    format!("runtime {} is unavailable", runtime_id.0),
                )
            })?;
            if runtime.kind != LIBRETRO_CORE_KIND {
                return Err(unavailable(
                    Some(playable_id),
                    format!(
                        "runtime {} has kind {}, expected {LIBRETRO_CORE_KIND}",
                        runtime.id, runtime.kind
                    ),
                ));
            }
            if runtime.app != launcher.id {
                return Err(unavailable(
                    Some(playable_id),
                    format!(
                        "runtime {} belongs to {}, not launcher {}",
                        runtime.id, runtime.app, launcher.id
                    ),
                ));
            }
            let supported_systems = runtime
                .supports
                .as_ref()
                .and_then(|supports| supports.systems.as_ref())
                .filter(|systems| !systems.is_empty())
                .ok_or_else(|| {
                    unavailable(
                        Some(playable_id),
                        format!("runtime {} declares no supported systems", runtime.id),
                    )
                })?;
            if !supported_systems
                .iter()
                .any(|candidate| candidate == system_id)
            {
                return Err(unavailable(
                    Some(playable_id),
                    format!("runtime {} does not support system {system_id}", runtime.id),
                ));
            }
            Some(ResolvedRuntime {
                id: runtime.id.clone(),
                kind: runtime.kind.clone(),
                app: runtime.app.clone(),
                path: runtime.path.clone(),
            })
        }
        _ => unreachable!("integration token was validated above"),
    };

    let android_component = launcher
        .android
        .as_ref()
        .map(|component| ResolvedAndroidComponent {
            package_name: component.package_name.clone(),
            class_name: component.class_name.clone(),
        });
    if command == RETROARCH_COMMAND && android_component.is_none() {
        return Err(unavailable(
            Some(playable_id),
            format!("launcher {} has no Android component", launcher.id),
        ));
    }

    Ok(ResolvedRoute {
        playable_id: playable_id.to_owned(),
        title: item.title.clone(),
        release_id: release.id.0.clone(),
        provider_id,
        system_id: system_id.to_owned(),
        system_title: system.title.clone(),
        launcher_id: launcher.id.clone(),
        launcher_kind: launcher_kind.to_owned(),
        integration_token: command.to_owned(),
        flattened_target,
        android_component,
        runtime,
        file_target,
    })
}

fn compose_contributions(snapshot: &ConfigSnapshot, registry: &PluginRegistry) -> Contributions {
    let mut contributions = Contributions::default();

    for (id, record) in registry.providers() {
        contributions.providers.insert(id.clone(), record.clone());
    }
    for record in registry.systems().values() {
        contributions
            .systems
            .insert(record.id.clone(), record.clone());
    }
    for record in registry.launchers().values() {
        contributions
            .launchers
            .insert(record.id.clone(), launcher_from_plugin(record));
    }
    for record in registry.runtimes().values() {
        contributions
            .runtimes
            .insert(record.id.clone(), record.clone());
    }

    for (id, provider) in &snapshot.providers {
        if contributions.providers.contains_key(id) {
            contributions.provider_collisions.insert(id.clone());
            contributions.providers.remove(id);
        } else if registry.owns_registered_provider_id(id) {
            continue;
        } else {
            contributions.providers.insert(
                id.clone(),
                ProviderRecord {
                    id: id.clone(),
                    title: provider.title.clone(),
                },
            );
        }
    }

    for (id, system) in &snapshot.systems {
        if contributions.systems.contains_key(id) {
            contributions.system_collisions.insert(id.clone());
            contributions.systems.remove(id);
        } else if registry.owns_registered_system_id(id) {
            continue;
        } else {
            contributions.systems.insert(
                id.clone(),
                SystemRecord {
                    id: id.clone(),
                    title: system.title.clone().or_else(|| system.name.clone()),
                },
            );
        }
    }

    for (id, launcher) in &snapshot.launchers {
        if contributions.launchers.contains_key(id) {
            contributions.launcher_collisions.insert(id.clone());
            contributions.launchers.remove(id);
        } else if registry.owns_registered_launcher_id(id) {
            continue;
        } else {
            contributions
                .launchers
                .insert(id.clone(), launcher_from_snapshot(id, launcher));
        }
    }

    contributions
}

fn launcher_from_plugin(record: &LauncherRecord) -> RouteLauncher {
    RouteLauncher {
        id: record.id.clone(),
        plugin: record.plugin.clone(),
        command: record.command.clone(),
        systems: record.systems.clone(),
        android: record.android.clone(),
    }
}

fn launcher_from_snapshot(id: &str, payload: &AppPayload) -> RouteLauncher {
    RouteLauncher {
        id: id.to_owned(),
        plugin: payload.plugin.as_ref().map(|value| value.0.clone()),
        command: payload.command.as_ref().map(|value| value.0.clone()),
        systems: payload.systems.clone(),
        android: None,
    }
}

fn select_launchable_release<'a>(
    playable_id: &str,
    releases: &'a [super::LibraryReleasePayload],
) -> Result<&'a super::LibraryReleasePayload, RouteUnavailable> {
    let launchable: Vec<&super::LibraryReleasePayload> = releases
        .iter()
        .filter(|release| release.target.is_some() && release.launch.is_some())
        .collect();
    match launchable.as_slice() {
        [] => Err(unavailable(
            Some(playable_id),
            format!("local playable {playable_id} has no launchable releases"),
        )),
        [release] => Ok(*release),
        many => Err(unavailable(
            Some(playable_id),
            format!(
                "local playable {playable_id} has ambiguous launchable releases: {}",
                many.iter()
                    .map(|release| release.id.0.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
        )),
    }
}

fn target_kind(target: &Target) -> &'static str {
    match target {
        Target::File { .. } => "file",
        Target::FileSet { .. } => "file-set",
        Target::Executable { .. } => "executable",
        Target::Url { .. } => "url",
        Target::ProviderRef { .. } => "provider-ref",
    }
}

fn static_playable_collision(playable_id: &str) -> RouteUnavailable {
    collision(
        Some(playable_id),
        format!(
            "dynamic local route {playable_id} collides with an existing static local game; the static route remains active"
        ),
    )
}

fn unavailable(playable_id: Option<&str>, message: String) -> RouteUnavailable {
    RouteUnavailable {
        code: RouteDiagnosticCode::LocalRouteUnavailable,
        message,
        playable_id: playable_id.map(str::to_owned),
    }
}

fn collision(playable_id: Option<&str>, message: String) -> RouteUnavailable {
    RouteUnavailable {
        code: RouteDiagnosticCode::LocalRouteCollision,
        message,
        playable_id: playable_id.map(str::to_owned),
    }
}
