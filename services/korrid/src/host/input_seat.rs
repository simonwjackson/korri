use std::{
    os::{
        fd::{AsRawFd, FromRawFd, OwnedFd, RawFd},
        unix::ffi::OsStrExt,
    },
    path::{Path, PathBuf},
};

const VERSION: u8 = 1;
const START: u8 = 1;
const STOP: u8 = 2;
const IO_TIMEOUT_MS: i32 = 2_000;

pub trait InputSeatLease: Send {
    fn alive(&self) -> bool;
    fn stop(self: Box<Self>, launch_id: &str) -> Result<(), String>;
}

pub trait InputSeatManager: Send + Sync {
    fn start(&self, launch_id: &str) -> Result<Box<dyn InputSeatLease>, String>;
}

pub struct DisabledInputSeats;
struct DisabledLease;
impl InputSeatManager for DisabledInputSeats {
    fn start(&self, _launch_id: &str) -> Result<Box<dyn InputSeatLease>, String> {
        Ok(Box::new(DisabledLease))
    }
}
impl InputSeatLease for DisabledLease {
    fn alive(&self) -> bool {
        true
    }
    fn stop(self: Box<Self>, _launch_id: &str) -> Result<(), String> {
        Ok(())
    }
}

pub struct UnixInputSeatManager {
    path: PathBuf,
}
impl UnixInputSeatManager {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }
}
impl InputSeatManager for UnixInputSeatManager {
    fn start(&self, launch_id: &str) -> Result<Box<dyn InputSeatLease>, String> {
        let fd = connect(&self.path)?;
        let peer = peer_credentials(fd.as_raw_fd())?;
        if peer != (0, 0) {
            return Err("input-seat receiver does not have the required root identity".into());
        }
        send_request(fd.as_raw_fd(), START, launch_id)?;
        receive_success(fd.as_raw_fd())?;
        Ok(Box::new(UnixInputSeatLease { fd }))
    }
}
struct UnixInputSeatLease {
    fd: OwnedFd,
}
impl InputSeatLease for UnixInputSeatLease {
    fn alive(&self) -> bool {
        let mut pollfd = libc::pollfd {
            fd: self.fd.as_raw_fd(),
            events: libc::POLLHUP | libc::POLLERR,
            revents: 0,
        };
        (unsafe { libc::poll(&mut pollfd, 1, 0) }) >= 0
            && pollfd.revents & (libc::POLLHUP | libc::POLLERR) == 0
    }
    fn stop(self: Box<Self>, launch_id: &str) -> Result<(), String> {
        send_request(self.fd.as_raw_fd(), STOP, launch_id)?;
        receive_success(self.fd.as_raw_fd())
    }
}

fn connect(path: &Path) -> Result<OwnedFd, String> {
    let bytes = path.as_os_str().as_bytes();
    if bytes.is_empty() || bytes.len() >= 108 {
        return Err("input-seat control path is invalid".into());
    }
    let fd = unsafe {
        libc::socket(
            libc::AF_UNIX,
            libc::SOCK_SEQPACKET | libc::SOCK_CLOEXEC | libc::SOCK_NONBLOCK,
            0,
        )
    };
    if fd < 0 {
        return Err(last("socket"));
    }
    let fd = unsafe { OwnedFd::from_raw_fd(fd) };
    let mut address: libc::sockaddr_un = unsafe { std::mem::zeroed() };
    address.sun_family = libc::AF_UNIX as libc::sa_family_t;
    for (target, source) in address.sun_path.iter_mut().zip(bytes.iter().copied()) {
        *target = source as libc::c_char;
    }
    let length = (std::mem::size_of::<libc::sa_family_t>() + bytes.len() + 1) as libc::socklen_t;
    if unsafe {
        libc::connect(
            fd.as_raw_fd(),
            (&address as *const libc::sockaddr_un).cast(),
            length,
        )
    } != 0
    {
        let error = std::io::Error::last_os_error();
        if !error.raw_os_error().is_some_and(|code| {
            code == libc::EINPROGRESS || code == libc::EAGAIN || code == libc::EWOULDBLOCK
        }) {
            return Err(format!("input-seat connect failed: {error}"));
        }
        wait_ready(fd.as_raw_fd(), libc::POLLOUT, IO_TIMEOUT_MS)?;
        let pending = socket_error(fd.as_raw_fd())?;
        if pending != 0 {
            return Err(format!(
                "input-seat connect failed: {}",
                std::io::Error::from_raw_os_error(pending)
            ));
        }
    }
    Ok(fd)
}

fn send_request(fd: RawFd, operation: u8, launch_id: &str) -> Result<(), String> {
    if launch_id.len() != 32
        || !launch_id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err("launch ID is invalid".into());
    }
    let mut request = [0u8; 34];
    request[0] = VERSION;
    request[1] = operation;
    request[2..].copy_from_slice(launch_id.as_bytes());
    wait_ready(fd, libc::POLLOUT, IO_TIMEOUT_MS)?;
    let count = unsafe {
        libc::send(
            fd,
            request.as_ptr().cast(),
            request.len(),
            libc::MSG_NOSIGNAL | libc::MSG_DONTWAIT,
        )
    };
    if count == request.len() as isize {
        Ok(())
    } else {
        Err(last("send"))
    }
}

fn receive_success(fd: RawFd) -> Result<(), String> {
    wait_ready(fd, libc::POLLIN, IO_TIMEOUT_MS)?;
    let mut reply = [0u8; 4];
    let count = unsafe {
        libc::recv(
            fd,
            reply.as_mut_ptr().cast(),
            reply.len(),
            libc::MSG_TRUNC | libc::MSG_DONTWAIT,
        )
    };
    if count != 3 || reply[0] != VERSION || reply[1] != 0 {
        return Err("input-seat receiver rejected the request".into());
    }
    Ok(())
}

fn wait_ready(fd: RawFd, events: i16, timeout_ms: i32) -> Result<(), String> {
    let mut descriptor = libc::pollfd {
        fd,
        events,
        revents: 0,
    };
    loop {
        let result = unsafe { libc::poll(&mut descriptor, 1, timeout_ms) };
        if result > 0 {
            if descriptor.revents & events != 0 {
                return Ok(());
            }
            if descriptor.revents & (libc::POLLERR | libc::POLLHUP | libc::POLLNVAL) != 0 {
                return Err("input-seat socket closed before the operation completed".into());
            }
            return Err("input-seat socket reported an unexpected event".into());
        }
        if result == 0 {
            return Err("input-seat socket operation timed out".into());
        }
        if std::io::Error::last_os_error().raw_os_error() != Some(libc::EINTR) {
            return Err(last("poll"));
        }
    }
}

fn socket_error(fd: RawFd) -> Result<i32, String> {
    let mut error = 0i32;
    let mut length = std::mem::size_of::<i32>() as libc::socklen_t;
    if unsafe {
        libc::getsockopt(
            fd,
            libc::SOL_SOCKET,
            libc::SO_ERROR,
            (&mut error as *mut i32).cast(),
            &mut length,
        )
    } == 0
    {
        Ok(error)
    } else {
        Err(last("getsockopt"))
    }
}

fn peer_credentials(fd: RawFd) -> Result<(u32, u32), String> {
    let mut credentials: libc::ucred = unsafe { std::mem::zeroed() };
    let mut length = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
    if unsafe {
        libc::getsockopt(
            fd,
            libc::SOL_SOCKET,
            libc::SO_PEERCRED,
            (&mut credentials as *mut libc::ucred).cast(),
            &mut length,
        )
    } != 0
    {
        return Err(last("getsockopt"));
    }
    Ok((credentials.uid, credentials.gid))
}
fn last(operation: &str) -> String {
    format!(
        "input-seat {operation} failed: {}",
        std::io::Error::last_os_error()
    )
}
