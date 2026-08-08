use std::{
    collections::BTreeMap,
    ffi::{OsStr, OsString},
    fmt, io,
    os::unix::ffi::OsStrExt,
    path::{Path, PathBuf},
    process::ExitStatus,
    sync::Arc,
    time::Duration,
};

use tokio::{
    io::AsyncReadExt,
    process::{Child, Command},
    sync::Semaphore,
    task::JoinHandle,
};

const OUTPUT_DRAIN_GRACE: Duration = Duration::from_millis(100);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ActionIdentity {
    pub uid: u32,
    pub gid: u32,
    pub control_gid: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ActionLimits {
    pub max_concurrency: usize,
    pub timeout: Duration,
    pub max_output_bytes: usize,
}

impl Default for ActionLimits {
    fn default() -> Self {
        Self {
            max_concurrency: 2,
            timeout: Duration::from_secs(10),
            max_output_bytes: 8 * 1024,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionCommand {
    executable: PathBuf,
    argv: Vec<OsString>,
    environment: BTreeMap<OsString, OsString>,
}

impl ActionCommand {
    pub fn new(
        executable: impl Into<PathBuf>,
        argv: impl IntoIterator<Item = OsString>,
        environment: BTreeMap<OsString, OsString>,
    ) -> Result<Self, ActionConfigError> {
        let executable = executable.into();
        if !executable.is_absolute() {
            return Err(ActionConfigError::ExecutableNotAbsolute(executable));
        }
        if executable.as_os_str().as_bytes().contains(&0) {
            return Err(ActionConfigError::ExecutableContainsNul);
        }
        for (name, value) in &environment {
            let name = name.as_bytes();
            if name.is_empty() || name.contains(&b'=') || name.contains(&0) {
                return Err(ActionConfigError::InvalidEnvironmentName);
            }
            if value.as_bytes().contains(&0) {
                return Err(ActionConfigError::InvalidEnvironmentValue);
            }
        }
        let argv = argv.into_iter().collect::<Vec<_>>();
        if argv.iter().any(|value| value.as_bytes().contains(&0)) {
            return Err(ActionConfigError::ArgumentContainsNul);
        }
        Ok(Self {
            executable,
            argv,
            environment,
        })
    }

    pub fn executable(&self) -> &Path {
        &self.executable
    }

    pub fn argv(&self) -> &[OsString] {
        &self.argv
    }

    pub fn environment(&self) -> &BTreeMap<OsString, OsString> {
        &self.environment
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ActionConfigError {
    ExecutableNotAbsolute(PathBuf),
    ExecutableContainsNul,
    ArgumentContainsNul,
    InvalidEnvironmentName,
    InvalidEnvironmentValue,
    ZeroConcurrency,
    ZeroTimeout,
    ZeroOutputLimit,
    ControlGroupRetained,
    PrivilegedActionIdentity,
    DestructiveCommandOverride,
    CommandIsNotUtf8,
    CommandIsNotExplicitArgv,
    ExecutableNotImmutable(PathBuf),
}

impl fmt::Display for ActionConfigError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ExecutableNotAbsolute(path) => {
                write!(
                    formatter,
                    "action executable must be absolute: {}",
                    path.display()
                )
            }
            Self::ExecutableContainsNul => formatter.write_str("action executable contains NUL"),
            Self::ArgumentContainsNul => formatter.write_str("action argument contains NUL"),
            Self::InvalidEnvironmentName => {
                formatter.write_str("action environment name is invalid")
            }
            Self::InvalidEnvironmentValue => {
                formatter.write_str("action environment value contains NUL")
            }
            Self::ZeroConcurrency => formatter.write_str("action concurrency must be positive"),
            Self::ZeroTimeout => formatter.write_str("action timeout must be positive"),
            Self::ZeroOutputLimit => formatter.write_str("action output limit must be positive"),
            Self::ControlGroupRetained => {
                formatter.write_str("action GID must differ from inputd's control GID")
            }
            Self::PrivilegedActionIdentity => {
                formatter.write_str("action UID and GID must be unprivileged")
            }
            Self::DestructiveCommandOverride => {
                formatter.write_str("kill-current-game cannot be configured as a command override")
            }
            Self::CommandIsNotUtf8 => formatter.write_str("action command must be UTF-8 JSON"),
            Self::CommandIsNotExplicitArgv => formatter
                .write_str("action command must contain a JSON executable, argv, and environment"),
            Self::ExecutableNotImmutable(path) => write!(
                formatter,
                "configured action executable must be an exact /nix/store path: {}",
                path.display()
            ),
        }
    }
}

impl std::error::Error for ActionConfigError {}

#[derive(Clone, Debug, Default)]
pub struct ActionCommands {
    commands: BTreeMap<String, ActionCommand>,
}

impl ActionCommands {
    pub fn insert(&mut self, id: impl Into<String>, command: ActionCommand) {
        self.commands.insert(id.into(), command);
    }

    pub fn get(&self, id: &str) -> Option<&ActionCommand> {
        self.commands.get(id)
    }
}

#[derive(Clone)]
pub struct ActionDispatcher {
    commands: Arc<ActionCommands>,
    identity: ActionIdentity,
    limits: ActionLimits,
    permits: Arc<Semaphore>,
}

impl ActionDispatcher {
    pub fn new(
        commands: ActionCommands,
        identity: ActionIdentity,
        limits: ActionLimits,
    ) -> Result<Self, ActionConfigError> {
        if limits.max_concurrency == 0 {
            return Err(ActionConfigError::ZeroConcurrency);
        }
        if limits.timeout.is_zero() {
            return Err(ActionConfigError::ZeroTimeout);
        }
        if limits.max_output_bytes == 0 {
            return Err(ActionConfigError::ZeroOutputLimit);
        }
        if identity.uid == 0 || identity.gid == 0 {
            return Err(ActionConfigError::PrivilegedActionIdentity);
        }
        if identity.gid == identity.control_gid {
            return Err(ActionConfigError::ControlGroupRetained);
        }
        Ok(Self {
            commands: Arc::new(commands),
            identity,
            limits,
            permits: Arc::new(Semaphore::new(limits.max_concurrency)),
        })
    }

    pub async fn dispatch(&self, action_id: &str) -> ActionOutcome {
        let Some(command) = self.commands.get(action_id).cloned() else {
            return ActionOutcome::Unconfigured;
        };
        let permit = match self.permits.try_acquire() {
            Ok(permit) => permit,
            Err(tokio::sync::TryAcquireError::NoPermits) => {
                return ActionOutcome::ConcurrencyLimited;
            }
            Err(tokio::sync::TryAcquireError::Closed) => {
                return ActionOutcome::SpawnFailed("action dispatcher closed".into());
            }
        };
        let outcome = execute(command, self.identity, self.limits).await;
        drop(permit);
        outcome
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ActionOutcome {
    Unconfigured,
    ConcurrencyLimited,
    Completed(ActionOutput),
    Failed(ActionOutput),
    TimedOut(ActionOutput),
    SpawnFailed(String),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionOutput {
    pub status: Option<ExitStatus>,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub stdout_truncated: bool,
    pub stderr_truncated: bool,
}

async fn execute(
    configured: ActionCommand,
    identity: ActionIdentity,
    limits: ActionLimits,
) -> ActionOutcome {
    let mut command = Command::new(&configured.executable);
    command
        .args(&configured.argv)
        .env_clear()
        .envs(&configured.environment)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    unsafe {
        command.pre_exec(move || harden_action_child(identity));
    }

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => return ActionOutcome::SpawnFailed(bounded_error(&error)),
    };
    let stdout = child.stdout.take().expect("configured stdout pipe");
    let stderr = child.stderr.take().expect("configured stderr pipe");
    let stdout_task = tokio::spawn(capture(stdout, limits.max_output_bytes));
    let stderr_task = tokio::spawn(capture(stderr, limits.max_output_bytes));

    let (status, timed_out) = wait_bounded(&mut child, limits.timeout).await;
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

async fn wait_bounded(child: &mut Child, limit: Duration) -> (Option<ExitStatus>, bool) {
    match tokio::time::timeout(limit, child.wait()).await {
        Ok(Ok(status)) => (Some(status), false),
        Ok(Err(_)) => (None, false),
        Err(_) => {
            if let Some(pid) = child.id() {
                // The action child creates a fresh session before exec. Kill its
                // process group before reaping so a descendant holding a pipe
                // cannot make timeout handling unbounded.
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGKILL);
                }
            }
            let _ = child.start_kill();
            (child.wait().await.ok(), true)
        }
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

fn harden_action_child(identity: ActionIdentity) -> io::Result<()> {
    set_dumpable(false)?;
    mark_open_descriptors_close_on_exec()?;
    if unsafe { libc::setsid() } < 0 {
        return Err(io::Error::last_os_error());
    }

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

pub const ACTION_IDS: &[&str] = &[
    "system-panel",
    "kill-current-game",
    "volume-up",
    "volume-down",
    "brightness-up",
    "brightness-down",
    "power-suspend",
    "lid-closed",
    "lid-opened",
    "screen-switch",
    "toggle-bottom-screen",
    "toggle-top-screen",
    "workspace-prev",
    "workspace-next",
    "move-output-up",
    "move-output-down",
    "toggle-bottom-keyboard",
    "toggle-steam-visibility",
];

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct ConfiguredAction {
    executable: PathBuf,
    argv: Vec<String>,
    #[serde(default)]
    environment: BTreeMap<String, String>,
}

pub fn commands_from_environment(
    environment: &BTreeMap<OsString, OsString>,
) -> Result<ActionCommands, ActionConfigError> {
    if environment.contains_key(OsStr::new("KORRI_INPUTD_KILL_CURRENT_GAME")) {
        return Err(ActionConfigError::DestructiveCommandOverride);
    }
    let mut commands = ActionCommands::default();
    for action_id in ACTION_IDS {
        if *action_id == "kill-current-game" {
            continue;
        }
        let Some(name) = legacy_environment_name(action_id) else {
            continue;
        };
        let Some(raw) = environment.get(OsStr::new(name)) else {
            continue;
        };
        let raw = raw.to_str().ok_or(ActionConfigError::CommandIsNotUtf8)?;
        let configured: ConfiguredAction =
            serde_json::from_str(raw).map_err(|_| ActionConfigError::CommandIsNotExplicitArgv)?;
        if !configured.executable.starts_with("/nix/store/") {
            return Err(ActionConfigError::ExecutableNotImmutable(
                configured.executable,
            ));
        }
        let command = ActionCommand::new(
            configured.executable,
            configured.argv.into_iter().map(OsString::from),
            configured
                .environment
                .into_iter()
                .map(|(name, value)| (OsString::from(name), OsString::from(value)))
                .collect(),
        )?;
        commands.insert(*action_id, command);
    }
    Ok(commands)
}

pub fn legacy_environment_name(action_id: &str) -> Option<&'static str> {
    match action_id {
        "system-panel" => Some("KORRI_INPUTD_SYSTEM_PANEL"),
        "kill-current-game" => Some("KORRI_INPUTD_KILL_CURRENT_GAME"),
        "volume-up" => Some("KORRI_INPUTD_VOLUME_UP"),
        "volume-down" => Some("KORRI_INPUTD_VOLUME_DOWN"),
        "brightness-up" => Some("KORRI_INPUTD_BRIGHTNESS_UP"),
        "brightness-down" => Some("KORRI_INPUTD_BRIGHTNESS_DOWN"),
        "power-suspend" => Some("KORRI_INPUTD_POWER_SUSPEND"),
        "lid-closed" => Some("KORRI_INPUTD_LID_CLOSED"),
        "lid-opened" => Some("KORRI_INPUTD_LID_OPENED"),
        "screen-switch" => Some("KORRI_INPUTD_SCREEN_SWITCH"),
        "toggle-bottom-screen" => Some("KORRI_INPUTD_TOGGLE_BOTTOM_SCREEN"),
        "toggle-top-screen" => Some("KORRI_INPUTD_TOGGLE_TOP_SCREEN"),
        "workspace-prev" => Some("KORRI_INPUTD_WORKSPACE_PREV"),
        "workspace-next" => Some("KORRI_INPUTD_WORKSPACE_NEXT"),
        "move-output-up" => Some("KORRI_INPUTD_MOVE_OUTPUT_UP"),
        "move-output-down" => Some("KORRI_INPUTD_MOVE_OUTPUT_DOWN"),
        "toggle-bottom-keyboard" => Some("KORRI_INPUTD_BOTTOM_KEYBOARD"),
        "toggle-steam-visibility" => Some("KORRI_INPUTD_TOGGLE_STEAM_VISIBILITY"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncWriteExt;

    #[tokio::test]
    async fn output_capture_drains_the_stream_but_keeps_only_the_limit() {
        let (mut writer, reader) = tokio::io::duplex(16);
        let writing = tokio::spawn(async move {
            writer.write_all(&[b'x'; 128]).await.unwrap();
            writer.shutdown().await.unwrap();
        });

        let captured = capture(reader, 11).await;
        writing.await.unwrap();
        assert_eq!(captured.bytes, vec![b'x'; 11]);
        assert!(captured.truncated);
    }

    #[tokio::test]
    async fn concurrency_limit_rejects_instead_of_queueing_an_action() {
        let uid = unsafe { libc::geteuid() }.max(1);
        let gid = unsafe { libc::getegid() }.max(1);
        let control_gid = if gid == u32::MAX { gid - 1 } else { gid + 1 };
        let mut commands = ActionCommands::default();
        commands.insert(
            "workspace-next",
            ActionCommand::new("/absolute/test-action", [], BTreeMap::new()).unwrap(),
        );
        let dispatcher = ActionDispatcher::new(
            commands,
            ActionIdentity {
                uid,
                gid,
                control_gid,
            },
            ActionLimits {
                max_concurrency: 1,
                ..ActionLimits::default()
            },
        )
        .unwrap();
        let _active = dispatcher.permits.acquire().await.unwrap();

        assert_eq!(
            dispatcher.dispatch("workspace-next").await,
            ActionOutcome::ConcurrencyLimited
        );
    }

    #[tokio::test]
    async fn child_runtime_is_bounded_and_the_timed_out_process_is_reaped() {
        let mut child = Command::new("/run/current-system/sw/bin/sleep")
            .arg("5")
            .spawn()
            .unwrap();

        let (status, timed_out) = wait_bounded(&mut child, Duration::from_millis(10)).await;

        assert!(timed_out);
        assert!(status.is_some());
        assert!(child.try_wait().unwrap().is_some());
    }

    #[test]
    fn parent_dump_protection_is_set_and_proven() {
        set_parent_non_dumpable().unwrap();
        assert_eq!(unsafe { libc::prctl(libc::PR_GET_DUMPABLE, 0, 0, 0, 0) }, 0);
    }
}
