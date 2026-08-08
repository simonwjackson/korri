use futures_util::StreamExt;
use korri_input_core::controls::{Control, ControlTransition, DpadAxis};
use zbus::{message::Type, MatchRule, Message, MessageStream};

pub const INPUTPLUMBER_BUS_NAME: &str = "org.shadowblip.InputPlumber";
pub const DBUS_TARGET_PATH: &str = "/org/shadowblip/InputPlumber/devices/target/dbus0";
pub const DBUS_TARGET_INTERFACE: &str = "org.shadowblip.Input.DBusDevice";
pub const DBUS_INPUT_MEMBER: &str = "InputEvent";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SemanticInput {
    Control(Control, ControlTransition),
    Axis(DpadAxis, i32),
}

#[derive(Clone, Debug, PartialEq)]
pub struct Signal<'a> {
    pub sender: &'a str,
    pub path: &'a str,
    pub interface: &'a str,
    pub member: &'a str,
    pub capability: &'a str,
    pub value: f64,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct DbusAuthenticator {
    owner: Option<String>,
}

impl DbusAuthenticator {
    pub fn owner(&self) -> Option<&str> {
        self.owner.as_deref()
    }

    pub fn set_owner(&mut self, owner: Option<&str>) -> bool {
        let owner = owner
            .filter(|value| zbus::names::UniqueName::try_from(*value).is_ok())
            .map(str::to_owned);
        if self.owner == owner {
            return false;
        }
        self.owner = owner;
        true
    }

    pub fn authenticate(&self, signal: &Signal<'_>) -> Option<SemanticInput> {
        if self.owner.as_deref() != Some(signal.sender)
            || signal.path != DBUS_TARGET_PATH
            || signal.interface != DBUS_TARGET_INTERFACE
            || signal.member != DBUS_INPUT_MEMBER
        {
            return None;
        }
        map_capability(signal.capability, signal.value)
    }
}

pub struct DbusSignalSource {
    connection: zbus::Connection,
    messages: MessageStream,
}

impl DbusSignalSource {
    pub async fn system() -> zbus::Result<Self> {
        let connection = zbus::Connection::system().await?;
        Self::for_connection(connection).await
    }

    pub async fn for_connection(connection: zbus::Connection) -> zbus::Result<Self> {
        let rule = MatchRule::builder()
            .msg_type(Type::Signal)
            .path(DBUS_TARGET_PATH)?
            .interface(DBUS_TARGET_INTERFACE)?
            .member(DBUS_INPUT_MEMBER)?
            .build();
        let messages = MessageStream::for_match_rule(rule, &connection, Some(32)).await?;
        Ok(Self {
            connection,
            messages,
        })
    }

    pub async fn current_owner(&self) -> zbus::Result<Option<String>> {
        current_authenticated_owner(&self.connection).await
    }

    pub async fn next_message(&mut self) -> zbus::Result<Option<Message>> {
        self.messages.next().await.transpose()
    }
}

pub async fn current_authenticated_owner(
    connection: &zbus::Connection,
) -> zbus::Result<Option<String>> {
    let Some(owner) = current_unique_owner(connection).await? else {
        return Ok(None);
    };
    let proxy = zbus::fdo::IntrospectableProxy::builder(connection)
        .destination(owner.as_str())?
        .path(DBUS_TARGET_PATH)?
        .build()
        .await?;
    let Ok(xml) = proxy.introspect().await else {
        return Ok(None);
    };
    if !introspection_has_target_interface(&xml) {
        return Ok(None);
    }
    if current_unique_owner(connection).await?.as_deref() != Some(owner.as_str()) {
        return Ok(None);
    }
    Ok(Some(owner))
}

pub fn introspection_has_target_interface(xml: &str) -> bool {
    xml.contains("<interface name=\"org.shadowblip.Input.DBusDevice\">")
}

pub async fn current_unique_owner(connection: &zbus::Connection) -> zbus::Result<Option<String>> {
    let proxy = zbus::fdo::DBusProxy::new(connection).await?;
    let name = zbus::names::BusName::try_from(INPUTPLUMBER_BUS_NAME)?;
    match proxy.get_name_owner(name).await {
        Ok(owner) => Ok(Some(owner.to_string())),
        Err(zbus::fdo::Error::NameHasNoOwner(_)) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

pub fn authenticated_message(
    authenticator: &DbusAuthenticator,
    message: &zbus::Message,
) -> Option<SemanticInput> {
    let header = message.header();
    let signal = Signal {
        sender: header.sender()?.as_str(),
        path: header.path()?.as_str(),
        interface: header.interface()?.as_str(),
        member: header.member()?.as_str(),
        capability: "",
        value: 0.0,
    };
    if authenticator.owner.as_deref() != Some(signal.sender)
        || signal.path != DBUS_TARGET_PATH
        || signal.interface != DBUS_TARGET_INTERFACE
        || signal.member != DBUS_INPUT_MEMBER
    {
        return None;
    }
    let (capability, value) = message.body().deserialize::<(String, f64)>().ok()?;
    map_capability(&capability, value)
}

pub fn map_capability(capability: &str, value: f64) -> Option<SemanticInput> {
    if !value.is_finite() {
        return None;
    }
    let transition = if value >= 0.5 {
        ControlTransition::Pressed
    } else {
        ControlTransition::Released
    };
    let control = match capability {
        "ui_guide" => Control::Home,
        "ui_l1" => Control::L1,
        "ui_r1" => Control::R1,
        "ui_l3" => Control::L3,
        "ui_r3" => Control::R3,
        "ui_option" => Control::Start,
        "ui_select" => Control::Select,
        "ui_back" => Control::Back,
        "ui_osk" => Control::X,
        "ui_volume_up" => Control::VolumeUp,
        "ui_volume_down" => Control::VolumeDown,
        "ui_up" => {
            return Some(SemanticInput::Axis(
                DpadAxis::Vertical,
                if transition == ControlTransition::Pressed {
                    -1
                } else {
                    0
                },
            ));
        }
        "ui_down" => {
            return Some(SemanticInput::Axis(
                DpadAxis::Vertical,
                if transition == ControlTransition::Pressed {
                    1
                } else {
                    0
                },
            ));
        }
        "ui_left" => {
            return Some(SemanticInput::Axis(
                DpadAxis::Horizontal,
                if transition == ControlTransition::Pressed {
                    -1
                } else {
                    0
                },
            ));
        }
        "ui_right" => {
            return Some(SemanticInput::Axis(
                DpadAxis::Horizontal,
                if transition == ControlTransition::Pressed {
                    1
                } else {
                    0
                },
            ));
        }
        _ => return None,
    };
    Some(SemanticInput::Control(control, transition))
}
