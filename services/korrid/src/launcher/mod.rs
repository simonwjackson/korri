mod android_app;
mod retroarch;
mod types;

use crate::{
    config::{
        resolver::{self, ResolvedRoute, RouteDiagnostic},
        snapshot::{ConfigSnapshotState, SnapshotAuthorization},
    },
    plugin::PluginRegistry,
};
use std::path::Path;

pub use types::{AndroidComponent, FileProvisionMode, LaunchSpec, LocalGame, ProvisionedFile};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalGameCatalog {
    pub games: Vec<LocalGame>,
    pub diagnostics: Vec<RouteDiagnostic>,
}

#[derive(Debug, thiserror::Error)]
pub enum LaunchError {
    #[error("unknown local game: {0}")]
    UnknownGame(String),
    #[error("local ROM is missing: {0}")]
    RomMissing(String),
    #[error("local storage is unavailable: {0}")]
    StorageAccess(String),
    #[error("failed to provision RetroArch config: {0}")]
    Config(String),
    #[error("local configuration is unauthorized: {0}")]
    ConfigUnauthorized(String),
    #[error("local route is unavailable: {0}")]
    RouteUnavailable(String),
    #[error("local route collides with another route: {0}")]
    RouteCollision(String),
}

/// Static local playable ids owned by built-in launchers. Dynamic configuration
/// may not shadow these ids; list diagnostics report the collision and direct
/// launches continue to use the static owner.
pub fn static_playable_ids() -> Vec<&'static str> {
    retroarch::static_playable_ids()
}

/// Everything playable on this device, from the immutable configuration state
/// returned by the caller's reload plus every built-in launcher it knows.
pub fn local_games(
    config_state: &ConfigSnapshotState,
    registry: &PluginRegistry,
) -> LocalGameCatalog {
    let mut diagnostics = Vec::new();
    let mut games = Vec::new();

    if config_state.authorization == SnapshotAuthorization::Authorized {
        let catalog = resolver::resolve_launchable_routes(
            &config_state.snapshot,
            registry,
            static_playable_ids(),
        );
        diagnostics.extend(catalog.diagnostics);
        games.extend(catalog.routes.into_iter().map(local_game_from_route));
    }

    games.extend(retroarch::local_games());
    LocalGameCatalog { games, diagnostics }
}

/// Build the launch instruction for a game. Static launchers retain ownership
/// of their ids; non-static ids present in the retained snapshot must resolve
/// through the enabled plugin registry and never fall through to RetroArch.
pub fn launch_game(
    root: &Path,
    game_id: &str,
    provision_mode: FileProvisionMode,
    config_state: &ConfigSnapshotState,
    registry: &PluginRegistry,
) -> Result<LaunchSpec, LaunchError> {
    if retroarch::owns_game(game_id) {
        return retroarch::launch_game(root, game_id, provision_mode);
    }

    if config_state.snapshot.library.contains_key(game_id) {
        if config_state.authorization != SnapshotAuthorization::Authorized {
            let message = config_state
                .diagnostic
                .as_ref()
                .map(|diagnostic| diagnostic.message.clone())
                .unwrap_or_else(|| "local configuration storage is unavailable".to_owned());
            return Err(LaunchError::ConfigUnauthorized(message));
        }

        let route = resolver::resolve_route(
            &config_state.snapshot,
            registry,
            static_playable_ids(),
            game_id,
        )
        .map_err(launch_error_from_route_diagnostic)?;
        return android_app::launch_route(&route)
            .map_err(|error| LaunchError::RouteUnavailable(error.to_string()));
    }

    retroarch::launch_game(root, game_id, provision_mode)
}

fn local_game_from_route(route: ResolvedRoute) -> LocalGame {
    LocalGame {
        id: route.playable_id,
        title: route.title.unwrap_or(route.release_id),
        system: route.system_id,
    }
}

fn launch_error_from_route_diagnostic(diagnostic: RouteDiagnostic) -> LaunchError {
    match diagnostic.code {
        resolver::RouteDiagnosticCode::LocalRouteUnavailable => {
            LaunchError::RouteUnavailable(diagnostic.message)
        }
        resolver::RouteDiagnosticCode::LocalRouteCollision => {
            LaunchError::RouteCollision(diagnostic.message)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        config::snapshot::ConfigSnapshotCoordinator,
        plugin::PluginRegistry,
        plugin_policy::{bundled_plugin_policy_layer, bundled_plugins, resolve_enabled_plugin_ids},
    };
    use tempfile::tempdir;

    const CHECKPOINT_CONFIG: &str =
        include_str!("../../../../docs/research/android-app-plugin-schema-checkpoint/config.yaml");
    const CHECKPOINT_LIBRARY: &str =
        include_str!("../../../../docs/research/android-app-plugin-schema-checkpoint/library.yaml");

    fn registry() -> PluginRegistry {
        PluginRegistry::new(
            bundled_plugins().unwrap(),
            resolve_enabled_plugin_ids([bundled_plugin_policy_layer()]),
        )
        .unwrap()
    }

    fn checkpoint_state(root: &Path) -> ConfigSnapshotState {
        std::fs::write(root.join("config.yaml"), CHECKPOINT_CONFIG).unwrap();
        std::fs::write(root.join("library.yaml"), CHECKPOINT_LIBRARY).unwrap();
        ConfigSnapshotCoordinator::new(root).reload()
    }

    #[test]
    fn lists_dynamic_games_before_static_games_without_hardcoded_android_entries() {
        let root = tempdir().unwrap();
        let state = checkpoint_state(root.path());
        let catalog = local_games(&state, &registry());

        assert_eq!(
            catalog
                .games
                .iter()
                .map(|game| game.id.as_str())
                .collect::<Vec<_>>(),
            vec!["tmnt-shredders-revenge", "wl4"]
        );
        assert!(catalog.diagnostics.is_empty());
    }

    #[test]
    fn routes_a_configured_android_game_through_the_plugin_mapper() {
        let root = tempdir().unwrap();
        let state = checkpoint_state(root.path());
        let spec = launch_game(
            root.path(),
            "tmnt-shredders-revenge",
            FileProvisionMode::Deferred,
            &state,
            &registry(),
        )
        .expect("android route should launch");

        assert_eq!(spec.launcher_id, "android-app");
        assert_eq!(spec.component.package_name, "com.playdigious.tmnt");
    }

    #[test]
    fn still_reports_retroarch_failures_for_retroarch_games() {
        let root = tempdir().unwrap();
        let state = ConfigSnapshotCoordinator::new(root.path()).reload();
        let error = launch_game(
            root.path(),
            "wl4",
            FileProvisionMode::Deferred,
            &state,
            &registry(),
        )
        .expect_err("rom is absent");
        assert!(
            matches!(error, LaunchError::RomMissing(_)),
            "got: {error:?}"
        );
    }
}
