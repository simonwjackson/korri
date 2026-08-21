use std::{fmt, future::Future, path::Path, time::Duration};

use futures_util::StreamExt;
use korri_input_core::controls::{Control, ControlTransition, DpadAxis};
use zbus::{message::Type, MatchRule, Message, MessageStream};

pub const INPUTPLUMBER_BUS_NAME: &str = "org.shadowblip.InputPlumber";
pub const INPUTPLUMBER_ROOT_PATH: &str = "/org/shadowblip/InputPlumber";
pub const COMPOSITE_DEVICE_INTERFACE: &str = "org.shadowblip.Input.CompositeDevice";
pub const DBUS_TARGET_PATH: &str = "/org/shadowblip/InputPlumber/devices/target/dbus0";
pub const DBUS_TARGET_INTERFACE: &str = "org.shadowblip.Input.DBusDevice";
pub const DBUS_INPUT_MEMBER: &str = "InputEvent";
pub const DBUS_OPERATION_TIMEOUT: Duration = Duration::from_millis(500);

#[zbus::proxy(interface = "org.shadowblip.Input.CompositeDevice")]
trait CompositeDevice {
    #[zbus(property)]
    fn dbus_devices(&self) -> zbus::Result<Vec<String>>;

    #[zbus(property)]
    fn profile_path(&self) -> zbus::Result<String>;

    fn load_profile_path(&self, path: String) -> zbus::Result<()>;
}

#[derive(Debug)]
pub enum DbusRuntimeError {
    TimedOut,
    Rejected(String),
    Zbus(zbus::Error),
}

impl DbusRuntimeError {
    pub fn is_transport_failure(&self) -> bool {
        matches!(self, Self::TimedOut | Self::Zbus(_))
    }
}

impl fmt::Display for DbusRuntimeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TimedOut => formatter.write_str("DBus operation timed out"),
            Self::Rejected(error) => formatter.write_str(error),
            Self::Zbus(error) => error.fmt(formatter),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProfileStatus {
    Pending,
    Ready,
    Applied,
}

impl std::error::Error for DbusRuntimeError {}

impl From<zbus::Error> for DbusRuntimeError {
    fn from(error: zbus::Error) -> Self {
        Self::Zbus(error)
    }
}

async fn bounded<T>(
    operation: impl Future<Output = zbus::Result<T>>,
) -> Result<T, DbusRuntimeError> {
    bounded_with_timeout(DBUS_OPERATION_TIMEOUT, operation).await
}

async fn bounded_with_timeout<T>(
    timeout: Duration,
    operation: impl Future<Output = zbus::Result<T>>,
) -> Result<T, DbusRuntimeError> {
    tokio::time::timeout(timeout, operation)
        .await
        .map_err(|_| DbusRuntimeError::TimedOut)?
        .map_err(DbusRuntimeError::Zbus)
}

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
    pub async fn system() -> Result<Self, DbusRuntimeError> {
        bounded(async {
            let connection = zbus::Connection::system().await?;
            Self::for_connection_unbounded(connection).await
        })
        .await
    }

    pub async fn for_connection(connection: zbus::Connection) -> Result<Self, DbusRuntimeError> {
        bounded(Self::for_connection_unbounded(connection)).await
    }

    async fn for_connection_unbounded(connection: zbus::Connection) -> zbus::Result<Self> {
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

    pub async fn current_owner(&self) -> Result<Option<String>, DbusRuntimeError> {
        current_authenticated_owner(&self.connection).await
    }

    pub async fn ensure_profile(
        &self,
        profile_path: &Path,
    ) -> Result<ProfileStatus, DbusRuntimeError> {
        let profile_path = profile_path
            .to_str()
            .ok_or_else(|| DbusRuntimeError::Rejected("profile path is not UTF-8".into()))?;
        tokio::time::timeout(
            DBUS_OPERATION_TIMEOUT,
            ensure_profile_unbounded(&self.connection, profile_path),
        )
        .await
        .map_err(|_| DbusRuntimeError::TimedOut)?
    }

    pub async fn next_message(&mut self) -> zbus::Result<Option<Message>> {
        self.messages.next().await.transpose()
    }
}

async fn ensure_profile_unbounded(
    connection: &zbus::Connection,
    profile_path: &str,
) -> Result<ProfileStatus, DbusRuntimeError> {
    let Some(owner) = current_unique_owner(connection).await? else {
        return Ok(ProfileStatus::Pending);
    };
    let root = zbus::fdo::IntrospectableProxy::builder(connection)
        .destination(owner.as_str())?
        .path(INPUTPLUMBER_ROOT_PATH)?
        .build()
        .await?;
    let xml = root
        .introspect()
        .await
        .map_err(|error| DbusRuntimeError::Zbus(error.into()))?;
    let composite_paths = composite_paths_from_introspection(&xml);
    let mut candidates = Vec::new();
    for path in composite_paths {
        let proxy = CompositeDeviceProxy::builder(connection)
            .destination(owner.as_str())?
            .path(path.as_str())?
            .build()
            .await?;
        if proxy
            .dbus_devices()
            .await?
            .iter()
            .any(|target| target == DBUS_TARGET_PATH)
        {
            candidates.push(path);
        }
    }
    let [path] = candidates.as_slice() else {
        return match candidates.len() {
            0 => Ok(ProfileStatus::Pending),
            _ => Err(DbusRuntimeError::Rejected(
                "more than one InputPlumber composite owns the required DBus target".into(),
            )),
        };
    };
    let proxy = CompositeDeviceProxy::builder(connection)
        .destination(owner.as_str())?
        .path(path.as_str())?
        .build()
        .await?;
    if proxy.profile_path().await? == profile_path {
        return if current_unique_owner(connection).await?.as_deref() == Some(owner.as_str()) {
            Ok(ProfileStatus::Ready)
        } else {
            Ok(ProfileStatus::Pending)
        };
    }
    proxy.load_profile_path(profile_path.to_owned()).await?;
    if current_unique_owner(connection).await?.as_deref() != Some(owner.as_str()) {
        return Ok(ProfileStatus::Pending);
    }
    if proxy.profile_path().await? != profile_path {
        return Err(DbusRuntimeError::Rejected(
            "InputPlumber did not retain the immutable Korri profile".into(),
        ));
    }
    if current_unique_owner(connection).await?.as_deref() != Some(owner.as_str()) {
        return Ok(ProfileStatus::Pending);
    }
    Ok(ProfileStatus::Applied)
}

pub fn composite_paths_from_introspection(xml: &str) -> Vec<String> {
    let mut paths = xml
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            let name = line
                .strip_prefix("<node name=\"CompositeDevice")?
                .split_once('\"')?
                .0;
            if name.is_empty() || !name.bytes().all(|byte| byte.is_ascii_digit()) {
                return None;
            }
            Some(format!("{INPUTPLUMBER_ROOT_PATH}/CompositeDevice{name}"))
        })
        .collect::<Vec<_>>();
    paths.sort();
    paths.dedup();
    paths
}

pub async fn current_authenticated_owner(
    connection: &zbus::Connection,
) -> Result<Option<String>, DbusRuntimeError> {
    bounded(current_authenticated_owner_unbounded(connection)).await
}

async fn current_authenticated_owner_unbounded(
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

#[cfg(test)]
mod tests {
    use std::{future, time::Duration};

    use super::{bounded_with_timeout, composite_paths_from_introspection, DbusRuntimeError};

    #[tokio::test]
    async fn bounded_wait_times_out_and_allows_a_fresh_retry() {
        let result =
            bounded_with_timeout(Duration::ZERO, future::pending::<zbus::Result<()>>()).await;
        assert!(matches!(result, Err(DbusRuntimeError::TimedOut)));

        let retry = bounded_with_timeout(Duration::ZERO, future::ready(Ok(42))).await;
        assert_eq!(retry.expect("ready retry"), 42);
    }

    #[test]
    fn composite_discovery_accepts_only_direct_numbered_children() {
        let xml = r#"
            <node>
              <node name="CompositeDevice10"/>
              <node name="devices"/>
              <node name="CompositeDevice2"/>
              <node name="CompositeDevice2"/>
              <node name="CompositeDevicebad"/>
              <node name="CompositeDevice0/child"/>
            </node>
        "#;

        assert_eq!(
            composite_paths_from_introspection(xml),
            vec![
                "/org/shadowblip/InputPlumber/CompositeDevice10",
                "/org/shadowblip/InputPlumber/CompositeDevice2",
            ]
        );
    }
}
