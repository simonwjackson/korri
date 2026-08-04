mod android_app;
pub(crate) mod linux_retroarch;
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

pub use types::{
    AndroidComponent, AndroidMoonlightEffect, FileProvisionMode, LaunchSpec, LocalGame,
    PlatformEffect, PlatformInstruction, PlatformInstructionVerificationFailure,
    PlatformInstructionVerifier, ProvisionedFile,
};

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

/// Static local playable ids owned outside configuration. First-party Android
/// integrations are plugin routes, so this is intentionally empty.
pub fn static_playable_ids() -> Vec<&'static str> {
    Vec::new()
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
            let validation = match route.launcher_kind.as_str() {
                "@korri:android-app" => android_app::launch_route(&route)
                    .map(|_| ())
                    .map_err(|error| error.to_string()),
                "@korri:retroarch" => {
                    retroarch::validate_route(&route).map_err(|error| error.to_string())
                }
                other => Err(format!("unsupported launcher kind {other}")),
            };
            match validation {
                Ok(()) => games.push(local_game_from_route(route)),
                Err(message) => diagnostics.push(RouteDiagnostic {
                    code: resolver::RouteDiagnosticCode::LocalRouteUnavailable,
                    message,
                    playable_id: Some(route.playable_id),
                }),
            }
        }
    }

    LocalGameCatalog { games, diagnostics }
}

/// Build a launch instruction by resolving the library selection through the
/// enabled plugin registry. Integration mappers perform effects; plugins only
/// provide declarations.
pub fn launch_game(
    root: &Path,
    game_id: &str,
    provision_mode: FileProvisionMode,
    config_state: &ConfigSnapshotState,
    registry: &PluginRegistry,
) -> Result<LaunchSpec, LaunchError> {
    if config_state.authorization != SnapshotAuthorization::Authorized {
        if config_state.generation == 0 || config_state.snapshot.library.contains_key(game_id) {
            let message = config_state
                .diagnostic
                .as_ref()
                .map(|diagnostic| diagnostic.message.clone())
                .unwrap_or_else(|| "local configuration storage is unavailable".to_owned());
            return Err(LaunchError::ConfigUnauthorized(message));
        }
        return Err(LaunchError::UnknownGame(game_id.to_owned()));
    }

    if !config_state.snapshot.library.contains_key(game_id) {
        return Err(LaunchError::UnknownGame(game_id.to_owned()));
    }

    let route = resolver::resolve_route(
        &config_state.snapshot,
        registry,
        static_playable_ids(),
        game_id,
    )
    .map_err(launch_error_from_route_diagnostic)?;

    match route.launcher_kind.as_str() {
        "@korri:android-app" => android_app::launch_route(&route)
            .map_err(|error| LaunchError::RouteUnavailable(error.to_string())),
        "@korri:retroarch" => retroarch::launch_route(root, &route, provision_mode),
        other => Err(LaunchError::RouteUnavailable(format!(
            "unsupported launcher kind {other}"
        ))),
    }
}

fn local_game_from_route(route: ResolvedRoute) -> LocalGame {
    LocalGame {
        id: route.playable_id,
        title: route.title.unwrap_or(route.release_id),
        system: route.system_title.unwrap_or(route.system_id),
        identity: route.identity,
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
        include_str!("../../../../docs/research/retroarch-plugin-route/library.yaml");

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

    fn checkpoint_state_with_config(root: &Path, config: &str) -> ConfigSnapshotState {
        checkpoint_state_with_config_and_library(root, config, CHECKPOINT_LIBRARY)
    }

    fn checkpoint_state_with_library(root: &Path, library: &str) -> ConfigSnapshotState {
        checkpoint_state_with_config_and_library(root, CHECKPOINT_CONFIG, library)
    }

    fn checkpoint_state_with_config_and_library(
        root: &Path,
        config: &str,
        library: &str,
    ) -> ConfigSnapshotState {
        std::fs::write(root.join("config.yaml"), config).unwrap();
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
        assert_eq!(
            catalog
                .games
                .iter()
                .find(|game| game.id == "wl4")
                .and_then(|game| game.identity.as_ref()),
            Some(&crate::GameIdentity::Hash(
                "sha256:d16c7bf6e62bb84049fff1b387108fbd1e6e2cd38ca994ab5310dd9cbf9ba414".into(),
            ))
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
    fn malformed_retroarch_routes_are_omitted_and_diagnosed_in_the_catalog() {
        for library in [
            CHECKPOINT_LIBRARY.replace("path: wl4.gba", "path: ../outside.gba"),
            CHECKPOINT_LIBRARY.replace("storage: roms", "storage: outside"),
            CHECKPOINT_LIBRARY.replace(
                "path: wl4.gba",
                "path: wl4.gba\n          discovery:\n            first-seen-at: 2026-08-02",
            ),
            CHECKPOINT_LIBRARY.replace(
                "runtime: \"@korri:mgba/mgba\"",
                "runtime: \"@korri:retroarch/missing\"",
            ),
        ] {
            let root = tempdir().unwrap();
            let state = checkpoint_state_with_library(root.path(), &library);
            let catalog = local_games(&state, &registry());

            assert_eq!(
                catalog
                    .games
                    .iter()
                    .map(|game| game.id.as_str())
                    .collect::<Vec<_>>(),
                vec!["tmnt-shredders-revenge"]
            );
            assert_eq!(catalog.diagnostics.len(), 1, "{library}");
            assert_eq!(catalog.diagnostics[0].playable_id.as_deref(), Some("wl4"));
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

        let retroarch_error = launch_game(
            root.path(),
            "wl4",
            FileProvisionMode::Deferred,
            &state,
            &registry(),
        )
        .expect_err("plugin routes require an authorized configuration snapshot");
        assert!(
            matches!(retroarch_error, LaunchError::ConfigUnauthorized(_)),
            "got: {retroarch_error:?}"
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
    fn disabled_bundled_policy_rejects_copied_first_party_records() {
        let root = tempdir().unwrap();
        let state = checkpoint_state_with_config(
            root.path(),
            r#"
providers:
  "@korri:android-app": { title: "Copied Android" }
systems:
  android: { title: "Copied Android" }
launchers:
  "@korri:android-app/android-app":
    plugin: "@korri:android-app"
    command: android-app
    systems: [android]
"#,
        );
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
        assert_eq!(
            catalog.diagnostics[0].playable_id.as_deref(),
            Some("tmnt-shredders-revenge")
        );
        assert!(catalog.diagnostics[0]
            .message
            .contains("launcher @korri:android-app/android-app is unavailable"));
        assert!(!catalog.diagnostics[0].message.contains("process fallback"));

        let error = launch_game(
            root.path(),
            "tmnt-shredders-revenge",
            FileProvisionMode::Deferred,
            &state,
            &registry,
        )
        .expect_err("copied first-party records must not bypass disabled policy");
        let LaunchError::RouteUnavailable(message) = error else {
            panic!("got: {error:?}");
        };
        assert!(message.contains("launcher @korri:android-app/android-app is unavailable"));
        assert!(!message.contains("process fallback"));
    }

    #[test]
    fn still_reports_retroarch_failures_for_retroarch_games() {
        let root = tempdir().unwrap();
        let state = checkpoint_state(root.path());
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
