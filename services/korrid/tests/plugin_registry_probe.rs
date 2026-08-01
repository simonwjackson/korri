use std::process::Command;

const ANDROID_PLUGIN: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../docs/research/android-app-plugin-schema-checkpoint/android-app.plugin.ts"
);

const ENABLED_REPORT: &str = concat!(
    "plugin: @korri:android-app\n",
    "registered: yes\n",
    "enabled: yes\n",
    "provider: @korri:android-app\n",
    "system: android\n",
    "launcher: @korri:android-app/android-app\n",
);

const DISABLED_REPORT: &str = concat!(
    "plugin: @korri:android-app\n",
    "registered: yes\n",
    "enabled: no\n",
    "provider: none\n",
    "system: none\n",
    "launcher: none\n",
);

#[test]
fn review_probe_explains_enabled_and_disabled_announcements() {
    assert_eq!(run_probe(&[ANDROID_PLUGIN]), ENABLED_REPORT);
    assert_eq!(run_probe(&[ANDROID_PLUGIN, "--disabled"]), DISABLED_REPORT);
    assert_eq!(
        run_probe(&[ANDROID_PLUGIN, "--review"]),
        format!("== enabled plugin ==\n{ENABLED_REPORT}\n== disabled plugin ==\n{DISABLED_REPORT}")
    );
}

fn run_probe(args: &[&str]) -> String {
    let output = Command::new(env!("CARGO_BIN_EXE_plugin_registry_probe"))
        .args(args)
        .output()
        .expect("plugin registry probe should start");
    assert!(
        output.status.success(),
        "probe failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).expect("probe output should be UTF-8")
}
