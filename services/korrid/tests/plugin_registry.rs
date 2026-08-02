use korrid::plugin::{decode_plugin_declaration, load_plugin_source, PluginRegistry};

const ANDROID_PLUGIN: &str = include_str!("../plugins/android-app.plugin.ts");

#[test]
fn enabled_android_plugin_announces_its_legacy_contributions() {
    let plugin = load_plugin_source(ANDROID_PLUGIN).expect("checkpoint plugin should load");
    let registry = PluginRegistry::new(vec![plugin], vec!["@korri:android-app".to_owned()])
        .expect("checkpoint plugin should register");

    assert_eq!(registry.registered_plugin_ids(), ["@korri:android-app"]);
    assert_eq!(registry.enabled_plugin_ids(), ["@korri:android-app"]);
    assert_eq!(
        registry
            .providers()
            .get("@korri:android-app")
            .map(|record| record.id.as_str()),
        Some("@korri:android-app")
    );
    assert_eq!(
        registry
            .systems()
            .get("@korri:android-app/android")
            .map(|record| record.id.as_str()),
        Some("android")
    );
    assert_eq!(
        registry
            .launchers()
            .get("@korri:android-app/android-app")
            .map(|record| record.id.as_str()),
        Some("@korri:android-app/android-app")
    );
}

#[test]
fn disabled_plugin_announces_no_contributions_but_reserves_its_record_identities() {
    let plugin = load_plugin_source(ANDROID_PLUGIN).expect("checkpoint plugin should load");
    let registry = PluginRegistry::new(vec![plugin], Vec::new()).expect("plugin should register");

    assert_eq!(registry.registered_plugin_ids(), ["@korri:android-app"]);
    assert!(registry.enabled_plugin_ids().is_empty());
    assert!(registry.providers().is_empty());
    assert!(registry.systems().is_empty());
    assert!(registry.launchers().is_empty());
    assert!(registry.owns_registered_provider_id("@korri:android-app"));
    assert!(registry.owns_registered_system_id("android"));
    assert!(registry.owns_registered_launcher_id("@korri:android-app/android-app"));
    assert!(!registry.owns_registered_provider_id("@korri:other"));
    assert!(!registry.owns_registered_system_id("other-system"));
    assert!(!registry.owns_registered_launcher_id("@korri:other/android-app"));
}

#[test]
fn implicit_own_provider_is_normalized_with_its_provider_id() {
    let plugin = load_plugin_source(
        r#"
        ({
          namespace: "@korri",
          name: "android-app",
          title: "Android",
          contributes: { config: {} },
        })
        "#,
    )
    .expect("plugin should load");
    let registry = PluginRegistry::new(vec![plugin], vec!["@korri:android-app".to_owned()])
        .expect("plugin should register");

    let provider = registry
        .providers()
        .get("@korri:android-app")
        .expect("own provider should be synthesized");
    assert_eq!(provider.id, "@korri:android-app");
    assert_eq!(provider.title.as_deref(), Some("Android"));
}

#[test]
fn provider_contribution_keys_supply_the_readable_provider_id() {
    let plugin = load_plugin_source(
        r#"
        ({
          namespace: "@korri",
          name: "android-app",
          contributes: {
            config: {
              providers: {
                "@korri:android-app": { title: "Android applications" },
              },
            },
          },
        })
        "#,
    )
    .expect("provider contribution key should supply its id");
    let registry = PluginRegistry::new(vec![plugin], vec!["@korri:android-app".to_owned()])
        .expect("plugin should register");

    let provider = registry
        .providers()
        .get("@korri:android-app")
        .expect("provider should be announced");
    assert_eq!(provider.id, "@korri:android-app");
    assert_eq!(provider.title.as_deref(), Some("Android applications"));
}

#[test]
fn non_json_fields_fail_before_json_stringification_can_erase_them() {
    let error = load_plugin_source(
        r#"
        ({
          namespace: "@korri",
          name: "android-app",
          contributes: {
            config: {
              providers: {
                "@korri:android-app": {
                  title: "Android",
                  unsupported: undefined,
                },
              },
            },
          },
        })
        "#,
    )
    .expect_err("undefined fields must not disappear before strict decoding");

    assert!(
        error.to_string().contains("not JSON data"),
        "unexpected error: {error}"
    );
}

#[test]
fn accessors_and_to_json_cannot_change_the_validated_declaration() {
    let accessor_error = load_plugin_source(
        r#"
        let reads = 0
        const provider = { title: "Android" }
        Object.defineProperty(provider, "unsupported", {
          enumerable: true,
          get() { reads += 1; return reads === 1 ? true : undefined },
        })
        ;({
          namespace: "@korri",
          name: "android-app",
          contributes: {
            config: { providers: { "@korri:android-app": provider } },
          },
        })
        "#,
    )
    .expect_err("an accessor must be captured once before strict decoding");
    assert!(
        accessor_error.to_string().contains("unsupported"),
        "unexpected error: {accessor_error}"
    );

    let to_json_error = load_plugin_source(
        r#"
        const title = Object.create({ toJSON() { return "Android" } })
        ;({ namespace: "@korri", name: "android-app", title })
        "#,
    )
    .expect_err("custom JSON serialization must not replace declaration values");
    assert!(
        to_json_error.to_string().contains("not JSON data"),
        "unexpected error: {to_json_error}"
    );
}

#[test]
fn non_plain_objects_cannot_collapse_into_empty_declaration_maps() {
    for source in [
        r#"({ namespace: "@korri", name: "android-app", contributes: new Boolean(false) })"#,
        r#"({ namespace: "@korri", name: "android-app", contributes: { config: new Date() } })"#,
        r#"({ namespace: "@korri", name: "android-app", contributes: { config: { providers: new Map() } } })"#,
        r#"const value = new Date(); Object.setPrototypeOf(value, Object.prototype); ({ namespace: "@korri", name: "android-app", contributes: value })"#,
    ] {
        let error = load_plugin_source(source)
            .expect_err("non-plain objects must not become empty declaration maps");
        assert!(
            error.to_string().contains("not JSON data"),
            "unexpected error: {error}"
        );
    }
}

#[test]
fn malformed_provider_contributions_fail_instead_of_disappearing() {
    let error = load_plugin_source(
        r#"
        ({
          namespace: "@korri",
          name: "android-app",
          contributes: {
            config: {
              providers: {
                "@korri:android-app": {
                  id: "@korri:android-app",
                  title: "Android",
                  unsupported: true,
                },
              },
            },
          },
        })
        "#,
    )
    .expect_err("unsupported provider fields must fail explicitly");

    assert!(
        error.to_string().contains("unsupported"),
        "unexpected error: {error}"
    );
}

#[test]
fn contribution_identity_mismatches_are_rejected() {
    let declarations = [
        r#"{"namespace":"@korri","name":"android-app","contributes":{"config":{"providers":{"android-app":{"title":"Android"}}}}}"#,
        r#"{"namespace":"@korri","name":"android-app","contributes":{"config":{"providers":{"@korri:android-app":{"id":"@korri:other"}}}}}"#,
        r#"{"namespace":"@korri","name":"android-app","contributes":{"config":{"systems":{"android":{"id":"switch"}}}}}"#,
        r#"{"namespace":"@korri","name":"android-app","contributes":{"config":{"launchers":{"android-app":{"id":"@korri:other/android-app"}}}}}"#,
    ];

    for declaration in declarations {
        decode_plugin_declaration(declaration)
            .expect_err("contribution identities must agree with their registry keys");
    }
}

#[test]
fn empty_keys_and_malformed_launcher_fields_are_rejected() {
    let declarations = [
        r#"{"namespace":"@korri","name":"android-app","contributes":{"config":{"systems":{"":{"id":""}}}}}"#,
        r#"{"namespace":"@korri","name":"android-app","contributes":{"config":{"launchers":{"":{"id":"@korri:android-app/"}}}}}"#,
        r#"{"namespace":"@korri","name":"android-app","contributes":{"config":{"launchers":{"android-app":{"id":"@korri:android-app/android-app","plugin":"android-app"}}}}}"#,
        r#"{"namespace":"@korri","name":"android-app","contributes":{"config":{"launchers":{"android-app":{"id":"@korri:android-app/android-app","command":""}}}}}"#,
    ];

    for declaration in declarations {
        decode_plugin_declaration(declaration)
            .expect_err("malformed contribution values must fail explicitly");
    }
}

#[test]
fn explicit_nulls_do_not_pass_as_absent_legacy_fields() {
    let declarations = [
        r#"{"namespace":"@korri","name":"android-app","title":null}"#,
        r#"{"namespace":"@korri","name":"android-app","contributes":{"config":{"providers":{"@korri:android-app":{"title":null}}}}}"#,
        r#"{"namespace":"@korri","name":"android-app","contributes":{"config":{"systems":{"android":{"id":"android","title":null}}}}}"#,
        r#"{"namespace":"@korri","name":"android-app","contributes":{"config":{"launchers":{"android-app":{"id":"@korri:android-app/android-app","plugin":null}}}}}"#,
        r#"{"namespace":"@korri","name":"android-app","contributes":{"config":{"launchers":{"android-app":{"id":"@korri:android-app/android-app","command":null}}}}}"#,
        r#"{"namespace":"@korri","name":"android-app","contributes":{"config":{"launchers":{"android-app":{"id":"@korri:android-app/android-app","systems":null}}}}}"#,
    ];

    for declaration in declarations {
        let error = decode_plugin_declaration(declaration)
            .expect_err("explicit null must not be normalized to an absent field");
        assert!(
            error.to_string().contains("invalid plugin declaration"),
            "unexpected error: {error}"
        );
    }
}

#[test]
fn unknown_enabled_plugin_ids_are_rejected() {
    let plugin = load_plugin_source(ANDROID_PLUGIN).expect("plugin should load");

    let error = PluginRegistry::new(vec![plugin], vec!["@korri:missing".to_owned()])
        .expect_err("unknown enabled plugin ids must fail");

    assert!(
        error
            .to_string()
            .contains("enabled plugin @korri:missing is not registered"),
        "unexpected error: {error}"
    );
}

#[test]
fn multiple_plugins_announce_only_when_each_is_enabled() {
    let android = load_plugin_source(ANDROID_PLUGIN).expect("Android plugin should load");
    let other = decode_plugin_declaration(
        r#"{"namespace":"@korri","name":"other","contributes":{"config":{"systems":{"other":{"id":"other"}}}}}"#,
    )
    .expect("second plugin should decode");

    let both = PluginRegistry::new(
        vec![android.clone(), other.clone()],
        vec!["@korri:android-app".to_owned(), "@korri:other".to_owned()],
    )
    .expect("both plugins should register");
    assert_eq!(
        both.registered_plugin_ids(),
        ["@korri:android-app", "@korri:other"]
    );
    assert!(both.providers().get("@korri:android-app").is_some());
    assert!(both.providers().get("@korri:other").is_some());
    assert!(both.systems().get("@korri:other/other").is_some());

    let android_only =
        PluginRegistry::new(vec![android, other], vec!["@korri:android-app".to_owned()])
            .expect("disabled second plugin should remain registered");
    assert!(android_only.providers().get("@korri:android-app").is_some());
    assert!(android_only.providers().get("@korri:other").is_none());
    assert!(android_only.systems().get("@korri:other/other").is_none());
}

#[test]
fn duplicate_plugin_ids_are_rejected() {
    let first = load_plugin_source(ANDROID_PLUGIN).expect("first plugin should load");
    let second = load_plugin_source(ANDROID_PLUGIN).expect("second plugin should load");

    let error = PluginRegistry::new(vec![first, second], vec!["@korri:android-app".to_owned()])
        .expect_err("duplicate plugin ids must fail");

    assert!(
        error
            .to_string()
            .contains("duplicate plugin id @korri:android-app"),
        "unexpected error: {error}"
    );
}
