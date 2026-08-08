use std::{
    io, os::fd::AsRawFd, os::unix::net::UnixStream as StdUnixStream, process::ExitStatus,
    sync::Arc, time::Duration,
};

use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::UnixStream,
    process::Command,
    task::JoinHandle,
};

use crate::{
    action_catalog::{ActionCommand, ActionId},
    actions::{ActionIdentity, ActionLimits},
    cgroup_sandbox::ActionCgroupBackend,
};

const OUTPUT_DRAIN_GRACE: Duration = Duration::from_millis(100);
const EMPTY_PROOF_ATTEMPTS: usize = 20;
const EMPTY_PROOF_DELAY: Duration = Duration::from_millis(5);

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ActionOutcome {
    Unconfigured,
    ConcurrencyLimited,
    Completed(ActionOutput),
    Failed(ActionOutput),
    TimedOut(ActionOutput),
    SpawnFailed(String),
    ContainmentFailed(String),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionOutput {
    pub status: Option<ExitStatus>,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub stdout_truncated: bool,
    pub stderr_truncated: bool,
}

#[derive(Clone)]
pub struct DirectRunner {
    backend: Arc<dyn ActionCgroupBackend>,
}

impl DirectRunner {
    pub fn new(backend: Arc<dyn ActionCgroupBackend>) -> Self {
        Self { backend }
    }

    pub async fn execute(
        &self,
        action_id: ActionId,
        configured: ActionCommand,
        identity: ActionIdentity,
        limits: ActionLimits,
    ) -> ActionOutcome {
        let cgroup = match self.backend.create(action_id) {
            Ok(cgroup) => cgroup,
            Err(error) => return ActionOutcome::ContainmentFailed(bounded_error(&error)),
        };
        let (parent_barrier, child_barrier) = match StdUnixStream::pair() {
            Ok(pair) => pair,
            Err(error) => {
                return self.containment_failure(&cgroup, error.to_string()).await;
            }
        };
        let parent_barrier_fd = parent_barrier.as_raw_fd();
        if let Err(error) = parent_barrier.set_nonblocking(true) {
            return self.containment_failure(&cgroup, error.to_string()).await;
        }
        let mut parent_barrier = match UnixStream::from_std(parent_barrier) {
            Ok(stream) => stream,
            Err(error) => return self.containment_failure(&cgroup, error.to_string()).await,
        };

        let spawning = tokio::task::spawn_blocking(move || {
            let barrier_fd = child_barrier.as_raw_fd();
            let mut command = Command::new(configured.executable());
            command
                .args(configured.argv())
                .env_clear()
                .envs(configured.environment())
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .kill_on_drop(true);
            unsafe {
                command.pre_exec(move || {
                    action_child_barrier(barrier_fd, parent_barrier_fd, identity)
                });
            }
            command.spawn()
        });

        let mut pid_bytes = [0_u8; 4];
        let ready =
            tokio::time::timeout(limits.timeout, parent_barrier.read_exact(&mut pid_bytes)).await;
        if !matches!(ready, Ok(Ok(_))) {
            drop(parent_barrier);
            let _ = spawning.await;
            return self
                .containment_failure(
                    &cgroup,
                    "action child did not reach the containment barrier".into(),
                )
                .await;
        }
        let pid = u32::from_ne_bytes(pid_bytes);
        let contained = self
            .backend
            .attach(&cgroup, pid)
            .and_then(|()| self.backend.contains(&cgroup, pid));
        if !matches!(contained, Ok(true)) {
            drop(parent_barrier);
            let _ = spawning.await;
            let detail = match contained {
                Ok(false) => "cgroup membership could not be proven".into(),
                Err(error) => error.to_string(),
                Ok(true) => unreachable!(),
            };
            return self.containment_failure(&cgroup, detail).await;
        }
        if parent_barrier.write_all(&[1]).await.is_err() {
            drop(parent_barrier);
            let _ = spawning.await;
            return self
                .containment_failure(
                    &cgroup,
                    "action child containment barrier could not be released".into(),
                )
                .await;
        }
        drop(parent_barrier);

        let mut child = match spawning.await {
            Ok(Ok(child)) => child,
            Ok(Err(error)) => {
                let outcome = ActionOutcome::SpawnFailed(bounded_error(&error));
                return self.finish_without_child(&cgroup, outcome).await;
            }
            Err(error) => {
                return self.containment_failure(&cgroup, error.to_string()).await;
            }
        };
        let stdout = child.stdout.take().expect("configured stdout pipe");
        let stderr = child.stderr.take().expect("configured stderr pipe");
        let stdout_task = tokio::spawn(capture(stdout, limits.max_output_bytes));
        let stderr_task = tokio::spawn(capture(stderr, limits.max_output_bytes));

        let (status, timed_out) = match tokio::time::timeout(limits.timeout, child.wait()).await {
            Ok(Ok(status)) => (Some(status), false),
            Ok(Err(_)) => (None, false),
            Err(_) => {
                if let Err(error) = self.backend.kill(&cgroup) {
                    let _ = child.start_kill();
                    let _ = child.wait().await;
                    return self.containment_failure(&cgroup, error.to_string()).await;
                }
                let _ = child.start_kill();
                (child.wait().await.ok(), true)
            }
        };

        if let Err(error) = self.cleanup_after_child(&cgroup).await {
            return ActionOutcome::ContainmentFailed(bounded_error(&error));
        }

        let stdout = finish_capture(stdout_task).await;
        let stderr = finish_capture(stderr_task).await;
        let output = ActionOutput {
            status,
            stdout: stdout.bytes,
            stderr: stderr.bytes,
            stdout_truncated: stdout.truncated,
            stderr_truncated: stderr.truncated,
        };
        if timed_out {
            ActionOutcome::TimedOut(output)
        } else if output.status.as_ref().is_some_and(ExitStatus::success) {
            ActionOutcome::Completed(output)
        } else {
            ActionOutcome::Failed(output)
        }
    }

    async fn finish_without_child(
        &self,
        cgroup: &crate::cgroup_sandbox::ActionCgroup,
        outcome: ActionOutcome,
    ) -> ActionOutcome {
        match self.prove_empty_and_remove(cgroup).await {
            Ok(()) => outcome,
            Err(error) => ActionOutcome::ContainmentFailed(bounded_error(&error)),
        }
    }

    async fn containment_failure(
        &self,
        cgroup: &crate::cgroup_sandbox::ActionCgroup,
        detail: String,
    ) -> ActionOutcome {
        let cleanup = self.backend.kill(cgroup).and_then(|()| {
            for _ in 0..EMPTY_PROOF_ATTEMPTS {
                if !self.backend.populated(cgroup)? {
                    return self.backend.remove(cgroup);
                }
                std::thread::sleep(EMPTY_PROOF_DELAY);
            }
            Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "action cgroup remained populated",
            ))
        });
        let message = match cleanup {
            Ok(()) => detail,
            Err(error) => format!("{detail}; cleanup failed: {error}"),
        };
        ActionOutcome::ContainmentFailed(message.chars().take(240).collect())
    }

    async fn cleanup_after_child(
        &self,
        cgroup: &crate::cgroup_sandbox::ActionCgroup,
    ) -> io::Result<()> {
        if self.backend.populated(cgroup)? {
            self.backend.kill(cgroup)?;
        }
        self.prove_empty_and_remove(cgroup).await
    }

    async fn prove_empty_and_remove(
        &self,
        cgroup: &crate::cgroup_sandbox::ActionCgroup,
    ) -> io::Result<()> {
        for _ in 0..EMPTY_PROOF_ATTEMPTS {
            if !self.backend.populated(cgroup)? {
                return self.backend.remove(cgroup);
            }
            tokio::time::sleep(EMPTY_PROOF_DELAY).await;
        }
        Err(io::Error::new(
            io::ErrorKind::TimedOut,
            "action cgroup remained populated",
        ))
    }
}

async fn finish_capture(mut task: JoinHandle<Capture>) -> Capture {
    match tokio::time::timeout(OUTPUT_DRAIN_GRACE, &mut task).await {
        Ok(Ok(capture)) => capture,
        Ok(Err(_)) => Capture {
            bytes: Vec::new(),
            truncated: true,
        },
        Err(_) => {
            task.abort();
            Capture {
                bytes: Vec::new(),
                truncated: true,
            }
        }
    }
}

#[derive(Default)]
struct Capture {
    bytes: Vec<u8>,
    truncated: bool,
}

async fn capture(mut source: impl tokio::io::AsyncRead + Unpin, limit: usize) -> Capture {
    let mut capture = Capture {
        bytes: Vec::with_capacity(limit.min(4096)),
        truncated: false,
    };
    let mut buffer = [0_u8; 4096];
    loop {
        let count = match source.read(&mut buffer).await {
            Ok(0) | Err(_) => return capture,
            Ok(count) => count,
        };
        let remaining = limit.saturating_sub(capture.bytes.len());
        capture
            .bytes
            .extend_from_slice(&buffer[..count.min(remaining)]);
        capture.truncated |= count > remaining;
    }
}

fn bounded_error(error: &io::Error) -> String {
    error.to_string().chars().take(240).collect()
}

fn action_child_barrier(
    barrier_fd: i32,
    inherited_parent_barrier_fd: i32,
    identity: ActionIdentity,
) -> io::Result<()> {
    if unsafe { libc::close(inherited_parent_barrier_fd) } != 0 {
        return Err(io::Error::last_os_error());
    }
    set_dumpable(false)?;
    mark_open_descriptors_close_on_exec()?;
    if unsafe { libc::setsid() } < 0 {
        return Err(io::Error::last_os_error());
    }
    let pid = unsafe { libc::getpid() } as u32;
    write_all_fd(barrier_fd, &pid.to_ne_bytes())?;
    let mut release = [0_u8; 1];
    read_exact_fd(barrier_fd, &mut release)?;
    if release != [1] {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "action cgroup containment was not established",
        ));
    }
    harden_action_child(identity)
}

fn write_all_fd(fd: i32, mut bytes: &[u8]) -> io::Result<()> {
    while !bytes.is_empty() {
        let count = unsafe { libc::write(fd, bytes.as_ptr().cast(), bytes.len()) };
        if count > 0 {
            bytes = &bytes[count as usize..];
        } else if count < 0 && io::Error::last_os_error().kind() == io::ErrorKind::Interrupted {
            continue;
        } else {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}

fn read_exact_fd(fd: i32, mut bytes: &mut [u8]) -> io::Result<()> {
    while !bytes.is_empty() {
        let count = unsafe { libc::read(fd, bytes.as_mut_ptr().cast(), bytes.len()) };
        if count > 0 {
            let (_, remaining) = bytes.split_at_mut(count as usize);
            bytes = remaining;
        } else if count == 0 {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "containment barrier closed",
            ));
        } else if io::Error::last_os_error().kind() == io::ErrorKind::Interrupted {
            continue;
        } else {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}

fn harden_action_child(identity: ActionIdentity) -> io::Result<()> {
    let group_count = unsafe { libc::getgroups(0, std::ptr::null_mut()) };
    if group_count < 0 {
        return Err(io::Error::last_os_error());
    }
    if group_count > 0 && unsafe { libc::setgroups(0, std::ptr::null()) } != 0 {
        return Err(io::Error::last_os_error());
    }
    if unsafe { libc::setresgid(identity.gid, identity.gid, identity.gid) } != 0 {
        return Err(io::Error::last_os_error());
    }
    if unsafe { libc::setresuid(identity.uid, identity.uid, identity.uid) } != 0 {
        return Err(io::Error::last_os_error());
    }
    // Credential changes can reset dumpability according to the host's
    // fs.suid_dumpable policy. Set it again under the final identity.
    set_dumpable(false)?;

    clear_capabilities()?;
    if unsafe { libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) } != 0 {
        return Err(io::Error::last_os_error());
    }
    verify_child_contract(identity)
}

fn verify_child_contract(identity: ActionIdentity) -> io::Result<()> {
    let pid = unsafe { libc::getpid() };
    if unsafe { libc::getsid(0) } != pid || unsafe { libc::getpgrp() } != pid {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "action child process-group isolation could not be proven",
        ));
    }
    let mut real_gid = 0;
    let mut effective_gid = 0;
    let mut saved_gid = 0;
    if unsafe { libc::getresgid(&mut real_gid, &mut effective_gid, &mut saved_gid) } != 0 {
        return Err(io::Error::last_os_error());
    }
    if [real_gid, effective_gid, saved_gid] != [identity.gid; 3]
        || effective_gid == identity.control_gid
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "action child retained the local-control primary GID",
        ));
    }
    let mut real_uid = 0;
    let mut effective_uid = 0;
    let mut saved_uid = 0;
    if unsafe { libc::getresuid(&mut real_uid, &mut effective_uid, &mut saved_uid) } != 0 {
        return Err(io::Error::last_os_error());
    }
    if [real_uid, effective_uid, saved_uid] != [identity.uid; 3] {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "action child UID drop could not be proven",
        ));
    }
    if unsafe { libc::getgroups(0, std::ptr::null_mut()) } != 0 {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "action child retained supplementary groups",
        ));
    }
    if unsafe { libc::prctl(libc::PR_GET_NO_NEW_PRIVS, 0, 0, 0, 0) } != 1 {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "action child no_new_privs could not be proven",
        ));
    }
    if unsafe { libc::prctl(libc::PR_GET_DUMPABLE, 0, 0, 0, 0) } != 0 {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "action child remained dumpable",
        ));
    }
    verify_capabilities_cleared()
}

fn mark_open_descriptors_close_on_exec() -> io::Result<()> {
    #[cfg(target_os = "linux")]
    {
        let result = unsafe {
            libc::syscall(
                libc::SYS_close_range,
                3_u32,
                u32::MAX,
                libc::CLOSE_RANGE_CLOEXEC,
            )
        };
        if result == 0 {
            return Ok(());
        }
        let error = io::Error::last_os_error();
        if error.raw_os_error() != Some(libc::ENOSYS) {
            return Err(error);
        }
    }

    let maximum = unsafe { libc::sysconf(libc::_SC_OPEN_MAX) };
    if maximum < 0 {
        return Err(io::Error::last_os_error());
    }
    for fd in 3..maximum.min(i32::MAX as i64) as i32 {
        let flags = unsafe { libc::fcntl(fd, libc::F_GETFD) };
        if flags < 0 {
            if io::Error::last_os_error().raw_os_error() == Some(libc::EBADF) {
                continue;
            }
            return Err(io::Error::last_os_error());
        }
        if unsafe { libc::fcntl(fd, libc::F_SETFD, flags | libc::FD_CLOEXEC) } != 0 {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}

#[repr(C)]
struct CapabilityHeader {
    version: u32,
    pid: i32,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct CapabilityData {
    effective: u32,
    permitted: u32,
    inheritable: u32,
}

const LINUX_CAPABILITY_VERSION_3: u32 = 0x2008_0522;

fn clear_capabilities() -> io::Result<()> {
    if unsafe {
        libc::prctl(
            libc::PR_CAP_AMBIENT,
            libc::PR_CAP_AMBIENT_CLEAR_ALL,
            0,
            0,
            0,
        )
    } != 0
    {
        return Err(io::Error::last_os_error());
    }
    let mut header = CapabilityHeader {
        version: LINUX_CAPABILITY_VERSION_3,
        pid: 0,
    };
    let data = [CapabilityData::default(); 2];
    let result = unsafe {
        libc::syscall(
            libc::SYS_capset,
            &mut header as *mut CapabilityHeader,
            data.as_ptr(),
        )
    };
    if result != 0 {
        return Err(io::Error::last_os_error());
    }
    verify_capabilities_cleared()
}

fn verify_capabilities_cleared() -> io::Result<()> {
    let mut header = CapabilityHeader {
        version: LINUX_CAPABILITY_VERSION_3,
        pid: 0,
    };
    let mut data = [CapabilityData::default(); 2];
    let result = unsafe {
        libc::syscall(
            libc::SYS_capget,
            &mut header as *mut CapabilityHeader,
            data.as_mut_ptr(),
        )
    };
    if result != 0 {
        return Err(io::Error::last_os_error());
    }
    if data
        .iter()
        .any(|set| set.effective != 0 || set.permitted != 0 || set.inheritable != 0)
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "action child retained capabilities",
        ));
    }
    Ok(())
}

pub fn set_parent_non_dumpable() -> io::Result<()> {
    set_dumpable(false)?;
    if unsafe { libc::prctl(libc::PR_GET_DUMPABLE, 0, 0, 0, 0) } == 0 {
        Ok(())
    } else {
        Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "inputd non-dumpable state could not be proven",
        ))
    }
}

fn set_dumpable(enabled: bool) -> io::Result<()> {
    if unsafe { libc::prctl(libc::PR_SET_DUMPABLE, i32::from(enabled), 0, 0, 0) } == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cgroup_sandbox::ActionCgroup;
    use std::{collections::VecDeque, sync::Mutex};

    #[derive(Default)]
    struct RecordingCgroups {
        calls: Mutex<Vec<&'static str>>,
        populated: Mutex<VecDeque<bool>>,
    }

    impl RecordingCgroups {
        fn with_populated(values: impl IntoIterator<Item = bool>) -> Self {
            Self {
                calls: Mutex::new(Vec::new()),
                populated: Mutex::new(values.into_iter().collect()),
            }
        }
    }

    impl ActionCgroupBackend for RecordingCgroups {
        fn create(&self, _action: ActionId) -> io::Result<ActionCgroup> {
            self.calls.lock().unwrap().push("create");
            ActionCgroup::for_backend("test-1")
        }
        fn attach(&self, _cgroup: &ActionCgroup, _pid: u32) -> io::Result<()> {
            self.calls.lock().unwrap().push("attach");
            Ok(())
        }
        fn contains(&self, _cgroup: &ActionCgroup, _pid: u32) -> io::Result<bool> {
            self.calls.lock().unwrap().push("contains");
            Ok(true)
        }
        fn kill(&self, _cgroup: &ActionCgroup) -> io::Result<()> {
            self.calls.lock().unwrap().push("kill");
            Ok(())
        }
        fn populated(&self, _cgroup: &ActionCgroup) -> io::Result<bool> {
            self.calls.lock().unwrap().push("populated");
            Ok(self.populated.lock().unwrap().pop_front().unwrap_or(false))
        }
        fn remove(&self, _cgroup: &ActionCgroup) -> io::Result<()> {
            self.calls.lock().unwrap().push("remove");
            Ok(())
        }
    }

    #[tokio::test]
    async fn successful_child_cleanup_kills_remaining_descendants_then_proves_empty() {
        let backend = Arc::new(RecordingCgroups::with_populated([true, false]));
        let runner = DirectRunner::new(backend.clone());
        let cgroup = ActionCgroup::for_backend("test-1").unwrap();

        runner.cleanup_after_child(&cgroup).await.unwrap();

        assert_eq!(
            *backend.calls.lock().unwrap(),
            ["populated", "kill", "populated", "remove"]
        );
    }

    #[tokio::test]
    async fn containment_failure_kills_and_proves_empty_before_removal() {
        let backend = Arc::new(RecordingCgroups::with_populated([false]));
        let runner = DirectRunner::new(backend.clone());
        let cgroup = ActionCgroup::for_backend("test-1").unwrap();

        assert_eq!(
            runner
                .containment_failure(&cgroup, "attach rejected".into())
                .await,
            ActionOutcome::ContainmentFailed("attach rejected".into())
        );
        assert_eq!(
            *backend.calls.lock().unwrap(),
            ["kill", "populated", "remove"]
        );
    }
}
