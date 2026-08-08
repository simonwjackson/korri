use std::{collections::VecDeque, io, path::PathBuf};

use futures_util::stream;
use korri_input_core::controls::{Control, ControlTransition};
use korri_inputd::{
    dbus::{Signal, DBUS_INPUT_MEMBER, DBUS_TARGET_INTERFACE, DBUS_TARGET_PATH},
    devices::{
        parse_proc_bus_input_devices, resolve_target, DeviceClass, DeviceDescriptor, DeviceInputId,
        OpenedTarget, TargetProvider, TargetResolution, XB360_TARGET_NAME,
    },
    runtime::{RecoveryReason, Runtime, RuntimeState},
};

struct InMemoryTargetProvider {
    devices: Vec<DeviceDescriptor>,
    opened: VecDeque<io::Result<DeviceDescriptor>>,
    end_stream_on_open: bool,
    enumerate_calls: usize,
    open_calls: usize,
}

impl InMemoryTargetProvider {
    fn with(devices: Vec<DeviceDescriptor>) -> Self {
        Self {
            devices,
            opened: VecDeque::new(),
            end_stream_on_open: false,
            enumerate_calls: 0,
            open_calls: 0,
        }
    }

    fn open_as(&mut self, descriptor: io::Result<DeviceDescriptor>) {
        self.opened.push_back(descriptor);
    }

    fn end_stream_on_open(&mut self) {
        self.end_stream_on_open = true;
    }
}

impl TargetProvider for InMemoryTargetProvider {
    fn enumerate(&mut self) -> io::Result<Vec<DeviceDescriptor>> {
        self.enumerate_calls += 1;
        Ok(self.devices.clone())
    }

    fn open(&mut self, expected: &DeviceDescriptor) -> io::Result<OpenedTarget> {
        self.open_calls += 1;
        let descriptor = self
            .opened
            .pop_front()
            .unwrap_or_else(|| Ok(expected.clone()))?;
        let events = if self.end_stream_on_open {
            self.end_stream_on_open = false;
            Box::pin(stream::empty()) as korri_inputd::devices::InputEventStream
        } else {
            Box::pin(stream::pending()) as korri_inputd::devices::InputEventStream
        };
        Ok(OpenedTarget { descriptor, events })
    }
}

fn target(node: &str) -> DeviceDescriptor {
    DeviceDescriptor {
        path: PathBuf::from(format!("/dev/input/{node}")),
        name: XB360_TARGET_NAME.to_owned(),
        physical_path: Some("inputplumber/virtual-xb360".to_owned()),
        unique_id: Some("inputplumber-xb360-1".to_owned()),
        sysfs_path: Some("/devices/virtual/input/input20".to_owned()),
        input_id: DeviceInputId {
            bus: 3,
            vendor: 0x045e,
            product: 0x028e,
            version: 0x0114,
        },
        class: DeviceClass::Gamepad,
        device_number: Some(100),
    }
}

fn raw(node: &str) -> DeviceDescriptor {
    DeviceDescriptor {
        path: PathBuf::from(format!("/dev/input/{node}")),
        name: "Xbox Wireless Controller".to_owned(),
        physical_path: Some("usb-0000:01".to_owned()),
        unique_id: None,
        sysfs_path: Some("/devices/pci/usb/input/input9".to_owned()),
        input_id: DeviceInputId::default(),
        class: DeviceClass::Gamepad,
        device_number: Some(9),
    }
}

fn ready_runtime(provider: &mut InMemoryTargetProvider) -> Runtime {
    let mut runtime = Runtime::default();
    runtime.set_dbus_owner(Some(":1.42"));
    runtime.reconcile(provider);
    assert!(matches!(runtime.state(), RuntimeState::Ready { .. }));
    runtime
}

fn send_dbus(
    runtime: &mut Runtime,
    control: Control,
    transition: ControlTransition,
) -> Vec<korri_inputd::runtime::RuntimeAction> {
    let capability = match control {
        Control::Home => "ui_guide",
        Control::L1 => "ui_l1",
        Control::R1 => "ui_r1",
        Control::Start => "ui_option",
        Control::Select => "ui_select",
        _ => panic!("test helper has no DBus capability for {control:?}"),
    };
    let owner = runtime.dbus_owner().expect("DBus owner").to_owned();
    runtime.handle_dbus_signal(&Signal {
        sender: &owner,
        path: DBUS_TARGET_PATH,
        interface: DBUS_TARGET_INTERFACE,
        member: DBUS_INPUT_MEMBER,
        capability,
        value: if transition == ControlTransition::Pressed {
            1.0
        } else {
            0.0
        },
    })
}

fn release_destructive(runtime: &mut Runtime) {
    for control in [Control::L1, Control::R1, Control::Start, Control::Select] {
        assert!(send_dbus(runtime, control, ControlTransition::Released).is_empty());
    }
}

#[test]
fn proc_fixture_resolves_only_the_exact_virtual_target() {
    let fixture = include_str!("fixtures/proc-bus-input/one-virtual-one-raw.txt");
    let devices = parse_proc_bus_input_devices(fixture, std::path::Path::new("/fixture/input"));

    assert_eq!(devices.len(), 3);
    let TargetResolution::Found(selected) = resolve_target(&devices) else {
        panic!("fixture must resolve exactly one normalized target");
    };
    assert_eq!(selected.path, PathBuf::from("/fixture/input/event10"));
    assert_eq!(selected.input_id.bus, 3);
    assert_eq!(selected.input_id.vendor, 0x045e);
    assert_eq!(selected.input_id.product, 0x028e);
    assert_eq!(selected.unique_id.as_deref(), Some("inputplumber-xb360-1"));
    assert_eq!(devices[1].unique_id, None);
}

#[test]
fn selects_one_virtual_xb360_and_never_falls_back_to_raw_gamepads() {
    let virtual_target = target("event10");
    let mut provider = InMemoryTargetProvider::with(vec![raw("event4"), virtual_target.clone()]);
    let runtime = ready_runtime(&mut provider);

    assert_eq!(
        runtime.state(),
        &RuntimeState::Ready {
            target: korri_inputd::runtime::ReadyTarget {
                identity: virtual_target.stable_identity(),
                path: virtual_target.path,
            }
        }
    );
    assert_eq!(provider.open_calls, 1);

    let mut raw_only = InMemoryTargetProvider::with(vec![raw("event4")]);
    let mut runtime = Runtime::default();
    runtime.set_dbus_owner(Some(":1.42"));
    runtime.reconcile(&mut raw_only);
    assert_eq!(runtime.state(), &RuntimeState::Missing { raw_gamepads: 1 });
    assert_eq!(raw_only.open_calls, 0);
}

#[test]
fn duplicated_non_destructive_controls_dispatch_once_per_chord_lifecycle() {
    let mut provider = InMemoryTargetProvider::with(vec![target("event10")]);
    let mut runtime = ready_runtime(&mut provider);

    assert!(send_dbus(&mut runtime, Control::Home, ControlTransition::Pressed).is_empty());
    let first = runtime.handle_evdev(1, 0x136, 1);
    assert_eq!(first.len(), 1);
    assert_eq!(first[0].id, "workspace-prev");
    assert!(!first[0].destructive);
    assert!(send_dbus(&mut runtime, Control::L1, ControlTransition::Pressed).is_empty());

    assert!(runtime.handle_evdev(1, 0x136, 0).is_empty());
    assert!(send_dbus(&mut runtime, Control::L1, ControlTransition::Released).is_empty());
    assert!(send_dbus(&mut runtime, Control::Home, ControlTransition::Released).is_empty());

    assert!(send_dbus(&mut runtime, Control::Home, ControlTransition::Pressed).is_empty());
    let second = send_dbus(&mut runtime, Control::L1, ControlTransition::Pressed);
    assert_eq!(second.len(), 1);
    assert_eq!(second[0].id, "workspace-prev");
}

#[test]
fn reconciliation_is_finite_and_opens_at_most_one_validated_target_per_tick() {
    let mut provider = InMemoryTargetProvider::with(vec![target("event10")]);
    let mut runtime = Runtime::default();
    runtime.set_dbus_owner(Some(":1.42"));

    runtime.reconcile(&mut provider);
    runtime.reconcile(&mut provider);

    assert_eq!(provider.enumerate_calls, 2);
    assert_eq!(provider.open_calls, 1);
}

#[test]
fn ambiguity_closes_the_stream_clears_held_state_and_recovers_after_hotplug() {
    let first = target("event10");
    let mut provider = InMemoryTargetProvider::with(vec![first.clone()]);
    let mut runtime = ready_runtime(&mut provider);
    assert!(runtime.handle_evdev(1, 0x13c, 1).is_empty());

    let mut second = target("event11");
    second.unique_id = Some("inputplumber-xb360-2".to_owned());
    second.device_number = Some(101);
    provider.devices.push(second);
    runtime.reconcile(&mut provider);
    assert!(matches!(runtime.state(), RuntimeState::Ambiguous { .. }));
    assert!(runtime.handle_evdev(1, 0x136, 1).is_empty());

    provider.devices = vec![first];
    runtime.reconcile(&mut provider);
    assert!(matches!(runtime.state(), RuntimeState::Ready { .. }));
    assert!(runtime.handle_evdev(1, 0x136, 1).is_empty());
}

#[test]
fn renumbered_target_reopens_without_carrying_held_controls() {
    let first = target("event10");
    let mut provider = InMemoryTargetProvider::with(vec![first]);
    let mut runtime = ready_runtime(&mut provider);
    assert!(runtime.handle_evdev(1, 0x13c, 1).is_empty());

    let mut renumbered = target("event14");
    renumbered.device_number = Some(114);
    provider.devices = vec![renumbered.clone()];
    runtime.reconcile(&mut provider);

    assert_eq!(provider.open_calls, 2);
    assert_eq!(
        runtime.state(),
        &RuntimeState::Ready {
            target: korri_inputd::runtime::ReadyTarget {
                identity: renumbered.stable_identity(),
                path: renumbered.path,
            }
        }
    );
    assert!(runtime.handle_evdev(1, 0x136, 1).is_empty());
}

#[test]
fn unreadable_required_target_is_retried_but_irrelevant_devices_are_not_opened() {
    let required = target("event10");
    let mut provider = InMemoryTargetProvider::with(vec![raw("event2"), required]);
    provider.open_as(Err(io::Error::new(
        io::ErrorKind::PermissionDenied,
        "fixture denial",
    )));
    let mut runtime = Runtime::default();
    runtime.set_dbus_owner(Some(":1.42"));
    runtime.reconcile(&mut provider);

    assert_eq!(
        runtime.state(),
        &RuntimeState::Recovering {
            reason: RecoveryReason::RequiredTargetUnreadable
        }
    );
    assert_eq!(provider.open_calls, 1);

    runtime.reconcile(&mut provider);
    assert!(matches!(runtime.state(), RuntimeState::Ready { .. }));
    assert_eq!(provider.open_calls, 2);
}

#[test]
fn descriptor_provenance_rejects_path_replacement_between_enumeration_and_open() {
    let mut expected = target("event10");
    expected.physical_path = None;
    expected.unique_id = None;
    let mut replacement = expected.clone();
    replacement.sysfs_path = Some("/devices/pci/usb/input/input9".to_owned());
    let mut provider = InMemoryTargetProvider::with(vec![expected]);
    provider.open_as(Ok(replacement));
    let mut runtime = Runtime::default();
    runtime.set_dbus_owner(Some(":1.42"));

    runtime.reconcile(&mut provider);

    assert_eq!(
        runtime.state(),
        &RuntimeState::Recovering {
            reason: RecoveryReason::DescriptorChangedAfterOpen
        }
    );
}

#[tokio::test]
async fn stream_loss_clears_state_and_requires_reconciliation_and_release_before_destructive_input()
{
    let required = target("event10");
    let mut provider = InMemoryTargetProvider::with(vec![required]);
    provider.end_stream_on_open();
    let mut runtime = ready_runtime(&mut provider);
    release_destructive(&mut runtime);
    for control in [Control::L1, Control::R1, Control::Start] {
        send_dbus(&mut runtime, control, ControlTransition::Pressed);
    }

    assert!(matches!(runtime.next_evdev_actions().await, Ok(None)));
    assert_eq!(
        runtime.state(),
        &RuntimeState::Recovering {
            reason: RecoveryReason::EventStreamLost
        }
    );
    runtime.reconcile(&mut provider);
    assert!(send_dbus(&mut runtime, Control::Select, ControlTransition::Pressed).is_empty());
    release_destructive(&mut runtime);
    for control in [Control::L1, Control::R1, Control::Start] {
        send_dbus(&mut runtime, control, ControlTransition::Pressed);
    }
    let actions = send_dbus(&mut runtime, Control::Select, ControlTransition::Pressed);
    assert_eq!(actions.len(), 1);
    assert!(actions[0].destructive);
}

#[test]
fn provider_owner_loss_and_change_clear_and_disarm_before_recovery() {
    let mut provider = InMemoryTargetProvider::with(vec![target("event10")]);
    let mut runtime = ready_runtime(&mut provider);
    release_destructive(&mut runtime);

    runtime.set_dbus_owner(None);
    assert_eq!(
        runtime.state(),
        &RuntimeState::Recovering {
            reason: RecoveryReason::ProviderUnavailable
        }
    );
    runtime.set_dbus_owner(Some(":1.99"));
    assert!(matches!(runtime.state(), RuntimeState::Ready { .. }));
    for control in [Control::L1, Control::R1, Control::Start, Control::Select] {
        assert!(send_dbus(&mut runtime, control, ControlTransition::Pressed).is_empty());
    }
}

#[test]
fn evdev_only_and_mixed_sources_cannot_complete_destructive_input() {
    let mut provider = InMemoryTargetProvider::with(vec![target("event10")]);
    let mut runtime = ready_runtime(&mut provider);
    release_destructive(&mut runtime);

    for code in [0x136, 0x137, 0x13b, 0x13a] {
        assert!(runtime.handle_evdev(1, code, 1).is_empty());
    }
    runtime.event_stream_lost();
    runtime.reconcile(&mut provider);
    release_destructive(&mut runtime);
    send_dbus(&mut runtime, Control::L1, ControlTransition::Pressed);
    send_dbus(&mut runtime, Control::R1, ControlTransition::Pressed);
    assert!(runtime.handle_evdev(1, 0x13b, 1).is_empty());
    assert!(runtime.handle_evdev(1, 0x13a, 1).is_empty());
}
