use crate::input_seat::{GamepadState, SeatBackend, SeatSpec, MAX_SEATS};
use evdev::{
    uinput::VirtualDevice, AbsInfo, AbsoluteAxisCode, AttributeSet, BusType, EventType, InputEvent,
    InputId, KeyCode, UinputAbsSetup,
};
use std::{
    collections::BTreeMap, ffi::CString, fs, os::unix::fs::MetadataExt, thread, time::Duration,
};

const BUTTONS: &[(u32, KeyCode)] = &[
    (0x0010, KeyCode::BTN_START),
    (0x0020, KeyCode::BTN_SELECT),
    (0x0040, KeyCode::BTN_THUMBL),
    (0x0080, KeyCode::BTN_THUMBR),
    (0x0100, KeyCode::BTN_TL),
    (0x0200, KeyCode::BTN_TR),
    (0x0400, KeyCode::BTN_MODE),
    (0x1000, KeyCode::BTN_SOUTH),
    (0x2000, KeyCode::BTN_EAST),
    (0x4000, KeyCode::BTN_NORTH),
    (0x8000, KeyCode::BTN_WEST),
];
const DPAD_UP: u32 = 0x0001;
const DPAD_DOWN: u32 = 0x0002;
const DPAD_LEFT: u32 = 0x0004;
const DPAD_RIGHT: u32 = 0x0008;

struct SeatDevice {
    device: VirtualDevice,
    state: GamepadState,
}

pub struct UinputSeatBackend {
    devices: BTreeMap<u8, SeatDevice>,
    event_gid: u32,
    preflight_complete: bool,
}

impl UinputSeatBackend {
    pub fn new(event_gid: u32) -> Self {
        Self {
            devices: BTreeMap::new(),
            event_gid,
            preflight_complete: false,
        }
    }

    fn reject_existing_seats(&self) -> Result<(), String> {
        let input_root = std::path::Path::new("/sys/class/input");
        for entry in fs::read_dir(input_root).map_err(display)? {
            let entry = entry.map_err(display)?;
            let file_name = entry.file_name();
            if !file_name.to_string_lossy().starts_with("event") {
                continue;
            }
            let device = entry.path().join("device");
            let name = fs::read_to_string(device.join("name")).ok();
            let physical = fs::read_to_string(device.join("phys")).ok();
            if is_seat_identity(
                name.as_deref().map(str::trim_end),
                physical.as_deref().map(str::trim_end),
            ) {
                return Err("a stale Korri input seat already exists".into());
            }
        }
        Ok(())
    }

    fn build_device(&self, spec: &SeatSpec) -> Result<VirtualDevice, String> {
        let mut keys = AttributeSet::<KeyCode>::new();
        for (_, key) in BUTTONS {
            keys.insert(*key);
        }
        let physical = CString::new(spec.physical_path.as_str()).map_err(display)?;
        let mut builder = VirtualDevice::builder()
            .map_err(display)?
            .name(&spec.name)
            .input_id(InputId::new(BusType::BUS_USB, 0x045e, 0x028e, 1))
            .with_phys(&physical)
            .map_err(display)?
            .with_keys(&keys)
            .map_err(display)?;
        for (axis, minimum, maximum, flat) in [
            (AbsoluteAxisCode::ABS_X, -32768, 32767, 4096),
            (AbsoluteAxisCode::ABS_Y, -32768, 32767, 4096),
            (AbsoluteAxisCode::ABS_Z, 0, 255, 0),
            (AbsoluteAxisCode::ABS_RX, -32768, 32767, 4096),
            (AbsoluteAxisCode::ABS_RY, -32768, 32767, 4096),
            (AbsoluteAxisCode::ABS_RZ, 0, 255, 0),
            (AbsoluteAxisCode::ABS_HAT0X, -1, 1, 0),
            (AbsoluteAxisCode::ABS_HAT0Y, -1, 1, 0),
        ] {
            builder = builder
                .with_absolute_axis(&UinputAbsSetup::new(
                    axis,
                    AbsInfo::new(0, minimum, maximum, 0, flat, 0),
                ))
                .map_err(display)?;
        }
        builder.build().map_err(display)
    }

    fn wait_for_event_node(&self, device: &mut VirtualDevice) -> Result<(), String> {
        for _ in 0..100 {
            if let Ok(nodes) = device.enumerate_dev_nodes_blocking() {
                for path in nodes.flatten() {
                    if let Ok(metadata) = fs::metadata(path) {
                        if metadata.gid() == self.event_gid && metadata.mode() & 0o777 == 0o660 {
                            return Ok(());
                        }
                    }
                }
            }
            thread::sleep(Duration::from_millis(20));
        }
        Err("Korri seat event node did not reach the required group and mode".into())
    }
}

impl SeatBackend for UinputSeatBackend {
    fn create(&mut self, spec: &SeatSpec) -> Result<(), String> {
        if spec.slot == 0 || spec.slot > MAX_SEATS || self.devices.contains_key(&spec.slot) {
            return Err("invalid or duplicate Korri seat slot".into());
        }
        if !self.preflight_complete {
            self.reject_existing_seats()?;
            self.preflight_complete = true;
        }
        let mut device = self.build_device(spec)?;
        self.wait_for_event_node(&mut device)?;
        self.devices.insert(
            spec.slot,
            SeatDevice {
                device,
                state: GamepadState::neutral(),
            },
        );
        Ok(())
    }

    fn write_state(&mut self, slot: u8, next: GamepadState) -> Result<(), String> {
        let seat = self
            .devices
            .get_mut(&slot)
            .ok_or_else(|| "Korri seat is not active".to_string())?;
        let current = seat.state;
        let mut events = Vec::new();
        for (mask, key) in BUTTONS {
            let before = current.buttons & mask != 0;
            let after = next.buttons & mask != 0;
            if before != after {
                events.push(InputEvent::new(EventType::KEY.0, key.0, i32::from(after)));
            }
        }
        push_axis(
            &mut events,
            AbsoluteAxisCode::ABS_HAT0X,
            hat(current.buttons, DPAD_LEFT, DPAD_RIGHT),
            hat(next.buttons, DPAD_LEFT, DPAD_RIGHT),
        );
        push_axis(
            &mut events,
            AbsoluteAxisCode::ABS_HAT0Y,
            hat(current.buttons, DPAD_UP, DPAD_DOWN),
            hat(next.buttons, DPAD_UP, DPAD_DOWN),
        );
        push_axis(
            &mut events,
            AbsoluteAxisCode::ABS_Z,
            current.left_trigger.into(),
            next.left_trigger.into(),
        );
        push_axis(
            &mut events,
            AbsoluteAxisCode::ABS_RZ,
            current.right_trigger.into(),
            next.right_trigger.into(),
        );
        push_axis(
            &mut events,
            AbsoluteAxisCode::ABS_X,
            current.left_stick_x.into(),
            next.left_stick_x.into(),
        );
        push_axis(
            &mut events,
            AbsoluteAxisCode::ABS_Y,
            current.left_stick_y.into(),
            next.left_stick_y.into(),
        );
        push_axis(
            &mut events,
            AbsoluteAxisCode::ABS_RX,
            current.right_stick_x.into(),
            next.right_stick_x.into(),
        );
        push_axis(
            &mut events,
            AbsoluteAxisCode::ABS_RY,
            current.right_stick_y.into(),
            next.right_stick_y.into(),
        );
        if !events.is_empty() {
            seat.device.emit(&events).map_err(display)?;
            seat.state = next;
        }
        Ok(())
    }

    fn destroy(&mut self, slot: u8) -> Result<(), String> {
        self.devices.remove(&slot);
        Ok(())
    }
}

fn push_axis(events: &mut Vec<InputEvent>, axis: AbsoluteAxisCode, before: i32, after: i32) {
    if before != after {
        events.push(InputEvent::new(EventType::ABSOLUTE.0, axis.0, after));
    }
}

fn hat(buttons: u32, negative: u32, positive: u32) -> i32 {
    match (buttons & negative != 0, buttons & positive != 0) {
        (true, false) => -1,
        (false, true) => 1,
        _ => 0,
    }
}

fn is_seat_identity(name: Option<&str>, physical_path: Option<&str>) -> bool {
    fn slot(value: &str, prefix: &str) -> bool {
        value
            .strip_prefix(prefix)
            .is_some_and(|slot| slot.len() == 1 && matches!(slot.as_bytes()[0], b'1'..=b'4'))
    }
    name.is_some_and(|value| slot(value, "Korri Seat P"))
        || physical_path.is_some_and(|value| slot(value, "korri/input-seat/p"))
}

fn display(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::is_seat_identity;

    #[test]
    fn only_exact_korri_seat_identities_are_reserved() {
        assert!(is_seat_identity(Some("Korri Seat P1"), None));
        assert!(is_seat_identity(None, Some("korri/input-seat/p4")));
        assert!(!is_seat_identity(Some("Korri Seat P5"), None));
        assert!(!is_seat_identity(Some("Korri Seat P1 extra"), None));
        assert!(!is_seat_identity(None, Some("korri/input-seat/p1/extra")));
    }
}
