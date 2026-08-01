use korrid::config::{classify_snapshot_support, decode_config_pair};

const CHECKPOINT_CONFIG: &str =
    include_str!("../../../docs/research/android-app-plugin-schema-checkpoint/config.yaml");
const CHECKPOINT_LIBRARY: &str =
    include_str!("../../../docs/research/android-app-plugin-schema-checkpoint/library.yaml");
const ALL_CONFIG: &str = include_str!("fixtures/legacy-readable/config-all-sections.yaml");
const ALL_LIBRARY: &str = include_str!("fixtures/legacy-readable/library-all-sections.yaml");

#[test]
fn exact_checkpoint_pair_decodes_as_supported_legacy_readable_contract() {
    let snapshot = decode_config_pair(CHECKPOINT_CONFIG, CHECKPOINT_LIBRARY)
        .expect("checkpoint files should strictly decode");

    assert_eq!(
        snapshot
            .host
            .as_ref()
            .and_then(|host| host.title.as_deref()),
        Some("usu")
    );
    assert!(snapshot.storage.is_empty());
    assert_eq!(
        snapshot
            .library
            .get("tmnt-shredders-revenge")
            .and_then(|item| item.title.as_deref()),
        Some("TMNT: Shredder's Revenge")
    );
    classify_snapshot_support(&snapshot)
        .expect("checkpoint fields are executable or retained metadata");
}

#[test]
fn empty_readable_documents_decode_as_the_initial_snapshot() {
    let snapshot = decode_config_pair("{}\n", "{}\n").expect("empty documents should decode");

    assert!(snapshot.host.is_none());
    assert!(snapshot.storage.is_empty());
    assert!(snapshot.providers.is_empty());
    assert!(snapshot.provider_links.is_empty());
    assert!(snapshot.systems.is_empty());
    assert!(snapshot.launchers.is_empty());
    assert!(snapshot.runtimes.is_empty());
    assert!(snapshot.profiles.is_empty());
    assert!(snapshot.hooks.is_empty());
    assert!(snapshot.collections.is_empty());
    assert!(snapshot.users.is_empty());
    assert!(snapshot.library.is_empty());
}

#[test]
fn representative_legacy_records_decode_for_all_twelve_sections() {
    let snapshot = decode_config_pair(ALL_CONFIG, ALL_LIBRARY)
        .expect("grounded legacy section fixtures should strictly decode");

    assert_eq!(snapshot.storage.len(), 2);
    assert_eq!(snapshot.providers.len(), 2);
    assert_eq!(snapshot.provider_links.len(), 1);
    assert_eq!(snapshot.systems.len(), 2);
    assert_eq!(snapshot.launchers.len(), 2);
    assert_eq!(snapshot.runtimes.len(), 2);
    assert_eq!(snapshot.profiles.len(), 1);
    assert_eq!(snapshot.hooks.len(), 1);
    assert_eq!(snapshot.collections.len(), 1);
    assert_eq!(snapshot.users.len(), 1);
    assert_eq!(snapshot.library.len(), 3);
}

#[test]
fn strict_schema_rejects_unknown_top_level_and_nested_fields() {
    let top_level = decode_config_pair("unexpected: {}\n", "{}\n")
        .expect_err("unknown top-level sections must fail");
    assert!(top_level.to_string().contains("unexpected"));

    let nested = decode_config_pair(
        "host:\n  hooks:\n    before:\n      - run: \"true\"\n        comand: typo\n",
        "{}\n",
    )
    .expect_err("unknown nested hook fields must fail");
    assert!(
        nested.to_string().contains("comand"),
        "unexpected error: {nested}"
    );
}

#[test]
fn explicit_nulls_do_not_pass_as_absent_legacy_fields() {
    let error = decode_config_pair("host:\n  title: null\n", "{}\n")
        .expect_err("explicit null must fail where absence is required");

    assert!(
        error.to_string().contains("explicit null"),
        "unexpected error: {error}"
    );
}

#[test]
fn identity_syntax_and_key_derived_identity_mismatches_fail() {
    let malformed_provider =
        decode_config_pair("providers:\n  android-app:\n    title: Android\n", "{}\n")
            .expect_err("provider map keys must keep legacy provider-id syntax");
    assert!(malformed_provider.to_string().contains("provider"));

    let malformed_playable = decode_config_pair(
        "{}\n",
        "library:\n  Bad Id:\n    releases:\n      - id: android\n        system: android\n",
    )
    .expect_err("library keys must be local playable ids");
    assert!(malformed_playable.to_string().contains("playable"));

    let body_id = decode_config_pair(
        "providers:\n  \"@korri:android-app\":\n    id: \"@korri:other\"\n    title: Android\n",
        "{}\n",
    )
    .expect_err("payload bodies must not carry mismatched derived ids");
    assert!(body_id.to_string().contains("id"));
}

#[test]
fn fixed_file_ownership_is_enforced_before_merge_order_can_win() {
    let library_in_config = decode_config_pair(
        "library:\n  tmnt-shredders-revenge:\n    releases:\n      - id: android\n        system: android\n",
        "{}\n",
    )
    .expect_err("library section is not owned by config.yaml");
    assert!(library_in_config.to_string().contains("config.yaml"));

    let provider_in_library = decode_config_pair(
        "{}\n",
        "providers:\n  \"@korri:android-app\":\n    title: Android\n",
    )
    .expect_err("provider section is not owned by library.yaml");
    assert!(provider_in_library.to_string().contains("library.yaml"));
}

#[test]
fn populated_unsupported_behavior_is_reported_explicitly() {
    let snapshot = decode_config_pair(
        "host:\n  title: usu\n  moonlight:\n    platform:\n      name: v4l2m2m\n",
        "{}\n",
    )
    .expect("schema-valid unsupported host behavior should decode");

    let error = classify_snapshot_support(&snapshot)
        .expect_err("unsupported populated behavior must be classified");
    assert!(
        error.to_string().contains("host.moonlight"),
        "unexpected error: {error}"
    );
}
