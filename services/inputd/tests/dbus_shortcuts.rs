use korri_input_core::controls::{Control, ControlTransition, DpadAxis};
use korri_inputd::dbus::{
    authenticated_message, introspection_has_target_interface, map_capability, DbusAuthenticator,
    SemanticInput, Signal, DBUS_INPUT_MEMBER, DBUS_TARGET_INTERFACE, DBUS_TARGET_PATH,
};
use zbus::Message;

fn signal<'a>(
    sender: &'a str,
    path: &'a str,
    interface: &'a str,
    member: &'a str,
    capability: &'a str,
    value: f64,
) -> Signal<'a> {
    Signal {
        sender,
        path,
        interface,
        member,
        capability,
        value,
    }
}

#[test]
fn allowlisted_capabilities_map_to_semantic_controls_and_unknown_values_are_ignored() {
    let cases = [
        (
            "ui_guide",
            SemanticInput::Control(Control::Home, ControlTransition::Pressed),
        ),
        (
            "ui_l1",
            SemanticInput::Control(Control::L1, ControlTransition::Pressed),
        ),
        (
            "ui_r1",
            SemanticInput::Control(Control::R1, ControlTransition::Pressed),
        ),
        (
            "ui_l3",
            SemanticInput::Control(Control::L3, ControlTransition::Pressed),
        ),
        (
            "ui_r3",
            SemanticInput::Control(Control::R3, ControlTransition::Pressed),
        ),
        (
            "ui_option",
            SemanticInput::Control(Control::Start, ControlTransition::Pressed),
        ),
        (
            "ui_select",
            SemanticInput::Control(Control::Select, ControlTransition::Pressed),
        ),
        (
            "ui_back",
            SemanticInput::Control(Control::Back, ControlTransition::Pressed),
        ),
        (
            "ui_osk",
            SemanticInput::Control(Control::X, ControlTransition::Pressed),
        ),
        (
            "ui_volume_up",
            SemanticInput::Control(Control::VolumeUp, ControlTransition::Pressed),
        ),
        (
            "ui_volume_down",
            SemanticInput::Control(Control::VolumeDown, ControlTransition::Pressed),
        ),
        ("ui_up", SemanticInput::Axis(DpadAxis::Vertical, -1)),
        ("ui_down", SemanticInput::Axis(DpadAxis::Vertical, 1)),
        ("ui_left", SemanticInput::Axis(DpadAxis::Horizontal, -1)),
        ("ui_right", SemanticInput::Axis(DpadAxis::Horizontal, 1)),
    ];

    for (capability, expected) in cases {
        assert_eq!(map_capability(capability, 1.0), Some(expected));
    }
    assert_eq!(
        map_capability("ui_l1", 0.0),
        Some(SemanticInput::Control(
            Control::L1,
            ControlTransition::Released
        ))
    );
    assert_eq!(map_capability("ui_unconfigured", 1.0), None);
    assert_eq!(map_capability("ui_l1", f64::NAN), None);
    assert_eq!(map_capability("ui_l1", f64::INFINITY), None);
}

#[test]
fn only_the_bound_unique_owner_and_allowlisted_signal_origin_are_authenticated() {
    let mut authenticator = DbusAuthenticator::default();
    assert!(authenticator.set_owner(Some(":1.42")));
    let accepted = signal(
        ":1.42",
        DBUS_TARGET_PATH,
        DBUS_TARGET_INTERFACE,
        DBUS_INPUT_MEMBER,
        "ui_l1",
        1.0,
    );
    assert_eq!(
        authenticator.authenticate(&accepted),
        Some(SemanticInput::Control(
            Control::L1,
            ControlTransition::Pressed
        ))
    );

    let rejected = [
        signal(
            ":1.99",
            DBUS_TARGET_PATH,
            DBUS_TARGET_INTERFACE,
            DBUS_INPUT_MEMBER,
            "ui_l1",
            1.0,
        ),
        signal(
            ":1.42",
            "/org/shadowblip/InputPlumber/devices/target/dbus1",
            DBUS_TARGET_INTERFACE,
            DBUS_INPUT_MEMBER,
            "ui_l1",
            1.0,
        ),
        signal(
            ":1.42",
            DBUS_TARGET_PATH,
            "org.shadowblip.Input.Other",
            DBUS_INPUT_MEMBER,
            "ui_l1",
            1.0,
        ),
        signal(
            ":1.42",
            DBUS_TARGET_PATH,
            DBUS_TARGET_INTERFACE,
            "OtherEvent",
            "ui_l1",
            1.0,
        ),
        signal(
            ":1.42",
            DBUS_TARGET_PATH,
            DBUS_TARGET_INTERFACE,
            DBUS_INPUT_MEMBER,
            "ui_unconfigured",
            1.0,
        ),
    ];
    for untrusted in &rejected {
        assert_eq!(authenticator.authenticate(untrusted), None);
    }

    assert!(authenticator.set_owner(Some("org.shadowblip.InputPlumber")));
    assert_eq!(authenticator.owner(), None);
    assert_eq!(authenticator.authenticate(&accepted), None);
}

#[test]
fn target_presence_requires_the_exact_inputplumber_interface() {
    assert!(introspection_has_target_interface(
        r#"<node><interface name="org.shadowblip.Input.DBusDevice"></interface></node>"#
    ));
    assert!(!introspection_has_target_interface(
        r#"<node><interface name="org.shadowblip.Input.DBusDevice.Other"></interface></node>"#
    ));
    assert!(!introspection_has_target_interface("<node></node>"));
}

#[test]
fn wire_message_requires_authenticated_header_and_body() {
    let mut authenticator = DbusAuthenticator::default();
    authenticator.set_owner(Some(":1.42"));
    let message = Message::signal(DBUS_TARGET_PATH, DBUS_TARGET_INTERFACE, DBUS_INPUT_MEMBER)
        .expect("signal builder")
        .sender(":1.42")
        .expect("unique sender")
        .build(&("ui_r1", 1.0_f64))
        .expect("signal body");

    assert_eq!(
        authenticated_message(&authenticator, &message),
        Some(SemanticInput::Control(
            Control::R1,
            ControlTransition::Pressed
        ))
    );

    let malformed = Message::signal(DBUS_TARGET_PATH, DBUS_TARGET_INTERFACE, DBUS_INPUT_MEMBER)
        .expect("signal builder")
        .sender(":1.42")
        .expect("unique sender")
        .build(&("ui_r1", "pressed"))
        .expect("malformed signal body");
    assert_eq!(authenticated_message(&authenticator, &malformed), None);
}
