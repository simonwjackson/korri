use axum::Router;
use std::{ffi::OsString, net::SocketAddr, os::fd::FromRawFd, path::PathBuf};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Mode {
    Brain,
    Host,
}

impl Mode {
    fn parse(value: Option<&str>) -> Result<Self, String> {
        match value.unwrap_or("brain") {
            "brain" => Ok(Self::Brain),
            "host" => Ok(Self::Host),
            other => Err(format!("KORRID_MODE must be brain or host, got {other:?}")),
        }
    }

    fn default_address(self) -> &'static str {
        match self {
            Self::Brain => "127.0.0.1:43117",
            Self::Host => "0.0.0.0:43117",
        }
    }
}

fn resolve_host_config_path(
    explicit: Option<OsString>,
    config_home: Option<OsString>,
    home: Option<OsString>,
) -> PathBuf {
    explicit
        .map(PathBuf::from)
        .or_else(|| {
            config_home
                .map(PathBuf::from)
                .map(|root| root.join("korrid/host.toml"))
        })
        .or_else(|| {
            home.map(PathBuf::from)
                .map(|root| root.join(".config/korrid/host.toml"))
        })
        .unwrap_or_else(|| PathBuf::from("host.toml"))
}

fn host_config_path() -> PathBuf {
    resolve_host_config_path(
        std::env::var_os("KORRID_HOST_CONFIG"),
        std::env::var_os("XDG_CONFIG_HOME"),
        std::env::var_os("HOME"),
    )
}

fn resolve_host_storage_root(explicit: Option<OsString>, home: Option<OsString>) -> PathBuf {
    explicit
        .map(PathBuf::from)
        .or_else(|| {
            home.map(PathBuf::from)
                .map(|root| root.join(".local/share/korri"))
        })
        .unwrap_or_else(|| PathBuf::from("korri"))
}

fn host_storage_root() -> PathBuf {
    resolve_host_storage_root(
        std::env::var_os("KORRID_STORAGE_ROOT"),
        std::env::var_os("HOME"),
    )
}

fn resolve_private_state_root(
    explicit: Option<OsString>,
    state_home: Option<OsString>,
    home: Option<OsString>,
) -> PathBuf {
    explicit
        .map(PathBuf::from)
        .or_else(|| state_home.map(PathBuf::from).map(|root| root.join("korri")))
        .or_else(|| {
            home.map(PathBuf::from)
                .map(|root| root.join(".local/state/korri"))
        })
        .unwrap_or_else(|| PathBuf::from("korri-state"))
}

fn private_state_root() -> PathBuf {
    resolve_private_state_root(
        std::env::var_os("KORRI_PRIVATE_STATE_ROOT"),
        std::env::var_os("XDG_STATE_HOME"),
        std::env::var_os("HOME"),
    )
}

fn brain_router() -> Router {
    let capability = std::env::var("KORRID_RPC_CAPABILITY")
        .expect("KORRID_RPC_CAPABILITY must be set for the brain server");
    let allowed_origin = std::env::var("KORRID_PORTAL_ORIGIN")
        .unwrap_or_else(|_| "https://appassets.androidplatform.net".into());
    korrid::router_with_capability_and_roots(
        &capability,
        &allowed_origin,
        std::env::var_os("KORRI_LOCAL_STORAGE_ROOT")
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::temp_dir().join("korri")),
        private_state_root(),
    )
}

fn validate_socket_activation(
    listen_pid: Option<&str>,
    listen_fds: Option<&str>,
    current_pid: u32,
) -> Result<bool, String> {
    let Some(count) = listen_fds else {
        return Ok(false);
    };
    let count: u32 = count
        .parse()
        .map_err(|_| "LISTEN_FDS must be a number".to_owned())?;
    let pid: u32 = listen_pid
        .ok_or_else(|| "LISTEN_PID is required with LISTEN_FDS".to_owned())?
        .parse()
        .map_err(|_| "LISTEN_PID must be a number".to_owned())?;
    if pid != current_pid || count != 1 {
        return Err("korrid requires exactly one inherited listener for its current PID".into());
    }
    Ok(true)
}

fn inherited_control_listener() -> Result<Option<std::os::unix::net::UnixListener>, String> {
    let listen_pid = std::env::var("LISTEN_PID").ok();
    let listen_fds = std::env::var("LISTEN_FDS").ok();
    if !validate_socket_activation(
        listen_pid.as_deref(),
        listen_fds.as_deref(),
        std::process::id(),
    )? {
        return Ok(None);
    }
    // systemd's socket-activation treaty assigns the first inherited descriptor
    // to fd 3. Ownership transfers to this listener exactly once.
    let listener = unsafe { std::os::unix::net::UnixListener::from_raw_fd(3) };
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("could not configure inherited listener: {error}"))?;
    Ok(Some(listener))
}

#[tokio::main]
async fn main() {
    let mode_value = std::env::var("KORRID_MODE").ok();
    let mode = Mode::parse(mode_value.as_deref()).unwrap_or_else(|error| panic!("{error}"));
    let (router, local_control) = match mode {
        Mode::Brain => (brain_router(), None),
        Mode::Host => {
            let (lan, local) = korrid::host_routers_with_storage_and_private(
                host_config_path(),
                Some(host_storage_root()),
                private_state_root(),
            );
            (lan, Some(local))
        }
    };
    let address: SocketAddr = std::env::var("KORRID_ADDRESS")
        .unwrap_or_else(|_| mode.default_address().into())
        .parse()
        .expect("valid KORRID_ADDRESS");
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .expect("bind korrid server");

    if let Some(router) = local_control {
        if let Some(listener) =
            inherited_control_listener().unwrap_or_else(|error| panic!("{error}"))
        {
            let listener = tokio::net::UnixListener::from_std(listener)
                .expect("adopt inherited local control listener");
            tokio::spawn(async move {
                axum::serve(listener, router)
                    .await
                    .expect("serve local korrid control");
            });
        }
    }
    axum::serve(listener, router).await.expect("serve korrid");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mode_defaults_to_brain_and_rejects_unknown_values() {
        assert_eq!(Mode::parse(None), Ok(Mode::Brain));
        assert_eq!(Mode::parse(Some("host")), Ok(Mode::Host));
        assert_eq!(Mode::Host.default_address(), "0.0.0.0:43117");
        assert!(Mode::parse(Some("other")).unwrap_err().contains("other"));
    }

    #[test]
    fn host_config_path_uses_explicit_then_xdg_then_home() {
        assert_eq!(
            resolve_host_config_path(
                Some("/explicit.toml".into()),
                Some("/xdg".into()),
                Some("/home/test".into()),
            ),
            PathBuf::from("/explicit.toml"),
        );
        assert_eq!(
            resolve_host_config_path(None, Some("/xdg".into()), Some("/home/test".into())),
            PathBuf::from("/xdg/korrid/host.toml"),
        );
        assert_eq!(
            resolve_host_config_path(None, None, Some("/home/test".into())),
            PathBuf::from("/home/test/.config/korrid/host.toml"),
        );
    }

    #[test]
    fn host_storage_uses_explicit_then_home() {
        assert_eq!(
            resolve_host_storage_root(Some("/games".into()), Some("/home/test".into())),
            PathBuf::from("/games"),
        );
        assert_eq!(
            resolve_host_storage_root(None, Some("/home/test".into())),
            PathBuf::from("/home/test/.local/share/korri"),
        );
    }

    #[test]
    fn socket_activation_accepts_only_one_listener_for_the_current_process() {
        assert_eq!(validate_socket_activation(None, None, 42), Ok(false));
        assert_eq!(
            validate_socket_activation(Some("42"), Some("1"), 42),
            Ok(true)
        );
        assert!(validate_socket_activation(Some("41"), Some("1"), 42).is_err());
        assert!(validate_socket_activation(Some("42"), Some("2"), 42).is_err());
        assert!(validate_socket_activation(None, Some("1"), 42).is_err());
    }

    #[test]
    fn private_state_root_uses_explicit_then_xdg_state_then_home() {
        assert_eq!(
            resolve_private_state_root(
                Some("/private".into()),
                Some("/state".into()),
                Some("/home/test".into()),
            ),
            PathBuf::from("/private"),
        );
        assert_eq!(
            resolve_private_state_root(None, Some("/state".into()), Some("/home/test".into())),
            PathBuf::from("/state/korri"),
        );
        assert_eq!(
            resolve_private_state_root(None, None, Some("/home/test".into())),
            PathBuf::from("/home/test/.local/state/korri"),
        );
    }
}
