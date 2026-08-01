use korrid::plugin::{load_plugin_source, PluginRegistry};
use korrid::plugin_policy::{
    bundled_plugin_policy_layer, bundled_plugins, empty_user_plugin_policy_layer,
    resolve_enabled_plugin_ids, PluginPolicyLayer,
};

const CHECKPOINT_ANDROID_PLUGIN: &str = include_str!(
    "../../../docs/research/android-app-plugin-schema-checkpoint/android-app.plugin.ts"
);
const PRODUCTION_ANDROID_PLUGIN: &str = include_str!("../plugins/android-app.plugin.ts");

#[test]
fn bundled_policy_enables_android_plugin_by_default() {
    let plugins = bundled_plugins().expect("bundled plugins should load");
    let enabled_ids = resolve_enabled_plugin_ids([
        bundled_plugin_policy_layer(),
        empty_user_plugin_policy_layer(),
    ]);
    let registry =
        PluginRegistry::new(plugins, enabled_ids).expect("bundled policy should register");

    assert_eq!(registry.registered_plugin_ids(), ["@korri:android-app"]);
    assert_eq!(registry.enabled_plugin_ids(), ["@korri:android-app"]);
    assert!(registry.providers().contains_key("@korri:android-app"));
    assert!(registry
        .systems()
        .contains_key("@korri:android-app/android"));
    assert!(registry
        .launchers()
        .contains_key("@korri:android-app/android-app"));
}

#[test]
fn later_policy_layer_disables_bundled_android_plugin() {
    let plugins = bundled_plugins().expect("bundled plugins should load");
    let enabled_ids = resolve_enabled_plugin_ids([
        bundled_plugin_policy_layer(),
        PluginPolicyLayer::from_enabled([("@korri:android-app", false)]),
    ]);
    let registry = PluginRegistry::new(plugins, enabled_ids)
        .expect("disabled plugin should remain registered");

    assert_eq!(registry.registered_plugin_ids(), ["@korri:android-app"]);
    assert!(registry.enabled_plugin_ids().is_empty());
    assert!(registry.providers().is_empty());
    assert!(registry.systems().is_empty());
    assert!(registry.launchers().is_empty());
}

#[test]
fn unknown_enabled_policy_override_is_rejected_by_registry() {
    let plugins = bundled_plugins().expect("bundled plugins should load");
    let enabled_ids = resolve_enabled_plugin_ids([
        bundled_plugin_policy_layer(),
        PluginPolicyLayer::from_enabled([("@korri:missing", true)]),
    ]);

    let error = PluginRegistry::new(plugins, enabled_ids)
        .expect_err("unknown enabled policy ids must not create phantom plugins");

    assert!(
        error
            .to_string()
            .contains("enabled plugin @korri:missing is not registered"),
        "unexpected error: {error}"
    );
}

#[test]
fn production_android_plugin_matches_reviewed_checkpoint_bytes() {
    assert_eq!(PRODUCTION_ANDROID_PLUGIN, CHECKPOINT_ANDROID_PLUGIN);

    let production = load_plugin_source(PRODUCTION_ANDROID_PLUGIN)
        .expect("production Android plugin should load");
    let checkpoint = load_plugin_source(CHECKPOINT_ANDROID_PLUGIN)
        .expect("checkpoint Android plugin should load");

    assert_eq!(production.id(), checkpoint.id());
    assert_eq!(production.title(), checkpoint.title());
}
