use std::path::Path;

use korrid::{
    config::{resolver, snapshot::ConfigSnapshotCoordinator},
    launcher::{self, FileProvisionMode},
    plugin::{load_plugin_source, PluginRegistry},
    plugin_policy::{
        bundled_plugin_policy_layer, bundled_plugins, resolve_enabled_plugin_ids,
        PluginPolicyLayer, ANDROID_APP_PLUGIN_SOURCE, MGBA_PLUGIN_SOURCE, RETROARCH_PLUGIN_SOURCE,
    },
};

const CONFIG: &str = include_str!("../../../docs/research/retroarch-plugin-route/config.yaml");
const LIBRARY: &str = include_str!("../../../docs/research/retroarch-plugin-route/library.yaml");

fn state(root: &Path) -> korrid::config::snapshot::ConfigSnapshotState {
    std::fs::write(root.join("config.yaml"), CONFIG).unwrap();
    std::fs::write(root.join("library.yaml"), LIBRARY).unwrap();
    ConfigSnapshotCoordinator::new(root).reload()
}

fn registry(retroarch_enabled: bool, mgba_enabled: bool) -> PluginRegistry {
    let layers = [
        bundled_plugin_policy_layer(),
        PluginPolicyLayer::from_enabled([
            ("@korri:retroarch", retroarch_enabled),
            ("@korri:mgba", mgba_enabled),
        ]),
    ];
    PluginRegistry::new(
        bundled_plugins().unwrap(),
        resolve_enabled_plugin_ids(layers),
    )
    .unwrap()
}

fn registry_from_sources(retroarch_source: &str, mgba_source: &str) -> PluginRegistry {
    PluginRegistry::new(
        vec![
            load_plugin_source(ANDROID_APP_PLUGIN_SOURCE).unwrap(),
            load_plugin_source(retroarch_source).unwrap(),
            load_plugin_source(mgba_source).unwrap(),
        ],
        resolve_enabled_plugin_ids([bundled_plugin_policy_layer()]),
    )
    .unwrap()
}

#[test]
fn composes_retroarch_launcher_with_mgba_runtime_from_independent_plugins() {
    let root = tempfile::tempdir().unwrap();
    let state = state(root.path());
    let registry = registry(true, true);

    let route = resolver::resolve_route(&state.snapshot, &registry, [], "wl4")
        .expect("composed RetroArch and mGBA route");

    assert_eq!(route.launcher_id, "@korri:retroarch/retroarch");
    assert_eq!(route.integration_token, "retroarch");
    assert_eq!(
        route.android_component.unwrap().package_name,
        "com.korri.retroarch"
    );
    let runtime = route.runtime.expect("mGBA plugin runtime");
    assert_eq!(runtime.id, "@korri:mgba/mgba");
    assert_eq!(runtime.kind, "libretro-core");
    assert_eq!(runtime.app, "@korri:retroarch/retroarch");
    assert_eq!(
        runtime.path,
        "/data/data/com.korri.retroarch/cores/mgba_libretro_android.so"
    );
    let target = route.file_target.expect("file target");
    assert_eq!(target.storage_id, "roms");
    assert_eq!(target.path, "wl4.gba");
}

#[test]
fn materializes_the_existing_launch_treaty_from_composed_plugin_records() {
    let root = tempfile::tempdir().unwrap();
    let state = state(root.path());
    std::fs::create_dir(root.path().join("roms")).unwrap();
    std::fs::write(root.path().join("roms/wl4.gba"), b"rom").unwrap();

    let spec = launcher::launch_game(
        root.path(),
        "wl4",
        FileProvisionMode::Deferred,
        &state,
        &registry(true, true),
    )
    .expect("plugin-backed launch spec");

    assert_eq!(spec.launcher_id, "retroarch");
    assert_eq!(spec.component.package_name, "com.korri.retroarch");
    assert_eq!(
        spec.component.class_name,
        "com.retroarch.browser.retroactivity.RetroActivityFuture"
    );
    assert_eq!(
        spec.extras.get("LIBRETRO").map(String::as_str),
        Some("/data/data/com.korri.retroarch/cores/mgba_libretro_android.so")
    );
}

#[test]
fn launch_spec_and_config_follow_values_from_both_plugins() {
    let root = tempfile::tempdir().unwrap();
    let state = state(root.path());
    std::fs::create_dir(root.path().join("roms")).unwrap();
    std::fs::write(root.path().join("roms/wl4.gba"), b"rom").unwrap();
    let retroarch_source = RETROARCH_PLUGIN_SOURCE
        .replace("com.korri.retroarch", "dev.korri.sentinel")
        .replace(
            "com.retroarch.browser.retroactivity.RetroActivityFuture",
            "dev.korri.sentinel.SentinelActivity",
        );
    let mgba_source = MGBA_PLUGIN_SOURCE.replace(
        "/data/data/com.korri.retroarch/cores/mgba_libretro_android.so",
        "/plugin/sentinel/cores/sentinel_libretro.so",
    );

    let spec = launcher::launch_game(
        root.path(),
        "wl4",
        FileProvisionMode::Deferred,
        &state,
        &registry_from_sources(&retroarch_source, &mgba_source),
    )
    .expect("sentinel plugin-backed launch spec");

    assert_eq!(spec.component.package_name, "dev.korri.sentinel");
    assert_eq!(
        spec.component.class_name,
        "dev.korri.sentinel.SentinelActivity"
    );
    assert_eq!(
        spec.extras.get("LIBRETRO").map(String::as_str),
        Some("/plugin/sentinel/cores/sentinel_libretro.so")
    );
    assert!(spec.files[0]
        .content
        .contains("libretro_directory = \"/plugin/sentinel/cores\""));
}

#[test]
fn disabling_retroarch_withholds_only_its_launcher_identity() {
    let root = tempfile::tempdir().unwrap();
    let state = state(root.path());
    let registry = registry(false, true);

    assert!(registry.owns_registered_launcher_id("@korri:retroarch/retroarch"));
    assert!(registry.owns_registered_runtime_id("@korri:mgba/mgba"));
    assert!(!registry
        .launchers()
        .contains_key("@korri:retroarch/retroarch"));
    assert!(registry.runtimes().contains_key("@korri:mgba/mgba"));

    let error = resolver::resolve_route(&state.snapshot, &registry, [], "wl4")
        .expect_err("disabled launcher plugin route");
    assert!(error
        .message
        .contains("launcher @korri:retroarch/retroarch is unavailable"));
}

#[test]
fn disabling_mgba_withholds_only_its_system_and_runtime_identities() {
    let root = tempfile::tempdir().unwrap();
    let state = state(root.path());
    let registry = registry(true, false);

    assert!(registry
        .launchers()
        .contains_key("@korri:retroarch/retroarch"));
    assert!(registry.owns_registered_system_id("gba"));
    assert!(registry.owns_registered_runtime_id("@korri:mgba/mgba"));
    assert!(!registry.runtimes().contains_key("@korri:mgba/mgba"));

    let error = resolver::resolve_route(&state.snapshot, &registry, [], "wl4")
        .expect_err("disabled core plugin route");
    assert!(error.message.contains("system gba is unavailable"));
}

#[test]
fn rejects_a_runtime_declared_for_a_different_launcher() {
    let root = tempfile::tempdir().unwrap();
    let state = state(root.path());
    let incompatible = MGBA_PLUGIN_SOURCE.replace(
        "app: \"@korri:retroarch/retroarch\"",
        "app: \"@korri:other/launcher\"",
    );
    let registry = registry_from_sources(RETROARCH_PLUGIN_SOURCE, &incompatible);

    let error = resolver::resolve_route(&state.snapshot, &registry, [], "wl4")
        .expect_err("runtime app mismatch");
    assert!(error.message.contains(
        "runtime @korri:mgba/mgba belongs to @korri:other/launcher, not launcher @korri:retroarch/retroarch"
    ));
}

#[test]
fn rejects_an_mgba_runtime_that_does_not_support_the_release_system() {
    let root = tempfile::tempdir().unwrap();
    let state = state(root.path());
    let unsupported = MGBA_PLUGIN_SOURCE.replace("systems: [\"gba\"]", "systems: [\"gb\"]");
    let registry = registry_from_sources(RETROARCH_PLUGIN_SOURCE, &unsupported);

    let error = resolver::resolve_route(&state.snapshot, &registry, [], "wl4")
        .expect_err("runtime system mismatch");
    assert!(error.message.contains("does not support system gba"));
}

#[test]
fn rejects_an_mgba_runtime_that_is_not_a_libretro_core() {
    let root = tempfile::tempdir().unwrap();
    let state = state(root.path());
    let incompatible = MGBA_PLUGIN_SOURCE.replace("kind: \"libretro-core\"", "kind: \"tool\"");
    let registry = registry_from_sources(RETROARCH_PLUGIN_SOURCE, &incompatible);

    let error = resolver::resolve_route(&state.snapshot, &registry, [], "wl4")
        .expect_err("incompatible runtime kind");
    assert!(error
        .message
        .contains("has kind tool, expected libretro-core"));
}
