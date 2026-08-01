use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::plugin::{LauncherRecord, PluginRegistry, ProviderRecord, SystemRecord};

use super::{AppPayload, ConfigSnapshot, Target};

const PROCESS_LAUNCHER_KIND: &str = "@korri:process";
const ANDROID_APP_COMMAND: &str = "android-app";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RouteCatalog {
    pub routes: Vec<ResolvedRoute>,
    pub diagnostics: Vec<RouteDiagnostic>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolvedRoute {
    pub playable_id: String,
    pub title: Option<String>,
    pub release_id: String,
    pub provider_id: String,
    pub system_id: String,
    pub launcher_id: String,
    pub launcher_kind: String,
    pub integration_token: String,
    pub flattened_target: String,
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
}

#[derive(Clone, Debug, Default)]
struct Contributions {
    providers: BTreeMap<String, ProviderRecord>,
    systems: BTreeMap<String, SystemRecord>,
    launchers: BTreeMap<String, RouteLauncher>,
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
    if !contributions.systems.contains_key(system_id) {
        return Err(unavailable(
            Some(playable_id),
            format!("system {system_id} is unavailable"),
        ));
    }

    let (provider_id, provider_ref) = match target {
        Target::ProviderRef {
            provider,
            provider_ref,
        } => (provider.0.as_str(), provider_ref.0.as_str()),
        other => {
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

    if contributions.provider_collisions.contains(provider_id) {
        return Err(collision(
            Some(playable_id),
            format!("provider {provider_id} is declared by both user configuration and an enabled plugin"),
        ));
    }
    if !contributions.providers.contains_key(provider_id) {
        return Err(unavailable(
            Some(playable_id),
            format!("provider {provider_id} is unavailable"),
        ));
    }

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
    if launcher_kind != provider_id {
        return Err(unavailable(
            Some(playable_id),
            format!(
                "launcher {} belongs to {launcher_kind}, not provider {provider_id}",
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
    if command != ANDROID_APP_COMMAND {
        return Err(unavailable(
            Some(playable_id),
            format!(
                "launcher {} command {command} is not supported",
                launcher.id
            ),
        ));
    }

    Ok(ResolvedRoute {
        playable_id: playable_id.to_owned(),
        title: item.title.clone(),
        release_id: release.id.0.clone(),
        provider_id: provider_id.to_owned(),
        system_id: system_id.to_owned(),
        launcher_id: launcher.id.clone(),
        launcher_kind: launcher_kind.to_owned(),
        integration_token: command.to_owned(),
        flattened_target: format!("{provider_id}:{provider_ref}"),
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

    for (id, provider) in &snapshot.providers {
        if contributions.providers.contains_key(id) {
            contributions.provider_collisions.insert(id.clone());
            contributions.providers.remove(id);
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
    }
}

fn launcher_from_snapshot(id: &str, payload: &AppPayload) -> RouteLauncher {
    RouteLauncher {
        id: id.to_owned(),
        plugin: payload.plugin.as_ref().map(|value| value.0.clone()),
        command: payload.command.as_ref().map(|value| value.0.clone()),
        systems: payload.systems.clone(),
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
