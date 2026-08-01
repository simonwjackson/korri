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
        for route in catalog.routes {
            match android_app::launch_route(&route) {
                Ok(_) => games.push(local_game_from_route(route)),
                Err(error) => diagnostics.push(RouteDiagnostic {
                    code: resolver::RouteDiagnosticCode::LocalRouteUnavailable,
                    message: error.to_string(),
                    playable_id: Some(route.playable_id),
                }),
            }
        }
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

    if config_state.authorization != SnapshotAuthorization::Authorized {
        if config_state.generation == 0 || config_state.snapshot.library.contains_key(game_id) {
            let message = config_state
                .diagnostic
                .as_ref()
                .map(|diagnostic| diagnostic.message.clone())
                .unwrap_or_else(|| "local configuration storage is unavailable".to_owned());
            return Err(LaunchError::ConfigUnauthorized(message));
        }
        return retroarch::launch_game(root, game_id, provision_mode);
    }

    if config_state.snapshot.library.contains_key(game_id) {
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
        config::{
            snapshot::{
                ConfigSnapshotCoordinator, SnapshotAuthorization, SnapshotDiagnostic,
                SnapshotDiagnosticCode,
            },
            ConfigSnapshot,
        },
        plugin::PluginRegistry,
        plugin_policy::{
            bundled_plugin_policy_layer, bundled_plugins, resolve_enabled_plugin_ids,
            PluginPolicyLayer,
        },
    };
    use std::sync::Arc;
    use tempfile::tempdir;

    const CHECKPOINT_CONFIG: &str =
        include_str!("../../../../docs/research/android-app-plugin-schema-checkpoint/config.yaml");
    const CHECKPOINT_LIBRARY: &str =
        include_str!("../../../../docs/research/android-app-plugin-schema-checkpoint/library.yaml");

    fn registry() -> PluginRegistry {
        android_registry(true)
    }

    fn android_registry(enabled: bool) -> PluginRegistry {
        let enabled_ids = if enabled {
            resolve_enabled_plugin_ids([bundled_plugin_policy_layer()])
        } else {
            resolve_enabled_plugin_ids([
                bundled_plugin_policy_layer(),
                PluginPolicyLayer::from_enabled([("@korri:android-app", false)]),
            ])
        };
        PluginRegistry::new(bundled_plugins().unwrap(), enabled_ids).unwrap()
    }

    fn checkpoint_state(root: &Path) -> ConfigSnapshotState {
        checkpoint_state_with_library(root, CHECKPOINT_LIBRARY)
    }

    fn checkpoint_state_with_library(root: &Path, library: &str) -> ConfigSnapshotState {
        std::fs::write(root.join("config.yaml"), CHECKPOINT_CONFIG).unwrap();
        std::fs::write(root.join("library.yaml"), library).unwrap();
        ConfigSnapshotCoordinator::new(root).reload()
    }

    fn unauthorized_empty_state() -> ConfigSnapshotState {
        ConfigSnapshotState {
            snapshot: Arc::new(ConfigSnapshot::default()),
            generation: 0,
            diagnostic: Some(SnapshotDiagnostic {
                code: SnapshotDiagnosticCode::LocalConfigUnauthorized,
                message: "local configuration storage is unavailable".into(),
            }),
            authorization: SnapshotAuthorization::Unauthorized,
        }
    }

    fn unauthorized_retained_state(state: ConfigSnapshotState) -> ConfigSnapshotState {
        ConfigSnapshotState {
            snapshot: state.snapshot,
            generation: state.generation,
            diagnostic: Some(SnapshotDiagnostic {
                code: SnapshotDiagnosticCode::LocalConfigUnauthorized,
                message: "local configuration storage is unavailable".into(),
            }),
            authorization: SnapshotAuthorization::Unauthorized,
        }
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
    fn mapper_invalid_dynamic_routes_are_omitted_and_diagnosed_on_each_list() {
        let root = tempdir().unwrap();
        let invalid_library = CHECKPOINT_LIBRARY.replace(
            "ref: com.playdigious.tmnt",
            "ref: com.playdigious.tmnt/invalid",
        );
        let state = checkpoint_state_with_library(root.path(), &invalid_library);

        for catalog in [
            local_games(&state, &registry()),
            local_games(&state, &registry()),
        ] {
            assert_eq!(
                catalog
                    .games
                    .iter()
                    .map(|game| game.id.as_str())
                    .collect::<Vec<_>>(),
                vec!["wl4"]
            );
            assert_eq!(catalog.diagnostics.len(), 1);
            assert_eq!(
                catalog.diagnostics[0].code,
                resolver::RouteDiagnosticCode::LocalRouteUnavailable
            );
            assert_eq!(
                catalog.diagnostics[0].playable_id.as_deref(),
                Some("tmnt-shredders-revenge")
            );
            assert!(catalog.diagnostics[0]
                .message
                .contains("target has invalid package name"));
        }
    }

    #[test]
    fn unauthorized_retained_snapshot_blocks_known_config_backed_launches() {
        let root = tempdir().unwrap();
        let state = unauthorized_retained_state(checkpoint_state(root.path()));
        let error = launch_game(
            root.path(),
            "tmnt-shredders-revenge",
            FileProvisionMode::Deferred,
            &state,
            &registry(),
        )
        .expect_err("retained config knows this dynamic route but cannot authorize it");

        assert!(
            matches!(error, LaunchError::ConfigUnauthorized(_)),
            "got: {error:?}"
        );
    }

    #[test]
    fn unauthorized_retained_snapshot_reports_absent_ids_as_unknown_games() {
        let root = tempdir().unwrap();
        let state = unauthorized_retained_state(checkpoint_state(root.path()));
        let error = launch_game(
            root.path(),
            "not-in-retained-snapshot",
            FileProvisionMode::Deferred,
            &state,
            &registry(),
        )
        .expect_err("retained config proves this id is absent");

        assert!(
            matches!(error, LaunchError::UnknownGame(_)),
            "got: {error:?}"
        );
    }

    #[test]
    fn initial_unauthorized_empty_snapshot_blocks_non_static_direct_launches() {
        let root = tempdir().unwrap();
        let state = unauthorized_empty_state();
        let error = launch_game(
            root.path(),
            "tmnt-shredders-revenge",
            FileProvisionMode::Deferred,
            &state,
            &registry(),
        )
        .expect_err("initial unauthorized config has no absence knowledge");

        assert_eq!(state.generation, 0);
        assert!(
            matches!(error, LaunchError::ConfigUnauthorized(_)),
            "got: {error:?}"
        );

        let static_error = launch_game(
            root.path(),
            "wl4",
            FileProvisionMode::Deferred,
            &state,
            &registry(),
        )
        .expect_err("static RetroArch owner should still run before config authorization");
        assert!(
            matches!(static_error, LaunchError::RomMissing(_)),
            "got: {static_error:?}"
        );
    }

    #[test]
    fn disabled_bundled_policy_omits_dynamic_games_and_direct_launch_is_unavailable() {
        let root = tempdir().unwrap();
        let state = checkpoint_state(root.path());
        let registry = android_registry(false);
        let catalog = local_games(&state, &registry);

        assert_eq!(
            catalog
                .games
                .iter()
                .map(|game| game.id.as_str())
                .collect::<Vec<_>>(),
            vec!["wl4"]
        );
        assert_eq!(catalog.diagnostics.len(), 1);
        assert_eq!(
            catalog.diagnostics[0].code,
            resolver::RouteDiagnosticCode::LocalRouteUnavailable
        );
        assert!(catalog.diagnostics[0]
            .message
            .contains("launcher @korri:android-app/android-app is unavailable"));

        let error = launch_game(
            root.path(),
            "tmnt-shredders-revenge",
            FileProvisionMode::Deferred,
            &state,
            &registry,
        )
        .expect_err("disabled plugin route must not fall through");
        let LaunchError::RouteUnavailable(message) = error else {
            panic!("got: {error:?}");
        };
        assert!(message.contains("launcher @korri:android-app/android-app is unavailable"));
        assert!(!message.contains("process fallback"));
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
