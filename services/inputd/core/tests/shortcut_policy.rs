use korri_input_core::controls::{Control, ControlEvent, DpadAxis};
use korri_input_core::shortcuts::{ShortcutDefinition, ShortcutPolicy, TapDefinition};

fn policy() -> ShortcutPolicy {
    ShortcutPolicy::new(
        vec![
            ShortcutDefinition::non_destructive(
                "workspace-prev",
                [Control::Home, Control::L1],
                false,
            ),
            ShortcutDefinition::destructive(
                "kill-current-game",
                [Control::L1, Control::R1, Control::Start, Control::Select],
            ),
        ],
        vec![TapDefinition::new("system-panel", Control::Home)],
    )
}

fn press(policy: &mut ShortcutPolicy, source: &str, control: Control) -> Vec<String> {
    policy
        .handle(ControlEvent::pressed(source, control))
        .into_iter()
        .map(|matched| matched.id)
        .collect()
}

fn release(policy: &mut ShortcutPolicy, source: &str, control: Control) -> Vec<String> {
    policy
        .handle(ControlEvent::released(source, control))
        .into_iter()
        .map(|matched| matched.id)
        .collect()
}

fn release_destructive_controls(policy: &mut ShortcutPolicy, source: &str) {
    for control in [Control::L1, Control::R1, Control::Start, Control::Select] {
        assert!(release(policy, source, control).is_empty());
    }
}

fn press_destructive_chord(policy: &mut ShortcutPolicy, source: &str) -> Vec<String> {
    let mut matches = Vec::new();
    for control in [Control::L1, Control::R1, Control::Start, Control::Select] {
        matches.extend(press(policy, source, control));
    }
    matches
}

#[test]
fn guide_and_left_bumper_fire_once_and_suppress_the_guide_tap() {
    let mut policy = policy();

    assert!(press(&mut policy, "pad", Control::Home).is_empty());
    assert_eq!(press(&mut policy, "pad", Control::L1), ["workspace-prev"]);
    assert!(press(&mut policy, "pad", Control::L1).is_empty());
    assert!(release(&mut policy, "pad", Control::Home).is_empty());
}

#[test]
fn plain_guide_tap_fires_on_release() {
    let mut policy = policy();

    assert!(press(&mut policy, "pad", Control::Home).is_empty());
    assert_eq!(release(&mut policy, "pad", Control::Home), ["system-panel"]);
}

#[test]
fn non_destructive_chords_can_compose_across_sources() {
    let mut policy = policy();

    press(&mut policy, "guide-lane", Control::Home);
    assert_eq!(
        press(&mut policy, "button-lane", Control::L1),
        ["workspace-prev"]
    );
}

#[test]
fn startup_requires_every_destructive_control_release_but_non_destructive_actions_work() {
    let mut policy = policy();

    press(&mut policy, "pad", Control::Home);
    assert_eq!(press(&mut policy, "pad", Control::L1), ["workspace-prev"]);
    release(&mut policy, "pad", Control::Home);
    release(&mut policy, "pad", Control::L1);

    assert!(press_destructive_chord(&mut policy, "pad").is_empty());
    release_destructive_controls(&mut policy, "pad");
    assert_eq!(
        press_destructive_chord(&mut policy, "pad"),
        ["kill-current-game"]
    );
}

#[test]
fn reset_disarms_destructive_matching_until_every_control_is_released() {
    let mut policy = policy();
    release_destructive_controls(&mut policy, "pad");
    assert_eq!(
        press_destructive_chord(&mut policy, "pad"),
        ["kill-current-game"]
    );

    policy.reset();

    assert!(press_destructive_chord(&mut policy, "pad").is_empty());
    release_destructive_controls(&mut policy, "pad");
    assert_eq!(
        press_destructive_chord(&mut policy, "pad"),
        ["kill-current-game"]
    );
}

#[test]
fn source_loss_disarms_destructive_matching_until_every_control_is_released() {
    let mut policy = policy();
    release_destructive_controls(&mut policy, "pad");
    assert_eq!(
        press_destructive_chord(&mut policy, "pad"),
        ["kill-current-game"]
    );

    policy.clear_source("pad");

    assert!(press_destructive_chord(&mut policy, "pad").is_empty());
    release_destructive_controls(&mut policy, "pad");
    assert_eq!(
        press_destructive_chord(&mut policy, "pad"),
        ["kill-current-game"]
    );
}

#[test]
fn destructive_chord_is_exact_and_from_one_logical_source() {
    let mut policy = policy();
    release_destructive_controls(&mut policy, "pad-a");

    press(&mut policy, "pad-a", Control::L1);
    press(&mut policy, "pad-a", Control::R1);
    press(&mut policy, "pad-b", Control::Start);
    assert!(press(&mut policy, "pad-b", Control::Select).is_empty());

    policy.reset();
    release_destructive_controls(&mut policy, "pad-a");
    press(&mut policy, "pad-a", Control::L1);
    press(&mut policy, "pad-a", Control::R1);
    press(&mut policy, "pad-a", Control::Start);
    press(&mut policy, "pad-a", Control::Home);
    assert!(press(&mut policy, "pad-a", Control::Select).is_empty());
    release(&mut policy, "pad-a", Control::Home);
    assert!(press(&mut policy, "pad-a", Control::Select).is_empty());
    release(&mut policy, "pad-a", Control::Select);
    assert_eq!(
        press(&mut policy, "pad-a", Control::Select),
        ["kill-current-game"]
    );
}

#[test]
fn repeated_presses_fire_once_until_a_required_control_is_released() {
    let mut policy = policy();
    release_destructive_controls(&mut policy, "pad");

    press(&mut policy, "pad", Control::L1);
    press(&mut policy, "pad", Control::R1);
    press(&mut policy, "pad", Control::Start);
    assert_eq!(
        press(&mut policy, "pad", Control::Select),
        ["kill-current-game"]
    );
    assert!(policy.handle_value("pad", "select", 2).is_empty());
    assert!(press(&mut policy, "pad", Control::Select).is_empty());

    release(&mut policy, "pad", Control::Select);
    assert_eq!(
        press(&mut policy, "pad", Control::Select),
        ["kill-current-game"]
    );
}

#[test]
fn copied_sources_dispatch_once_for_one_logical_chord_lifecycle() {
    let mut policy = policy();

    press(&mut policy, "evdev", Control::Home);
    assert_eq!(press(&mut policy, "evdev", Control::L1), ["workspace-prev"]);
    press(&mut policy, "dbus", Control::Home);
    assert!(press(&mut policy, "dbus", Control::L1).is_empty());

    release(&mut policy, "evdev", Control::L1);
    assert!(press(&mut policy, "evdev", Control::L1).is_empty());
    release(&mut policy, "dbus", Control::L1);
    assert!(press(&mut policy, "dbus", Control::L1).is_empty());

    release(&mut policy, "evdev", Control::L1);
    release(&mut policy, "dbus", Control::L1);
    assert_eq!(press(&mut policy, "evdev", Control::L1), ["workspace-prev"]);
}

#[test]
fn dpad_axis_releases_the_previous_direction_before_pressing_the_opposite() {
    let mut policy = ShortcutPolicy::new(
        vec![ShortcutDefinition::non_destructive(
            "right-chord",
            [Control::Home, Control::DpadRight],
            false,
        )],
        vec![TapDefinition::new("left-release", Control::DpadLeft)],
    );
    press(&mut policy, "pad", Control::Home);

    assert!(policy
        .handle_dpad_axis("pad", DpadAxis::Horizontal, -1)
        .is_empty());
    let matches: Vec<_> = policy
        .handle_dpad_axis("pad", DpadAxis::Horizontal, 1)
        .into_iter()
        .map(|matched| matched.id)
        .collect();

    assert_eq!(matches, ["left-release", "right-chord"]);
    assert!(!policy.is_pressed(Control::DpadLeft));
    assert!(policy.is_pressed(Control::DpadRight));
}

#[test]
fn clearing_a_source_releases_controls_without_synthesizing_taps_and_rearms() {
    let mut policy = policy();

    press(&mut policy, "pad", Control::Home);
    assert_eq!(press(&mut policy, "pad", Control::L1), ["workspace-prev"]);
    policy.clear_source("pad");
    assert!(!policy.is_pressed(Control::Home));

    press(&mut policy, "pad", Control::Home);
    assert_eq!(press(&mut policy, "pad", Control::L1), ["workspace-prev"]);
}

#[test]
fn unknown_controls_and_invalid_values_do_not_change_state() {
    let mut policy = policy();

    assert!(policy.handle_value("pad", "guide", 7).is_empty());
    assert!(policy.handle_value("pad", "unknown", 1).is_empty());
    assert!(!policy.is_pressed(Control::Home));

    assert!(policy.handle_value("pad", "home", 1).is_empty());
    assert!(policy.handle_value("pad", "home", 2).is_empty());
    assert!(policy.is_pressed(Control::Home));
    assert_eq!(
        policy
            .handle_value("pad", "home", 0)
            .into_iter()
            .map(|matched| matched.id)
            .collect::<Vec<_>>(),
        ["system-panel"]
    );
}

#[test]
fn every_legacy_semantic_control_name_maps_without_platform_codes() {
    let controls = [
        ("home", Control::Home),
        ("l1", Control::L1),
        ("r1", Control::R1),
        ("start", Control::Start),
        ("select", Control::Select),
        ("l3", Control::L3),
        ("r3", Control::R3),
        ("back", Control::Back),
        ("x", Control::X),
        ("volume-up", Control::VolumeUp),
        ("volume-down", Control::VolumeDown),
        ("dpad-up", Control::DpadUp),
        ("dpad-down", Control::DpadDown),
        ("dpad-left", Control::DpadLeft),
        ("dpad-right", Control::DpadRight),
    ];

    for (name, expected) in controls {
        assert_eq!(name.parse(), Ok(expected));
    }
    assert!("guide".parse::<Control>().is_err());
}

#[test]
fn alternate_chords_for_one_action_share_one_deduplication_lifecycle() {
    let mut policy = ShortcutPolicy::new(
        vec![
            ShortcutDefinition::non_destructive(
                "workspace-prev",
                [Control::Home, Control::L1],
                false,
            ),
            ShortcutDefinition::non_destructive(
                "workspace-prev",
                [Control::Home, Control::DpadLeft],
                false,
            ),
        ],
        vec![],
    );

    press(&mut policy, "pad", Control::Home);
    assert_eq!(press(&mut policy, "pad", Control::L1), ["workspace-prev"]);
    assert!(press(&mut policy, "pad", Control::DpadLeft).is_empty());
    release(&mut policy, "pad", Control::L1);
    assert!(press(&mut policy, "pad", Control::L1).is_empty());
    release(&mut policy, "pad", Control::DpadLeft);
    release(&mut policy, "pad", Control::L1);
    assert_eq!(press(&mut policy, "pad", Control::L1), ["workspace-prev"]);
}

#[test]
fn reset_clears_all_pressed_and_deduplication_state() {
    let mut policy = policy();
    press(&mut policy, "pad", Control::Home);
    press(&mut policy, "pad", Control::L1);

    policy.reset();

    assert!(!policy.is_pressed(Control::Home));
    press(&mut policy, "pad", Control::Home);
    assert_eq!(press(&mut policy, "pad", Control::L1), ["workspace-prev"]);
}
