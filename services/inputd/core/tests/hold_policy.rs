use korri_input_core::controls::{Control, ControlEvent};
use korri_input_core::hold::{HoldConfig, HoldConfigError, HoldPhase, HoldPolicy};
use korri_input_core::shortcuts::{ShortcutDefinition, ShortcutPolicy};

fn policy() -> HoldPolicy {
    HoldPolicy::new(HoldConfig {
        tap_ms: 200,
        hold_ms: 2_000,
    })
    .expect("test hold duration is valid")
}

fn phases(updates: &[korri_input_core::hold::HoldUpdate]) -> Vec<HoldPhase> {
    updates.iter().map(|update| update.phase).collect()
}

#[test]
fn engage_emits_press_and_duplicate_engage_is_ignored() {
    let mut policy = policy();

    let updates = policy.engage("kill-current-game", 1_000);
    assert_eq!(phases(&updates), [HoldPhase::Press]);
    assert_eq!(updates[0].progress, 0.0);
    assert_eq!(updates[0].elapsed_ms, 0);
    assert!(policy.engage("kill-current-game", 1_100).is_empty());
    assert!(policy.is_holding(Some("kill-current-game")));
}

#[test]
fn tap_window_has_no_progress_and_quick_release_is_a_tap() {
    let mut policy = policy();
    policy.engage("kill-current-game", 1_000);

    assert!(policy.advance(1_150).is_empty());
    let updates = policy.release("kill-current-game", 1_199);

    assert_eq!(phases(&updates), [HoldPhase::Tap]);
    assert_eq!(updates[0].elapsed_ms, 199);
    assert_eq!(updates[0].progress, 0.0);
}

#[test]
fn release_between_tap_and_hold_threshold_is_cancelled() {
    let mut policy = policy();
    policy.engage("kill-current-game", 1_000);

    let updates = policy.release("kill-current-game", 1_500);

    assert_eq!(phases(&updates), [HoldPhase::Cancel]);
    assert!((updates[0].progress - (300.0 / 1_800.0)).abs() < 1e-12);
    assert_eq!(updates[0].elapsed_ms, 500);
}

#[test]
fn progress_is_clamped_and_monotonic_after_the_tap_window() {
    let mut policy = policy();
    policy.engage("kill-current-game", 1_000);

    let first = policy.advance(1_200);
    let middle = policy.advance(2_100);

    assert_eq!(phases(&first), [HoldPhase::Progress]);
    assert_eq!(first[0].progress, 0.0);
    assert_eq!(phases(&middle), [HoldPhase::Progress]);
    assert!((middle[0].progress - 0.5).abs() < 1e-12);
}

#[test]
fn holding_through_threshold_fires_once_and_release_has_no_second_outcome() {
    let mut policy = policy();
    policy.engage("kill-current-game", 1_000);

    let fired = policy.advance(3_000);
    assert_eq!(phases(&fired), [HoldPhase::Fired]);
    assert_eq!(fired[0].progress, 1.0);
    assert_eq!(fired[0].elapsed_ms, 2_000);
    assert!(policy.advance(4_000).is_empty());
    assert!(policy.release("kill-current-game", 4_000).is_empty());
    assert!(!policy.is_holding(Some("kill-current-game")));
}

#[test]
fn release_after_threshold_cancels_if_advance_never_fired() {
    let mut policy = policy();
    policy.engage("kill-current-game", 1_000);

    let updates = policy.release("kill-current-game", 3_100);

    assert_eq!(phases(&updates), [HoldPhase::Cancel]);
    assert_eq!(updates[0].elapsed_ms, 2_100);
    assert_eq!(updates[0].progress, 1.0);
}

#[test]
fn reset_and_clear_cancel_without_emitting_or_later_firing() {
    let mut policy = policy();
    policy.engage("kill-current-game", 1_000);
    policy.engage("other", 1_000);

    assert!(policy.clear("other"));
    policy.reset();

    assert!(!policy.is_holding(None));
    assert!(policy.advance(5_000).is_empty());
    assert!(policy.release("kill-current-game", 5_000).is_empty());
}

#[test]
fn release_rearms_the_hold_for_a_future_chord_lifecycle() {
    let mut policy = policy();
    policy.engage("kill-current-game", 1_000);
    policy.release("kill-current-game", 1_100);

    policy.engage("kill-current-game", 2_000);
    assert_eq!(phases(&policy.advance(4_000)), [HoldPhase::Fired]);
}

#[test]
fn tap_threshold_is_bounded_by_hold_threshold() {
    let mut bounded = HoldPolicy::new(HoldConfig {
        tap_ms: 500,
        hold_ms: 100,
    })
    .expect("positive hold duration is valid");
    bounded.engage("kill", 0);
    assert_eq!(phases(&bounded.release("kill", 50)), [HoldPhase::Tap]);
}

#[test]
fn zero_destructive_hold_duration_is_rejected() {
    assert!(matches!(
        HoldPolicy::new(HoldConfig {
            tap_ms: 250,
            hold_ms: 0,
        }),
        Err(HoldConfigError::ZeroHoldDuration)
    ));
}

#[test]
fn exact_destructive_chord_only_becomes_destructive_after_the_hold() {
    let mut shortcuts = ShortcutPolicy::new(
        vec![ShortcutDefinition::destructive(
            "kill-current-game",
            [Control::L1, Control::R1, Control::Start, Control::Select],
        )],
        vec![],
    );
    let mut hold = policy();

    for control in [Control::L1, Control::R1, Control::Start, Control::Select] {
        assert!(shortcuts
            .handle(ControlEvent::released("dbus-target", control))
            .is_empty());
    }
    for control in [Control::L1, Control::R1, Control::Start] {
        assert!(shortcuts
            .handle(ControlEvent::pressed("dbus-target", control))
            .is_empty());
    }
    let matched = shortcuts.handle(ControlEvent::pressed("dbus-target", Control::Select));
    assert_eq!(matched[0].id, "kill-current-game");
    assert_eq!(
        phases(&hold.engage(matched[0].id.clone(), 1_000)),
        [HoldPhase::Press]
    );
    assert!(shortcuts
        .handle(ControlEvent::pressed("dbus-target", Control::Select))
        .is_empty());
    assert!(hold
        .advance(2_999)
        .iter()
        .all(|update| update.phase != HoldPhase::Fired));
    assert_eq!(phases(&hold.advance(3_000)), [HoldPhase::Fired]);
    assert!(hold.advance(4_000).is_empty());
}

#[test]
fn a_regressed_clock_is_treated_as_zero_elapsed_time() {
    let mut policy = policy();
    policy.engage("kill", 1_000);

    let updates = policy.release("kill", 900);

    assert_eq!(phases(&updates), [HoldPhase::Tap]);
    assert_eq!(updates[0].elapsed_ms, 0);
}
