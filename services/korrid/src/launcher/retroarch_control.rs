use super::{LaunchContributorKind, LaunchSpec};
use std::{
    fmt, io,
    net::{Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket},
    time::Duration,
};

const CONTROL_ENDPOINT: SocketAddrV4 = SocketAddrV4::new(Ipv4Addr::LOCALHOST, 55355);
const CONTROL_TIMEOUT: Duration = Duration::from_millis(250);
const KORRI_PACKAGE: &str = "com.korri.retroarch";
const KORRI_ACTIVITY: &str = "com.retroarch.browser.retroactivity.RetroActivityFuture";
const KORRI_LAUNCHER: &str = "@korri:retroarch/retroarch";
const KORRI_EXECUTOR: &str = "retroarch-control";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RetroarchControlCommand {
    GetStatus,
    ShowMenu,
    Quit,
}

impl RetroarchControlCommand {
    fn verb(self) -> &'static str {
        match self {
            Self::GetStatus => "GET_STATUS",
            Self::ShowMenu => "SHOW_MENU",
            Self::Quit => "QUIT",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RetroarchControlResponse {
    Playing,
    NotPlaying,
    Acknowledged,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub(crate) enum RetroarchControlError {
    #[error("invalid RetroArch control authority")]
    InvalidAuthority,
    #[error("RetroArch control listener is unavailable")]
    Unavailable,
    #[error("RetroArch control request timed out")]
    Timeout,
    #[error("RetroArch control reply came from the wrong source")]
    WrongSource,
    #[error("RetroArch control reply did not match the request")]
    WrongResponse,
}

pub(crate) struct RetroarchControlAuthority {
    launch_id: String,
    token: Box<[u8; 64]>,
}

impl RetroarchControlAuthority {
    pub(crate) fn retain_from_verified_launch(
        spec: &LaunchSpec,
        token: &str,
    ) -> Result<Self, RetroarchControlError> {
        let trusted_shape = spec.launcher_id == "retroarch"
            && spec.component.package_name == KORRI_PACKAGE
            && spec.component.class_name == KORRI_ACTIVITY
            && spec.context.contributors.iter().any(|contributor| {
                contributor.kind == LaunchContributorKind::Launcher
                    && contributor.id == KORRI_LAUNCHER
            })
            && spec
                .context
                .executor
                .as_ref()
                .is_some_and(|executor| executor.id == KORRI_EXECUTOR && executor.available);
        if !trusted_shape {
            return Err(RetroarchControlError::InvalidAuthority);
        }
        Self::new(spec.launch_id.clone(), token)
    }

    fn new(launch_id: impl Into<String>, token: &str) -> Result<Self, RetroarchControlError> {
        if !valid_token(token) {
            return Err(RetroarchControlError::InvalidAuthority);
        }
        let mut retained = Box::new([0_u8; 64]);
        retained.copy_from_slice(token.as_bytes());
        Ok(Self {
            launch_id: launch_id.into(),
            token: retained,
        })
    }

    pub(crate) fn is_for(&self, launch_id: &str) -> bool {
        self.launch_id == launch_id
    }

    pub(crate) fn status(&self) -> Result<RetroarchControlResponse, RetroarchControlError> {
        self.request(RetroarchControlCommand::GetStatus)
    }

    pub(crate) fn invoke(
        &self,
        command: RetroarchControlCommand,
    ) -> Result<(), RetroarchControlError> {
        if command == RetroarchControlCommand::GetStatus {
            return Err(RetroarchControlError::WrongResponse);
        }
        match self.request(command)? {
            RetroarchControlResponse::Acknowledged => Ok(()),
            RetroarchControlResponse::Playing | RetroarchControlResponse::NotPlaying => {
                Err(RetroarchControlError::WrongResponse)
            }
        }
    }

    fn request(
        &self,
        command: RetroarchControlCommand,
    ) -> Result<RetroarchControlResponse, RetroarchControlError> {
        let socket = UdpSocket::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))
            .map_err(|_| RetroarchControlError::Unavailable)?;
        socket
            .set_read_timeout(Some(CONTROL_TIMEOUT))
            .map_err(|_| RetroarchControlError::Unavailable)?;
        let token = std::str::from_utf8(self.token.as_slice())
            .map_err(|_| RetroarchControlError::InvalidAuthority)?;
        request_with_socket(&socket, SocketAddr::V4(CONTROL_ENDPOINT), token, command)
    }
}

impl fmt::Debug for RetroarchControlAuthority {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("RetroarchControlAuthority")
            .field("launch_id", &self.launch_id)
            .field("token", &"[REDACTED]")
            .finish()
    }
}

impl Drop for RetroarchControlAuthority {
    fn drop(&mut self) {
        self.token.fill(0);
    }
}

fn valid_token(token: &str) -> bool {
    token.len() == 64
        && token
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn request_payload(
    token: &str,
    command: RetroarchControlCommand,
) -> Result<String, RetroarchControlError> {
    if !valid_token(token) {
        return Err(RetroarchControlError::InvalidAuthority);
    }
    Ok(format!("{token} {}", command.verb()))
}

fn request_with_socket(
    socket: &UdpSocket,
    endpoint: SocketAddr,
    token: &str,
    command: RetroarchControlCommand,
) -> Result<RetroarchControlResponse, RetroarchControlError> {
    let payload = request_payload(token, command)?;
    socket
        .send_to(payload.as_bytes(), endpoint)
        .map_err(|_| RetroarchControlError::Unavailable)?;
    let mut reply = [0_u8; 512];
    let (length, source) = socket
        .recv_from(&mut reply)
        .map_err(|error| match error.kind() {
            io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut => RetroarchControlError::Timeout,
            _ => RetroarchControlError::Unavailable,
        })?;
    if source != endpoint {
        return Err(RetroarchControlError::WrongSource);
    }
    parse_response(command, &reply[..length])
}

fn parse_response(
    command: RetroarchControlCommand,
    response: &[u8],
) -> Result<RetroarchControlResponse, RetroarchControlError> {
    match command {
        RetroarchControlCommand::ShowMenu if response == b"SHOW_MENU OK" => {
            Ok(RetroarchControlResponse::Acknowledged)
        }
        RetroarchControlCommand::Quit if response == b"QUIT OK" => {
            Ok(RetroarchControlResponse::Acknowledged)
        }
        RetroarchControlCommand::GetStatus if response == b"GET_STATUS CONTENTLESS" => {
            Ok(RetroarchControlResponse::NotPlaying)
        }
        RetroarchControlCommand::GetStatus => {
            let response = response
                .strip_suffix(b"\n")
                .ok_or(RetroarchControlError::WrongResponse)?;
            let text =
                std::str::from_utf8(response).map_err(|_| RetroarchControlError::WrongResponse)?;
            let details = text
                .strip_prefix("GET_STATUS PLAYING ")
                .or_else(|| text.strip_prefix("GET_STATUS PAUSED "))
                .ok_or(RetroarchControlError::WrongResponse)?;
            let (content, crc) = details
                .rsplit_once(",crc32=")
                .ok_or(RetroarchControlError::WrongResponse)?;
            if content.is_empty()
                || content.chars().any(char::is_control)
                || crc.is_empty()
                || !crc.bytes().all(|byte| byte.is_ascii_hexdigit())
            {
                return Err(RetroarchControlError::WrongResponse);
            }
            Ok(RetroarchControlResponse::Playing)
        }
        RetroarchControlCommand::ShowMenu | RetroarchControlCommand::Quit => {
            Err(RetroarchControlError::WrongResponse)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{net::UdpSocket, thread, time::Duration};

    const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn request_payloads_are_closed_and_token_shape_is_strict() {
        assert_eq!(
            request_payload(TOKEN, RetroarchControlCommand::GetStatus).unwrap(),
            format!("{TOKEN} GET_STATUS")
        );
        assert_eq!(
            request_payload(TOKEN, RetroarchControlCommand::ShowMenu).unwrap(),
            format!("{TOKEN} SHOW_MENU")
        );
        assert_eq!(
            request_payload(TOKEN, RetroarchControlCommand::Quit).unwrap(),
            format!("{TOKEN} QUIT")
        );
        for malformed in [
            "",
            "a",
            &"A".repeat(64),
            &"g".repeat(64),
            &"0".repeat(63),
            &"0".repeat(65),
        ] {
            assert_eq!(
                request_payload(malformed, RetroarchControlCommand::GetStatus),
                Err(RetroarchControlError::InvalidAuthority)
            );
        }
    }

    #[test]
    fn responses_are_exact_and_command_specific() {
        assert_eq!(
            parse_response(
                RetroarchControlCommand::GetStatus,
                b"GET_STATUS PLAYING mGBA,wl4,crc32=d6141609\n"
            ),
            Ok(RetroarchControlResponse::Playing)
        );
        assert_eq!(
            parse_response(
                RetroarchControlCommand::GetStatus,
                b"GET_STATUS PAUSED mGBA,wl4,crc32=0\n"
            ),
            Ok(RetroarchControlResponse::Playing)
        );
        assert_eq!(
            parse_response(
                RetroarchControlCommand::GetStatus,
                b"GET_STATUS CONTENTLESS"
            ),
            Ok(RetroarchControlResponse::NotPlaying)
        );
        assert_eq!(
            parse_response(RetroarchControlCommand::ShowMenu, b"SHOW_MENU OK"),
            Ok(RetroarchControlResponse::Acknowledged)
        );
        assert_eq!(
            parse_response(RetroarchControlCommand::Quit, b"QUIT OK"),
            Ok(RetroarchControlResponse::Acknowledged)
        );

        for (command, reply) in [
            (
                RetroarchControlCommand::GetStatus,
                b"GET_STATUS PLAYING".as_slice(),
            ),
            (
                RetroarchControlCommand::GetStatus,
                b"GET_STATUS PLAYING mGBA,wl4,crc32=nope\n".as_slice(),
            ),
            (
                RetroarchControlCommand::GetStatus,
                b"SHOW_MENU OK".as_slice(),
            ),
            (
                RetroarchControlCommand::ShowMenu,
                b"SHOW_MENU ERROR".as_slice(),
            ),
            (
                RetroarchControlCommand::ShowMenu,
                b"SHOW_MENU OK\n".as_slice(),
            ),
            (RetroarchControlCommand::Quit, b"QUIT ERROR".as_slice()),
            (RetroarchControlCommand::Quit, b"SHOW_MENU OK".as_slice()),
        ] {
            assert_eq!(
                parse_response(command, reply),
                Err(RetroarchControlError::WrongResponse)
            );
        }
    }

    fn launch_spec() -> LaunchSpec {
        LaunchSpec {
            launch_id: "launch-1".into(),
            launcher_id: "retroarch".into(),
            context: super::super::LaunchContext {
                game_id: Some("wl4".into()),
                title: Some("Wario Land 4".into()),
                contributors: vec![super::super::LaunchRouteContributor {
                    kind: LaunchContributorKind::Launcher,
                    id: KORRI_LAUNCHER.into(),
                }],
                executor: Some(super::super::LaunchExecutor {
                    id: KORRI_EXECUTOR.into(),
                    available: true,
                }),
                foreground: super::super::LaunchForegroundRule {
                    kind: super::super::LaunchForegroundKind::Component,
                    package_name: Some(KORRI_PACKAGE.into()),
                    class_name: Some(KORRI_ACTIVITY.into()),
                },
            },
            component: super::super::AndroidComponent {
                package_name: KORRI_PACKAGE.into(),
                class_name: KORRI_ACTIVITY.into(),
            },
            extras: std::collections::HashMap::new(),
            directories: vec![],
            files: vec![],
            integrity: "verified outside this module".into(),
        }
    }

    #[test]
    fn authority_accepts_only_the_exact_korri_retroarch_launch_shape() {
        assert!(
            RetroarchControlAuthority::retain_from_verified_launch(&launch_spec(), TOKEN).is_ok()
        );
        let mut stock = launch_spec();
        stock.component.package_name = "com.retroarch.aarch64".into();
        assert!(RetroarchControlAuthority::retain_from_verified_launch(&stock, TOKEN).is_err());
        let mut generic = launch_spec();
        generic.context.contributors[0].id = "@korri:android-app/android-app".into();
        assert!(RetroarchControlAuthority::retain_from_verified_launch(&generic, TOKEN).is_err());
        let mut unavailable = launch_spec();
        unavailable.context.executor.as_mut().unwrap().available = false;
        assert!(
            RetroarchControlAuthority::retain_from_verified_launch(&unavailable, TOKEN).is_err()
        );
    }

    #[test]
    fn authority_debug_output_redacts_the_token() {
        let authority = RetroarchControlAuthority::new("launch-1", TOKEN).unwrap();
        let debug = format!("{authority:?}");
        assert!(debug.contains("launch-1"));
        assert!(!debug.contains(TOKEN));
        assert!(debug.contains("[REDACTED]"));
    }

    #[test]
    fn udp_request_rejects_a_reply_from_the_wrong_source() {
        let expected = UdpSocket::bind("127.0.0.1:0").unwrap();
        let endpoint = expected.local_addr().unwrap();
        let sender = UdpSocket::bind("127.0.0.1:0").unwrap();
        let client = UdpSocket::bind("127.0.0.1:0").unwrap();
        client
            .set_read_timeout(Some(Duration::from_millis(100)))
            .unwrap();
        let client_address = client.local_addr().unwrap();
        thread::spawn(move || {
            let mut request = [0_u8; 256];
            expected.recv_from(&mut request).unwrap();
            sender.send_to(b"SHOW_MENU OK", client_address).unwrap();
        });

        assert_eq!(
            request_with_socket(&client, endpoint, TOKEN, RetroarchControlCommand::ShowMenu),
            Err(RetroarchControlError::WrongSource)
        );
    }

    #[test]
    fn udp_request_times_out_and_rejects_wrong_replies() {
        let silent = UdpSocket::bind("127.0.0.1:0").unwrap();
        let silent_endpoint = silent.local_addr().unwrap();
        let client = UdpSocket::bind("127.0.0.1:0").unwrap();
        client
            .set_read_timeout(Some(Duration::from_millis(20)))
            .unwrap();
        assert_eq!(
            request_with_socket(
                &client,
                silent_endpoint,
                TOKEN,
                RetroarchControlCommand::GetStatus
            ),
            Err(RetroarchControlError::Timeout)
        );

        let server = UdpSocket::bind("127.0.0.1:0").unwrap();
        let endpoint = server.local_addr().unwrap();
        thread::spawn(move || {
            let mut request = [0_u8; 256];
            let (_, source) = server.recv_from(&mut request).unwrap();
            server.send_to(b"QUIT OK", source).unwrap();
        });
        let client = UdpSocket::bind("127.0.0.1:0").unwrap();
        client
            .set_read_timeout(Some(Duration::from_millis(100)))
            .unwrap();
        assert_eq!(
            request_with_socket(&client, endpoint, TOKEN, RetroarchControlCommand::ShowMenu),
            Err(RetroarchControlError::WrongResponse)
        );
    }
}
