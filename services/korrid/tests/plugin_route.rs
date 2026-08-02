use korrid::config::resolver::{
    resolve_launchable_routes, resolve_route, ResolvedRoute, RouteDiagnosticCode,
};
use korrid::config::snapshot::ConfigSnapshotCoordinator;
use korrid::config::{decode_config_pair, ConfigSnapshot};
use korrid::plugin::PluginRegistry;
use korrid::plugin_policy::{
    bundled_plugin_policy_layer, bundled_plugins, resolve_enabled_plugin_ids, PluginPolicyLayer,
};

const CHECKPOINT_CONFIG: &str =
    include_str!("../../../docs/research/android-app-plugin-schema-checkpoint/config.yaml");
const CHECKPOINT_LIBRARY: &str =
    include_str!("../../../docs/research/android-app-plugin-schema-checkpoint/library.yaml");

fn checkpoint_snapshot() -> std::sync::Arc<korrid::config::ConfigSnapshot> {
    let root = tempfile::tempdir().expect("temp root");
    std::fs::write(root.path().join("config.yaml"), CHECKPOINT_CONFIG).expect("write config");
    std::fs::write(root.path().join("library.yaml"), CHECKPOINT_LIBRARY).expect("write library");
    let coordinator = ConfigSnapshotCoordinator::new(root.path());
    let state = coordinator.reload();
    assert_eq!(state.diagnostic, None);
    state.snapshot
}

fn snapshot_from_pair(config: &str, library: &str) -> ConfigSnapshot {
    decode_config_pair(config, library).expect("test fixture should decode")
}

fn copied_android_records_config() -> &'static str {
    r#"
providers:
  "@korri:android-app": { title: "Copied Android" }
  "@korri:other": { title: "Other" }
systems:
  android: { title: "Copied Android" }
  other-system: { title: "Other System" }
launchers:
  "@korri:android-app/android-app":
    plugin: "@korri:android-app"
    command: android-app
    systems: [android]
  "@korri:other/android-app":
    plugin: "@korri:other"
    command: android-app
    systems: [other-system]
"#
}

fn copied_android_records_library() -> &'static str {
    r#"
library:
  tmnt-shredders-revenge:
    title: "TMNT: Shredder's Revenge"
    releases:
      - id: android
        system: android
        target:
          kind: provider-ref
          provider: "@korri:android-app"
          ref: com.playdigious.tmnt
        launch:
          use: "@korri:android-app/android-app"
  other-game:
    title: "Other Game"
    releases:
      - id: android
        system: other-system
        target:
          kind: provider-ref
          provider: "@korri:other"
          ref: package.name
        launch:
          use: "@korri:other/android-app"
"#
}

fn android_registry(enabled: bool) -> PluginRegistry {
    let plugins = bundled_plugins().expect("bundled plugins should load");
    let enabled_ids = if enabled {
        resolve_enabled_plugin_ids([bundled_plugin_policy_layer()])
    } else {
        resolve_enabled_plugin_ids([
            bundled_plugin_policy_layer(),
            PluginPolicyLayer::from_enabled([("@korri:android-app", false)]),
        ])
    };
    PluginRegistry::new(plugins, enabled_ids).expect("registry should compose")
}

fn assert_checkpoint_route(route: &ResolvedRoute) {
    assert_eq!(route.playable_id, "tmnt-shredders-revenge");
    assert_eq!(route.title.as_deref(), Some("TMNT: Shredder's Revenge"));
    assert_eq!(route.release_id, "android");
    assert_eq!(route.provider_id, "@korri:android-app");
    assert_eq!(route.system_id, "android");
    assert_eq!(route.system_title.as_deref(), Some("Android"));
    assert_eq!(route.launcher_id, "@korri:android-app/android-app");
    assert_eq!(route.launcher_kind, "@korri:android-app");
    assert_eq!(route.integration_token, "android-app");
    assert_eq!(
        route.flattened_target,
        "@korri:android-app:com.playdigious.tmnt"
    );
}

#[test]
fn checkpoint_route_resolves_through_the_default_enabled_registry() {
    let snapshot = checkpoint_snapshot();
    let registry = android_registry(true);

    let catalog = resolve_launchable_routes(&snapshot, &registry, ["wl4"]);

    assert!(catalog.diagnostics.is_empty(), "{:?}", catalog.diagnostics);
    assert_eq!(catalog.routes.len(), 1);
    assert_checkpoint_route(&catalog.routes[0]);
    let direct = resolve_route(&snapshot, &registry, ["wl4"], "tmnt-shredders-revenge")
        .expect("direct checkpoint route should resolve");
    assert_checkpoint_route(&direct);
}

#[test]
fn checkpoint_route_is_unavailable_when_the_plugin_is_disabled() {
    let snapshot = checkpoint_snapshot();
    let registry = android_registry(false);

    let catalog = resolve_launchable_routes(&snapshot, &registry, ["wl4"]);

    assert!(catalog.routes.is_empty());
    assert_eq!(catalog.diagnostics.len(), 1);
    assert_eq!(
        catalog.diagnostics[0].code,
        RouteDiagnosticCode::LocalRouteUnavailable
    );
    assert_eq!(
        catalog.diagnostics[0].playable_id.as_deref(),
        Some("tmnt-shredders-revenge")
    );
    let direct = resolve_route(&snapshot, &registry, ["wl4"], "tmnt-shredders-revenge")
        .expect_err("disabled plugin should make the route unavailable");
    assert_eq!(direct.code, RouteDiagnosticCode::LocalRouteUnavailable);
    assert!(direct.message.contains("@korri:android-app/android-app"));
}

#[test]
fn disabled_registered_plugin_rejects_copied_first_party_records_without_blocking_user_routes() {
    let snapshot = snapshot_from_pair(
        copied_android_records_config(),
        copied_android_records_library(),
    );
    let registry = android_registry(false);

    let catalog = resolve_launchable_routes(&snapshot, &registry, ["wl4"]);

    assert_eq!(catalog.routes.len(), 1);
    assert_eq!(catalog.routes[0].playable_id, "other-game");
    assert_eq!(catalog.routes[0].provider_id, "@korri:other");
    assert_eq!(
        catalog.routes[0].flattened_target,
        "@korri:other:package.name"
    );
    assert_eq!(catalog.diagnostics.len(), 1);
    assert_eq!(
        catalog.diagnostics[0].code,
        RouteDiagnosticCode::LocalRouteUnavailable
    );
    assert_eq!(
        catalog.diagnostics[0].playable_id.as_deref(),
        Some("tmnt-shredders-revenge")
    );
    assert!(catalog.diagnostics[0]
        .message
        .contains("launcher @korri:android-app/android-app is unavailable"));
    assert!(!catalog.diagnostics[0].message.contains("process fallback"));

    let copied = resolve_route(&snapshot, &registry, ["wl4"], "tmnt-shredders-revenge")
        .expect_err("copied first-party records must not bypass disabled policy");
    assert_eq!(copied.code, RouteDiagnosticCode::LocalRouteUnavailable);
    assert!(copied
        .message
        .contains("launcher @korri:android-app/android-app is unavailable"));
    assert!(!copied.message.contains("process fallback"));

    let user_owned = resolve_route(&snapshot, &registry, ["wl4"], "other-game")
        .expect("unrelated user-owned route should still resolve");
    assert_eq!(user_owned.provider_id, "@korri:other");
    assert_eq!(user_owned.system_id, "other-system");
    assert_eq!(user_owned.launcher_id, "@korri:other/android-app");
}

#[test]
fn route_resolution_fails_closed_for_unknown_or_unsupported_checkpoint_parts() {
    let registry = android_registry(true);
    let cases = [
        (
            "unknown launch.use",
            CHECKPOINT_CONFIG,
            CHECKPOINT_LIBRARY.replace(
                "@korri:android-app/android-app",
                "@korri:android-app/missing",
            ),
            "launcher @korri:android-app/missing is unavailable",
        ),
        (
            "missing provider",
            CHECKPOINT_CONFIG,
            CHECKPOINT_LIBRARY.replace("provider: \"@korri:android-app\"", "provider: \"@korri:missing\""),
            "provider @korri:missing is unavailable",
        ),
        (
            "launcher-system mismatch",
            "host:\n  title: usu\nsystems:\n  switch: { title: Switch }\n",
            CHECKPOINT_LIBRARY.replace("system: android", "system: switch"),
            "does not support system switch",
        ),
        (
            "unsupported target",
            CHECKPOINT_CONFIG,
            CHECKPOINT_LIBRARY.replace(
                "kind: provider-ref\n          provider: \"@korri:android-app\"\n          ref: com.playdigious.tmnt",
                "kind: url\n          value: https://example.invalid/tmnt",
            ),
            "target kind url is not supported",
        ),
    ];

    for (label, config, library, expected_message) in cases {
        let snapshot = snapshot_from_pair(config, &library);
        let error = match resolve_route(&snapshot, &registry, ["wl4"], "tmnt-shredders-revenge") {
            Ok(route) => panic!("{label} should not resolve: {route:?}"),
            Err(error) => error,
        };
        assert_eq!(
            error.code,
            RouteDiagnosticCode::LocalRouteUnavailable,
            "{label}"
        );
        assert!(
            error.message.contains(expected_message),
            "{label}: {}",
            error.message
        );
    }
}

#[test]
fn unsupported_launcher_command_never_falls_back_to_a_process() {
    let library = CHECKPOINT_LIBRARY
        .replace(
            "provider: \"@korri:android-app\"",
            "provider: \"@korri:user\"",
        )
        .replace(
            "use: \"@korri:android-app/android-app\"",
            "use: \"@korri:user/android-app\"",
        )
        .replace("system: android", "system: user-system");
    let snapshot = snapshot_from_pair(
        r#"
providers:
  "@korri:user": {}
systems:
  user-system: {}
launchers:
  "@korri:user/android-app":
    plugin: "@korri:user"
    command: sh
    systems: [user-system]
"#,
        &library,
    );
    let registry = android_registry(false);

    let error = resolve_route(&snapshot, &registry, ["wl4"], "tmnt-shredders-revenge")
        .expect_err("generic commands must not resolve");

    assert_eq!(error.code, RouteDiagnosticCode::LocalRouteUnavailable);
    assert!(error.message.contains("command sh is not supported"));
}

#[test]
fn launcher_without_plugin_kind_never_uses_process_fallback() {
    let library = CHECKPOINT_LIBRARY
        .replace(
            "provider: \"@korri:android-app\"",
            "provider: \"@korri:user\"",
        )
        .replace(
            "use: \"@korri:android-app/android-app\"",
            "use: \"@korri:user/android-app\"",
        )
        .replace("system: android", "system: user-system");
    let snapshot = snapshot_from_pair(
        r#"
providers:
  "@korri:user": {}
systems:
  user-system: {}
launchers:
  "@korri:user/android-app":
    command: android-app
    systems: [user-system]
"#,
        &library,
    );
    let registry = android_registry(false);

    let error = resolve_route(&snapshot, &registry, ["wl4"], "tmnt-shredders-revenge")
        .expect_err("process fallback must not resolve");

    assert_eq!(error.code, RouteDiagnosticCode::LocalRouteUnavailable);
    assert!(error.message.contains("process fallback is not supported"));
}

#[test]
fn provider_ref_target_preserves_the_provider_identity_separator() {
    let snapshot = checkpoint_snapshot();
    let registry = android_registry(true);

    let route = resolve_route(&snapshot, &registry, ["wl4"], "tmnt-shredders-revenge")
        .expect("checkpoint route should resolve");

    assert_eq!(route.provider_id, "@korri:android-app");
    assert_eq!(
        route.flattened_target,
        "@korri:android-app:com.playdigious.tmnt"
    );
    assert!(route
        .flattened_target
        .starts_with(&format!("{}:", route.provider_id)));
}

#[test]
fn dynamic_playable_collision_keeps_the_static_owner() {
    let snapshot = snapshot_from_pair(
        CHECKPOINT_CONFIG,
        &CHECKPOINT_LIBRARY.replace("tmnt-shredders-revenge", "wl4"),
    );
    let registry = android_registry(true);

    let catalog = resolve_launchable_routes(&snapshot, &registry, ["wl4"]);

    assert!(catalog.routes.is_empty());
    assert_eq!(catalog.diagnostics.len(), 1);
    assert_eq!(
        catalog.diagnostics[0].code,
        RouteDiagnosticCode::LocalRouteCollision
    );
    assert_eq!(catalog.diagnostics[0].playable_id.as_deref(), Some("wl4"));
    assert!(catalog.diagnostics[0]
        .message
        .contains("static route remains active"));
}

#[test]
fn direct_dynamic_playable_collision_keeps_the_static_owner() {
    let snapshot = snapshot_from_pair(
        CHECKPOINT_CONFIG,
        &CHECKPOINT_LIBRARY.replace("tmnt-shredders-revenge", "wl4"),
    );
    let registry = android_registry(true);

    let direct = resolve_route(&snapshot, &registry, ["wl4"], "wl4")
        .expect_err("direct collision must not resolve the dynamic route");

    assert_eq!(direct.code, RouteDiagnosticCode::LocalRouteCollision);
    assert_eq!(direct.playable_id.as_deref(), Some("wl4"));
    assert!(direct.message.contains("static route remains active"));
}

#[test]
fn user_plugin_collisions_omit_only_affected_routes() {
    let snapshot = snapshot_from_pair(
        r#"
providers:
  "@korri:android-app": { title: "User Android" }
  "@korri:other": { title: "Other" }
systems:
  android: { title: "User Android" }
  other-system: { title: "Other System" }
launchers:
  "@korri:android-app/android-app":
    plugin: "@korri:android-app"
    command: android-app
    systems: [android]
  "@korri:other/android-app":
    plugin: "@korri:other"
    command: android-app
    systems: [other-system]
"#,
        r#"
library:
  tmnt-shredders-revenge:
    title: "TMNT: Shredder's Revenge"
    releases:
      - id: android
        system: android
        target:
          kind: provider-ref
          provider: "@korri:android-app"
          ref: com.playdigious.tmnt
        launch:
          use: "@korri:android-app/android-app"
  other-game:
    title: "Other Game"
    releases:
      - id: android
        system: other-system
        target:
          kind: provider-ref
          provider: "@korri:other"
          ref: package.name
        launch:
          use: "@korri:other/android-app"
"#,
    );
    let registry = android_registry(true);

    let catalog = resolve_launchable_routes(&snapshot, &registry, ["wl4"]);

    assert_eq!(catalog.routes.len(), 1);
    assert_eq!(catalog.routes[0].playable_id, "other-game");
    assert_eq!(catalog.routes[0].provider_id, "@korri:other");
    assert_eq!(
        catalog.routes[0].flattened_target,
        "@korri:other:package.name"
    );
    assert_eq!(catalog.diagnostics.len(), 1);
    assert_eq!(
        catalog.diagnostics[0].code,
        RouteDiagnosticCode::LocalRouteCollision
    );
    assert_eq!(
        catalog.diagnostics[0].playable_id.as_deref(),
        Some("tmnt-shredders-revenge")
    );
    assert!(catalog.diagnostics[0]
        .message
        .contains("launcher @korri:android-app/android-app"));

    let direct = resolve_route(&snapshot, &registry, ["wl4"], "tmnt-shredders-revenge")
        .expect_err("colliding route should not resolve");
    assert_eq!(direct.code, RouteDiagnosticCode::LocalRouteCollision);
}
