use std::str::FromStr;

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum Control {
    Home,
    L1,
    R1,
    Start,
    Select,
    L3,
    R3,
    Back,
    X,
    VolumeUp,
    VolumeDown,
    DpadUp,
    DpadDown,
    DpadLeft,
    DpadRight,
}

impl FromStr for Control {
    type Err = UnknownControl;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "home" => Ok(Self::Home),
            "l1" => Ok(Self::L1),
            "r1" => Ok(Self::R1),
            "start" => Ok(Self::Start),
            "select" => Ok(Self::Select),
            "l3" => Ok(Self::L3),
            "r3" => Ok(Self::R3),
            "back" => Ok(Self::Back),
            "x" => Ok(Self::X),
            "volume-up" => Ok(Self::VolumeUp),
            "volume-down" => Ok(Self::VolumeDown),
            "dpad-up" => Ok(Self::DpadUp),
            "dpad-down" => Ok(Self::DpadDown),
            "dpad-left" => Ok(Self::DpadLeft),
            "dpad-right" => Ok(Self::DpadRight),
            _ => Err(UnknownControl),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct UnknownControl;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ControlTransition {
    Pressed,
    Released,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ControlEvent {
    pub source: String,
    pub control: Control,
    pub transition: ControlTransition,
}

impl ControlEvent {
    pub fn pressed(source: impl Into<String>, control: Control) -> Self {
        Self {
            source: source.into(),
            control,
            transition: ControlTransition::Pressed,
        }
    }

    pub fn released(source: impl Into<String>, control: Control) -> Self {
        Self {
            source: source.into(),
            control,
            transition: ControlTransition::Released,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ControlValue {
    Released,
    Pressed,
    Repeat,
}

impl ControlValue {
    pub fn from_i32(value: i32) -> Option<Self> {
        match value {
            0 => Some(Self::Released),
            1 => Some(Self::Pressed),
            2 => Some(Self::Repeat),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DpadAxis {
    Horizontal,
    Vertical,
}

impl DpadAxis {
    pub(crate) fn control_for(self, value: i32) -> Option<Control> {
        match (self, value.cmp(&0)) {
            (Self::Horizontal, std::cmp::Ordering::Less) => Some(Control::DpadLeft),
            (Self::Horizontal, std::cmp::Ordering::Greater) => Some(Control::DpadRight),
            (Self::Vertical, std::cmp::Ordering::Less) => Some(Control::DpadUp),
            (Self::Vertical, std::cmp::Ordering::Greater) => Some(Control::DpadDown),
            (_, std::cmp::Ordering::Equal) => None,
        }
    }
}
