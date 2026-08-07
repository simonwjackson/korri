#[test]
fn core_does_not_expose_platform_specific_dependencies() {
    let manifest = include_str!("../Cargo.toml");

    assert!(!manifest.contains("target_os = \"linux\""));
    assert!(!manifest.contains("evdev"));
    assert!(!manifest.contains("zbus"));
    assert!(!manifest.contains("tokio"));
}
