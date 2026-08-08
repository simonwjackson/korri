use std::io;

/// Platform-neutral machine health published by the daemon boundary.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeHealth {
    Ready,
    Missing,
    Ambiguous,
    Recovering,
}

impl RuntimeHealth {
    pub const fn status(self) -> &'static str {
        match self {
            Self::Ready => "Ready",
            Self::Missing => "Missing",
            Self::Ambiguous => "Ambiguous",
            Self::Recovering => "Recovering",
        }
    }
}

pub trait HealthPublisher {
    /// Signals process initialization. This does not claim controller readiness.
    fn initialized(&mut self, health: RuntimeHealth) -> io::Result<()>;
    fn publish(&mut self, health: RuntimeHealth) -> io::Result<()>;
}

#[cfg(target_os = "linux")]
pub mod systemd {
    use super::{HealthPublisher, RuntimeHealth};
    use std::{io, mem, os::unix::ffi::OsStrExt};

    #[derive(Default)]
    pub struct SystemdHealthPublisher {
        last: Option<RuntimeHealth>,
    }

    impl HealthPublisher for SystemdHealthPublisher {
        fn initialized(&mut self, health: RuntimeHealth) -> io::Result<()> {
            notify(&format!("READY=1\nSTATUS={}", health.status()))?;
            self.last = Some(health);
            Ok(())
        }

        fn publish(&mut self, health: RuntimeHealth) -> io::Result<()> {
            if self.last == Some(health) {
                return Ok(());
            }
            notify(&format!("STATUS={}", health.status()))?;
            self.last = Some(health);
            Ok(())
        }
    }

    fn notify(message: &str) -> io::Result<()> {
        let Some(socket) = std::env::var_os("NOTIFY_SOCKET") else {
            return Ok(());
        };
        let socket = socket.as_bytes();
        if socket.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "NOTIFY_SOCKET is empty",
            ));
        }
        let maximum = mem::size_of::<libc::sockaddr_un>() - mem::size_of::<libc::sa_family_t>();
        if socket.len() + usize::from(socket[0] != b'@') > maximum {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "NOTIFY_SOCKET is too long",
            ));
        }

        let fd = unsafe { libc::socket(libc::AF_UNIX, libc::SOCK_DGRAM | libc::SOCK_CLOEXEC, 0) };
        if fd < 0 {
            return Err(io::Error::last_os_error());
        }
        let mut address: libc::sockaddr_un = unsafe { mem::zeroed() };
        address.sun_family = libc::AF_UNIX as libc::sa_family_t;
        let (offset, bytes) = if socket[0] == b'@' {
            (1, &socket[1..])
        } else {
            (0, socket)
        };
        for (index, byte) in bytes.iter().enumerate() {
            address.sun_path[index + offset] = *byte as libc::c_char;
        }
        let address_len = mem::size_of::<libc::sa_family_t>() + offset + bytes.len();
        let sent = unsafe {
            libc::sendto(
                fd,
                message.as_ptr().cast(),
                message.len(),
                libc::MSG_NOSIGNAL,
                (&address as *const libc::sockaddr_un).cast(),
                address_len as libc::socklen_t,
            )
        };
        let error = (sent < 0).then(io::Error::last_os_error);
        unsafe { libc::close(fd) };
        error.map_or(Ok(()), Err)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_values_are_fixed_and_controller_specific() {
        assert_eq!(RuntimeHealth::Ready.status(), "Ready");
        assert_eq!(RuntimeHealth::Missing.status(), "Missing");
        assert_eq!(RuntimeHealth::Ambiguous.status(), "Ambiguous");
        assert_eq!(RuntimeHealth::Recovering.status(), "Recovering");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn systemd_adapter_distinguishes_initialization_from_controller_readiness() {
        use super::systemd::SystemdHealthPublisher;
        use std::{os::unix::net::UnixDatagram, sync::Mutex, time::Duration};

        static ENVIRONMENT: Mutex<()> = Mutex::new(());
        let _environment = ENVIRONMENT.lock().unwrap();
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("notify.sock");
        let socket = UnixDatagram::bind(&path).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(1)))
            .unwrap();
        std::env::set_var("NOTIFY_SOCKET", &path);
        let mut publisher = SystemdHealthPublisher::default();

        publisher.initialized(RuntimeHealth::Recovering).unwrap();
        let mut message = [0_u8; 128];
        let count = socket.recv(&mut message).unwrap();
        assert_eq!(&message[..count], b"READY=1\nSTATUS=Recovering");

        publisher.publish(RuntimeHealth::Missing).unwrap();
        let count = socket.recv(&mut message).unwrap();
        assert_eq!(&message[..count], b"STATUS=Missing");
        std::env::remove_var("NOTIFY_SOCKET");
    }
}
