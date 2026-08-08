use crate::{RpcFailure, SessionPrepared};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{Read, Seek, Write},
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
    process::{Command, ExitStatus, Output, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

const UNIT_PREFIX: &str = "korri-game-";
const UNIT_SUFFIX: &str = ".service";
const IDENTITY_FILE: &str = "launch-id";
const TEMP_IDENTITY_PREFIX: &str = ".launch-id-";
const DEFAULT_HELPER_TIMEOUT: Duration = Duration::from_secs(10);
const HELPER_POLL_INTERVAL: Duration = Duration::from_millis(5);
const MAX_HELPER_OUTPUT_BYTES: u64 = 64 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LaunchUnitState {
    Running,
    Stopping,
    Completed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LaunchUnitErrorKind {
    InvalidConfiguration,
    Spawn,
    Timeout,
    Failed,
    Protocol,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LaunchUnitError {
    pub kind: LaunchUnitErrorKind,
    pub message: String,
}

impl LaunchUnitError {
    fn new(kind: LaunchUnitErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

pub trait LaunchUnitBackend: Send + Sync {
    fn launch(
        &self,
        launch_id: &str,
        command: &[String],
        environment: &BTreeMap<String, String>,
    ) -> Result<(), LaunchUnitError>;
    fn state(&self, launch_id: &str) -> Result<LaunchUnitState, LaunchUnitError>;
    fn stop(&self, launch_id: &str) -> Result<(), LaunchUnitError>;
    fn live_launch_ids(&self) -> Result<Vec<String>, LaunchUnitError>;
}

#[derive(Clone, Debug)]
pub struct SystemdLaunchUnitBackend {
    systemd_run: PathBuf,
    systemctl: PathBuf,
    gameplay_uid: u32,
    gameplay_gid: u32,
    helper_timeout: Duration,
}

impl Default for SystemdLaunchUnitBackend {
    fn default() -> Self {
        Self::for_current_process()
    }
}

#[cfg(test)]
#[derive(Default)]
pub(crate) struct InMemoryLaunchUnitBackend {
    units: Mutex<BTreeMap<String, LaunchUnitState>>,
}

#[cfg(test)]
impl LaunchUnitBackend for InMemoryLaunchUnitBackend {
    fn launch(
        &self,
        launch_id: &str,
        _command: &[String],
        _environment: &BTreeMap<String, String>,
    ) -> Result<(), LaunchUnitError> {
        self.units
            .lock()
            .unwrap()
            .insert(launch_id.into(), LaunchUnitState::Running);
        Ok(())
    }

    fn state(&self, launch_id: &str) -> Result<LaunchUnitState, LaunchUnitError> {
        Ok(self
            .units
            .lock()
            .unwrap()
            .get(launch_id)
            .copied()
            .unwrap_or(LaunchUnitState::Completed))
    }

    fn stop(&self, launch_id: &str) -> Result<(), LaunchUnitError> {
        self.units
            .lock()
            .unwrap()
            .insert(launch_id.into(), LaunchUnitState::Completed);
        Ok(())
    }

    fn live_launch_ids(&self) -> Result<Vec<String>, LaunchUnitError> {
        Ok(self
            .units
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, state)| **state != LaunchUnitState::Completed)
            .map(|(id, _)| id.clone())
            .collect())
    }
}

impl SystemdLaunchUnitBackend {
    pub fn new(
        systemd_run: PathBuf,
        systemctl: PathBuf,
        gameplay_uid: u32,
        gameplay_gid: u32,
    ) -> Result<Self, LaunchUnitError> {
        Self::with_timeout(
            systemd_run,
            systemctl,
            gameplay_uid,
            gameplay_gid,
            DEFAULT_HELPER_TIMEOUT,
        )
    }

    fn with_timeout(
        systemd_run: PathBuf,
        systemctl: PathBuf,
        gameplay_uid: u32,
        gameplay_gid: u32,
        helper_timeout: Duration,
    ) -> Result<Self, LaunchUnitError> {
        if !systemd_run.is_absolute() || !systemctl.is_absolute() {
            return Err(LaunchUnitError::new(
                LaunchUnitErrorKind::InvalidConfiguration,
                "systemd helper paths must be absolute",
            ));
        }
        if gameplay_uid == 0 || gameplay_gid == 0 {
            return Err(LaunchUnitError::new(
                LaunchUnitErrorKind::InvalidConfiguration,
                "gameplay UID and GID must both be unprivileged",
            ));
        }
        if helper_timeout.is_zero() {
            return Err(LaunchUnitError::new(
                LaunchUnitErrorKind::InvalidConfiguration,
                "systemd helper timeout must be positive",
            ));
        }
        Ok(Self {
            systemd_run,
            systemctl,
            gameplay_uid,
            gameplay_gid,
            helper_timeout,
        })
    }

    fn for_current_process() -> Self {
        let systemd_run = std::env::var_os("KORRID_SYSTEMD_RUN")
            .map(PathBuf::from)
            .unwrap_or_default();
        let systemctl = std::env::var_os("KORRID_SYSTEMCTL")
            .map(PathBuf::from)
            .unwrap_or_default();
        let gameplay_uid = unsafe { libc::geteuid() };
        let gameplay_gid = unsafe { libc::getegid() };
        Self::new(
            systemd_run.clone(),
            systemctl.clone(),
            gameplay_uid,
            gameplay_gid,
        )
        .unwrap_or(Self {
            systemd_run,
            systemctl,
            gameplay_uid,
            gameplay_gid,
            helper_timeout: DEFAULT_HELPER_TIMEOUT,
        })
    }

    fn validate(&self) -> Result<(), LaunchUnitError> {
        Self::with_timeout(
            self.systemd_run.clone(),
            self.systemctl.clone(),
            self.gameplay_uid,
            self.gameplay_gid,
            self.helper_timeout,
        )
        .map(|_| ())
    }

    fn unit_name(launch_id: &str) -> Result<String, LaunchUnitError> {
        validate_launch_id(launch_id)?;
        Ok(format!("{UNIT_PREFIX}{launch_id}{UNIT_SUFFIX}"))
    }

    fn wait_until_exit(
        child: &mut std::process::Child,
        deadline: Instant,
    ) -> Result<Option<ExitStatus>, std::io::Error> {
        loop {
            if let Some(status) = child.try_wait()? {
                return Ok(Some(status));
            }
            if Instant::now() >= deadline {
                return Ok(None);
            }
            thread::sleep(
                HELPER_POLL_INTERVAL.min(deadline.saturating_duration_since(Instant::now())),
            );
        }
    }

    fn helper_output_file() -> Result<File, LaunchUnitError> {
        let path = std::env::temp_dir().join(format!(
            ".korrid-systemd-helper-{}",
            crate::generate_launch_id()
        ));
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&path)
            .map_err(|error| {
                LaunchUnitError::new(
                    LaunchUnitErrorKind::Spawn,
                    format!("could not create systemd helper output file: {error}"),
                )
            })?;
        fs::remove_file(path).map_err(|error| {
            LaunchUnitError::new(
                LaunchUnitErrorKind::Spawn,
                format!("could not unlink systemd helper output file: {error}"),
            )
        })?;
        Ok(file)
    }

    fn read_helper_output(file: &mut File, name: &str) -> Result<Vec<u8>, LaunchUnitError> {
        file.rewind().map_err(|error| {
            LaunchUnitError::new(
                LaunchUnitErrorKind::Protocol,
                format!("could not rewind {name}: {error}"),
            )
        })?;
        let mut bytes = Vec::new();
        file.take(MAX_HELPER_OUTPUT_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| {
                LaunchUnitError::new(
                    LaunchUnitErrorKind::Protocol,
                    format!("could not read {name}: {error}"),
                )
            })?;
        if bytes.len() as u64 > MAX_HELPER_OUTPUT_BYTES {
            return Err(LaunchUnitError::new(
                LaunchUnitErrorKind::Protocol,
                format!("{name} exceeded {MAX_HELPER_OUTPUT_BYTES} bytes"),
            ));
        }
        Ok(bytes)
    }

    fn run(&self, program: &Path, arguments: &[String]) -> Result<Output, LaunchUnitError> {
        self.validate()?;
        let display = program.display();
        let mut stdout_file = Self::helper_output_file()?;
        let mut stderr_file = Self::helper_output_file()?;
        let child_stdout = stdout_file.try_clone().map_err(|error| {
            LaunchUnitError::new(
                LaunchUnitErrorKind::Spawn,
                format!("could not clone systemd helper stdout: {error}"),
            )
        })?;
        let child_stderr = stderr_file.try_clone().map_err(|error| {
            LaunchUnitError::new(
                LaunchUnitErrorKind::Spawn,
                format!("could not clone systemd helper stderr: {error}"),
            )
        })?;
        let mut child = Command::new(program)
            .args(arguments)
            .stdout(Stdio::from(child_stdout))
            .stderr(Stdio::from(child_stderr))
            .spawn()
            .map_err(|error| {
                LaunchUnitError::new(
                    LaunchUnitErrorKind::Spawn,
                    format!("could not execute {display}: {error}"),
                )
            })?;
        let deadline = Instant::now() + self.helper_timeout;
        let status = match Self::wait_until_exit(&mut child, deadline) {
            Ok(Some(status)) => status,
            Ok(None) => {
                let kill_error = child.kill().err();
                let reap_deadline = Instant::now() + self.helper_timeout;
                match Self::wait_until_exit(&mut child, reap_deadline) {
                    Ok(Some(_)) => {
                        let detail = kill_error
                            .map(|error| format!("; kill reported {error}"))
                            .unwrap_or_default();
                        return Err(LaunchUnitError::new(
                            LaunchUnitErrorKind::Timeout,
                            format!("systemd helper {display} timed out{detail}"),
                        ));
                    }
                    Ok(None) => {
                        return Err(LaunchUnitError::new(
                            LaunchUnitErrorKind::Timeout,
                            format!("systemd helper {display} timed out and could not be reaped"),
                        ));
                    }
                    Err(error) => {
                        return Err(LaunchUnitError::new(
                            LaunchUnitErrorKind::Timeout,
                            format!("systemd helper {display} timed out and reap failed: {error}"),
                        ));
                    }
                }
            }
            Err(error) => {
                let _ = child.kill();
                let _ = Self::wait_until_exit(&mut child, Instant::now() + self.helper_timeout);
                return Err(LaunchUnitError::new(
                    LaunchUnitErrorKind::Protocol,
                    format!("could not wait for systemd helper {display}: {error}"),
                ));
            }
        };
        let stdout = Self::read_helper_output(&mut stdout_file, "systemd helper stdout")?;
        let stderr = Self::read_helper_output(&mut stderr_file, "systemd helper stderr")?;
        Ok(Output {
            status,
            stdout,
            stderr,
        })
    }

    fn launch_arguments(
        &self,
        launch_id: &str,
        configured_command: &[String],
        environment: &BTreeMap<String, String>,
    ) -> Result<Vec<String>, LaunchUnitError> {
        self.validate()?;
        let unit = Self::unit_name(launch_id)?;
        if configured_command.is_empty() {
            return Err(LaunchUnitError::new(
                LaunchUnitErrorKind::InvalidConfiguration,
                "configured command is empty",
            ));
        }
        let mut arguments = vec![
            "--system".into(),
            "--no-ask-password".into(),
            "--quiet".into(),
            "--collect".into(),
            "--service-type=exec".into(),
            format!("--unit={unit}"),
            format!("--uid={}", self.gameplay_uid),
            format!("--gid={}", self.gameplay_gid),
            "--property=KillMode=control-group".into(),
            "--property=NoNewPrivileges=yes".into(),
            "--property=CapabilityBoundingSet=".into(),
            "--property=AmbientCapabilities=".into(),
            "--property=PrivateTmp=yes".into(),
            "--property=ProtectKernelTunables=yes".into(),
            "--property=ProtectKernelModules=yes".into(),
            "--property=ProtectControlGroups=yes".into(),
            "--property=RestrictSUIDSGID=yes".into(),
        ];
        arguments.extend(
            environment
                .iter()
                .map(|(key, value)| format!("--setenv={key}={value}")),
        );
        arguments.push("--".into());
        arguments.extend(configured_command.iter().cloned());
        Ok(arguments)
    }

    fn stop_arguments(launch_id: &str) -> Result<Vec<String>, LaunchUnitError> {
        Ok(vec![
            "--system".into(),
            "--no-ask-password".into(),
            "stop".into(),
            Self::unit_name(launch_id)?,
        ])
    }

    fn require_success(
        &self,
        program: &Path,
        arguments: &[String],
    ) -> Result<Output, LaunchUnitError> {
        let output = self.run(program, arguments)?;
        if output.status.success() {
            Ok(output)
        } else {
            Err(LaunchUnitError::new(
                LaunchUnitErrorKind::Failed,
                format!(
                    "{} failed with {}: {}",
                    program.display(),
                    output.status,
                    String::from_utf8_lossy(&output.stderr).trim()
                ),
            ))
        }
    }
}

impl LaunchUnitBackend for SystemdLaunchUnitBackend {
    fn launch(
        &self,
        launch_id: &str,
        configured_command: &[String],
        environment: &BTreeMap<String, String>,
    ) -> Result<(), LaunchUnitError> {
        let arguments = self.launch_arguments(launch_id, configured_command, environment)?;
        self.require_success(&self.systemd_run, &arguments)
            .map(|_| ())
    }

    fn state(&self, launch_id: &str) -> Result<LaunchUnitState, LaunchUnitError> {
        let unit = Self::unit_name(launch_id)?;
        let output = self.run(
            &self.systemctl,
            &[
                "--system".into(),
                "--no-ask-password".into(),
                "show".into(),
                unit,
                "--property=LoadState".into(),
                "--property=ActiveState".into(),
            ],
        )?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let values: BTreeMap<_, _> = stdout
            .lines()
            .filter_map(|line| line.split_once('='))
            .collect();
        if values.get("LoadState").copied() == Some("not-found") {
            return Ok(LaunchUnitState::Completed);
        }
        if !output.status.success() {
            return Err(LaunchUnitError::new(
                LaunchUnitErrorKind::Failed,
                format!(
                    "systemctl show failed with {}: {}",
                    output.status,
                    String::from_utf8_lossy(&output.stderr).trim()
                ),
            ));
        }
        match values.get("ActiveState").copied() {
            Some("activating" | "active" | "reloading") => Ok(LaunchUnitState::Running),
            Some("deactivating") => Ok(LaunchUnitState::Stopping),
            Some("inactive" | "failed" | "dead") => Ok(LaunchUnitState::Completed),
            Some(other) => Err(LaunchUnitError::new(
                LaunchUnitErrorKind::Protocol,
                format!("unit has unknown ActiveState {other:?}"),
            )),
            None => Err(LaunchUnitError::new(
                LaunchUnitErrorKind::Protocol,
                "systemctl returned no ActiveState",
            )),
        }
    }

    fn stop(&self, launch_id: &str) -> Result<(), LaunchUnitError> {
        let arguments = Self::stop_arguments(launch_id)?;
        self.require_success(&self.systemctl, &arguments)
            .map(|_| ())
    }

    fn live_launch_ids(&self) -> Result<Vec<String>, LaunchUnitError> {
        let output = self.require_success(
            &self.systemctl,
            &[
                "--system".into(),
                "--no-ask-password".into(),
                "list-units".into(),
                format!("{UNIT_PREFIX}*{UNIT_SUFFIX}"),
                "--state=activating,active,reloading,deactivating".into(),
                "--plain".into(),
                "--no-legend".into(),
                "--no-pager".into(),
            ],
        )?;
        let mut ids = Vec::new();
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let Some(unit) = line.split_whitespace().next() else {
                continue;
            };
            let Some(id) = unit
                .strip_prefix(UNIT_PREFIX)
                .and_then(|value| value.strip_suffix(UNIT_SUFFIX))
            else {
                continue;
            };
            validate_launch_id(id)?;
            ids.push(id.to_owned());
        }
        ids.sort();
        ids.dedup();
        Ok(ids)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HostSessionStatus {
    Running { launch_id: String },
    Stopping { launch_id: String },
    Completed { launch_id: String },
    NoActive,
    RecoveryBlocked,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HostSessionStop {
    Completed { launch_id: String },
    NoActive,
    StaleIdentity { active_launch_id: Option<String> },
    AlreadyStopping { launch_id: String },
    RecoveryBlocked,
}

#[derive(Clone, Debug)]
enum ActiveState {
    Running {
        launch_id: String,
        game_id: Option<String>,
    },
    Stopping {
        launch_id: String,
    },
    Completed {
        launch_id: String,
    },
    NoActive,
    RecoveryPending,
    RecoveryBlocked,
}

#[derive(Clone)]
pub struct HostSessionControl {
    backend: Arc<dyn LaunchUnitBackend>,
    identity_root: PathBuf,
    state: Arc<Mutex<ActiveState>>,
}

impl HostSessionControl {
    pub fn new(private_state_root: &Path, backend: Arc<dyn LaunchUnitBackend>) -> Self {
        let identity_root = private_state_root.join("host-session");
        Self {
            backend,
            identity_root,
            state: Arc::new(Mutex::new(ActiveState::RecoveryPending)),
        }
    }

    fn refresh_recovery(&self, state: &mut ActiveState) {
        if matches!(
            state,
            ActiveState::RecoveryPending | ActiveState::RecoveryBlocked
        ) {
            *state = recover(&self.identity_root, self.backend.as_ref());
        }
    }

    pub fn prepare(
        &self,
        game_id: &str,
        configured_command: &[String],
        environment: &BTreeMap<String, String>,
    ) -> Result<SessionPrepared, RpcFailure> {
        let mut state = self.state.lock().expect("host session mutex poisoned");
        self.refresh_recovery(&mut state);
        match &*state {
            ActiveState::Running {
                launch_id,
                game_id: Some(active_game_id),
            } if active_game_id == game_id => {
                return Ok(SessionPrepared {
                    game_id: game_id.into(),
                    launch_id: launch_id.clone(),
                });
            }
            ActiveState::Running { .. } | ActiveState::Stopping { .. } => {
                return Err(failure(
                    "ActiveSessionConflict",
                    "one host game is already running or stopping",
                ));
            }
            ActiveState::RecoveryPending | ActiveState::RecoveryBlocked => {
                return Err(recovery_blocked_failure());
            }
            ActiveState::Completed { .. } | ActiveState::NoActive => {}
        }
        if configured_command.is_empty() {
            return Err(failure(
                "HostLaunchFailed",
                format!("host game {game_id:?} has an empty command"),
            ));
        }

        let launch_id = crate::generate_launch_id();
        persist_identity(&self.identity_root, &launch_id).map_err(|message| {
            *state = ActiveState::RecoveryBlocked;
            failure("HostRecoveryBlocked", message)
        })?;
        if let Err(error) = self
            .backend
            .launch(&launch_id, configured_command, environment)
        {
            match self.backend.live_launch_ids() {
                Ok(live) if !live.iter().any(|id| id == &launch_id) => {
                    if let Err(message) = clear_identity(&self.identity_root) {
                        *state = ActiveState::RecoveryBlocked;
                        return Err(failure("HostRecoveryBlocked", message));
                    }
                    *state = ActiveState::NoActive;
                    return Err(failure("HostLaunchFailed", error.message));
                }
                _ => {
                    *state = ActiveState::RecoveryBlocked;
                    return Err(recovery_blocked_failure());
                }
            }
        }
        match self.backend.state(&launch_id) {
            Ok(LaunchUnitState::Running) => {
                *state = ActiveState::Running {
                    launch_id: launch_id.clone(),
                    game_id: Some(game_id.into()),
                };
                Ok(SessionPrepared {
                    game_id: game_id.into(),
                    launch_id,
                })
            }
            Ok(LaunchUnitState::Stopping | LaunchUnitState::Completed) => {
                if clear_identity(&self.identity_root).is_err() {
                    *state = ActiveState::RecoveryBlocked;
                    return Err(recovery_blocked_failure());
                }
                *state = ActiveState::NoActive;
                Err(failure(
                    "HostLaunchFailed",
                    format!("host game {game_id:?} exited before prepare completed"),
                ))
            }
            Err(_) => {
                *state = ActiveState::RecoveryBlocked;
                Err(recovery_blocked_failure())
            }
        }
    }

    pub fn status(&self) -> HostSessionStatus {
        let mut state = self.state.lock().expect("host session mutex poisoned");
        self.refresh_recovery(&mut state);
        let tracked = match &*state {
            ActiveState::Running { launch_id, .. } | ActiveState::Stopping { launch_id } => {
                Some(launch_id.clone())
            }
            ActiveState::Completed { .. }
            | ActiveState::NoActive
            | ActiveState::RecoveryPending
            | ActiveState::RecoveryBlocked => None,
        };
        if let Some(launch_id) = tracked {
            match self.backend.state(&launch_id) {
                Ok(LaunchUnitState::Running) => {}
                Ok(LaunchUnitState::Stopping) => {
                    *state = ActiveState::Stopping {
                        launch_id: launch_id.clone(),
                    };
                }
                Ok(LaunchUnitState::Completed) => {
                    if clear_identity(&self.identity_root).is_ok() {
                        *state = ActiveState::Completed {
                            launch_id: launch_id.clone(),
                        };
                    } else {
                        *state = ActiveState::RecoveryBlocked;
                    }
                }
                Err(_) => *state = ActiveState::RecoveryBlocked,
            }
        }
        status_from_state(&state)
    }

    pub fn stop(&self, expected_launch_id: &str) -> HostSessionStop {
        let launch_id = {
            let mut state = self.state.lock().expect("host session mutex poisoned");
            self.refresh_recovery(&mut state);
            match &*state {
                ActiveState::Running { launch_id, .. } if launch_id == expected_launch_id => {
                    let launch_id = launch_id.clone();
                    *state = ActiveState::Stopping {
                        launch_id: launch_id.clone(),
                    };
                    launch_id
                }
                ActiveState::Running { launch_id, .. } => {
                    return HostSessionStop::StaleIdentity {
                        active_launch_id: Some(launch_id.clone()),
                    };
                }
                ActiveState::Stopping { launch_id } if launch_id == expected_launch_id => {
                    return HostSessionStop::AlreadyStopping {
                        launch_id: launch_id.clone(),
                    };
                }
                ActiveState::Stopping { launch_id } => {
                    return HostSessionStop::StaleIdentity {
                        active_launch_id: Some(launch_id.clone()),
                    };
                }
                ActiveState::Completed { launch_id } if launch_id == expected_launch_id => {
                    return HostSessionStop::Completed {
                        launch_id: launch_id.clone(),
                    };
                }
                ActiveState::Completed { .. } | ActiveState::NoActive => {
                    return HostSessionStop::NoActive;
                }
                ActiveState::RecoveryPending | ActiveState::RecoveryBlocked => {
                    return HostSessionStop::RecoveryBlocked;
                }
            }
        };

        if self.backend.stop(&launch_id).is_err() {
            let mut state = self.state.lock().expect("host session mutex poisoned");
            if matches!(
                self.backend.state(&launch_id),
                Ok(LaunchUnitState::Completed)
            ) {
                return complete_stop(&self.identity_root, &mut state, launch_id);
            }
            *state = ActiveState::RecoveryBlocked;
            return HostSessionStop::RecoveryBlocked;
        }

        let mut state = self.state.lock().expect("host session mutex poisoned");
        match self.backend.state(&launch_id) {
            Ok(LaunchUnitState::Completed) => {
                complete_stop(&self.identity_root, &mut state, launch_id)
            }
            Ok(LaunchUnitState::Running | LaunchUnitState::Stopping) => {
                HostSessionStop::AlreadyStopping { launch_id }
            }
            Err(_) => {
                *state = ActiveState::RecoveryBlocked;
                HostSessionStop::RecoveryBlocked
            }
        }
    }
}

fn status_from_state(state: &ActiveState) -> HostSessionStatus {
    match state {
        ActiveState::Running { launch_id, .. } => HostSessionStatus::Running {
            launch_id: launch_id.clone(),
        },
        ActiveState::Stopping { launch_id } => HostSessionStatus::Stopping {
            launch_id: launch_id.clone(),
        },
        ActiveState::Completed { launch_id } => HostSessionStatus::Completed {
            launch_id: launch_id.clone(),
        },
        ActiveState::NoActive => HostSessionStatus::NoActive,
        ActiveState::RecoveryPending | ActiveState::RecoveryBlocked => {
            HostSessionStatus::RecoveryBlocked
        }
    }
}

fn complete_stop(
    identity_root: &Path,
    state: &mut ActiveState,
    launch_id: String,
) -> HostSessionStop {
    if clear_identity(identity_root).is_err() {
        *state = ActiveState::RecoveryBlocked;
        HostSessionStop::RecoveryBlocked
    } else {
        *state = ActiveState::Completed {
            launch_id: launch_id.clone(),
        };
        HostSessionStop::Completed { launch_id }
    }
}

fn recover(identity_root: &Path, backend: &dyn LaunchUnitBackend) -> ActiveState {
    let live = match backend.live_launch_ids() {
        Ok(live) => live,
        Err(_) => return ActiveState::RecoveryPending,
    };
    let mut persisted = read_identity(identity_root);
    if persisted.is_err()
        && live.is_empty()
        && clear_crash_temporary_identity(identity_root).unwrap_or(false)
    {
        persisted = read_identity(identity_root);
    }
    match persisted {
        Ok(None) if live.is_empty() => ActiveState::NoActive,
        Ok(Some(persisted)) if live.len() == 1 && live.first() == Some(&persisted) => {
            match backend.state(&persisted) {
                Ok(LaunchUnitState::Running) => ActiveState::Running {
                    launch_id: persisted,
                    game_id: None,
                },
                Ok(LaunchUnitState::Stopping) => ActiveState::Stopping {
                    launch_id: persisted,
                },
                Ok(LaunchUnitState::Completed) if clear_identity(identity_root).is_ok() => {
                    ActiveState::NoActive
                }
                Ok(LaunchUnitState::Completed) => ActiveState::RecoveryBlocked,
                Err(_) => ActiveState::RecoveryPending,
            }
        }
        Ok(Some(persisted)) if live.is_empty() => match backend.state(&persisted) {
            Ok(LaunchUnitState::Completed) if clear_identity(identity_root).is_ok() => {
                ActiveState::NoActive
            }
            Ok(LaunchUnitState::Completed) => ActiveState::RecoveryBlocked,
            Ok(LaunchUnitState::Running | LaunchUnitState::Stopping) => {
                ActiveState::RecoveryBlocked
            }
            Err(_) => ActiveState::RecoveryPending,
        },
        _ => ActiveState::RecoveryBlocked,
    }
}

fn read_identity(root: &Path) -> Result<Option<String>, String> {
    if !root.exists() {
        return Ok(None);
    }
    let metadata = fs::symlink_metadata(root).map_err(|error| error.to_string())?;
    if !metadata.is_dir() || metadata.permissions().mode() & 0o077 != 0 {
        return Err("host recovery state directory is not private".into());
    }
    let entries: Vec<_> = fs::read_dir(root)
        .map_err(|error| error.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|error| error.to_string())?;
    if entries.is_empty() {
        return Ok(None);
    }
    if entries.len() != 1 || entries[0].file_name() != IDENTITY_FILE {
        return Err("host recovery state is ambiguous".into());
    }
    let path = entries[0].path();
    let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.permissions().mode() & 0o077 != 0 {
        return Err("host recovery identity is not a private regular file".into());
    }
    let value = fs::read_to_string(path).map_err(|error| error.to_string())?;
    validate_launch_id(&value).map_err(|error| error.message)?;
    Ok(Some(value))
}

fn persist_identity(root: &Path, launch_id: &str) -> Result<(), String> {
    validate_launch_id(launch_id).map_err(|error| error.message)?;
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    fs::set_permissions(root, fs::Permissions::from_mode(0o700))
        .map_err(|error| error.to_string())?;
    if fs::read_dir(root)
        .map_err(|error| error.to_string())?
        .next()
        .is_some()
    {
        return Err("host recovery state is not empty".into());
    }
    let temporary = root.join(format!(
        "{TEMP_IDENTITY_PREFIX}{}",
        crate::generate_launch_id()
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&temporary)
        .map_err(|error| error.to_string())?;
    file.write_all(launch_id.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|error| error.to_string())?;
    fs::rename(&temporary, root.join(IDENTITY_FILE)).map_err(|error| error.to_string())?;
    File::open(root)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| error.to_string())
}

fn clear_crash_temporary_identity(root: &Path) -> Result<bool, String> {
    if !root.exists() {
        return Ok(false);
    }
    let metadata = fs::symlink_metadata(root).map_err(|error| error.to_string())?;
    if !metadata.is_dir() || metadata.permissions().mode() & 0o077 != 0 {
        return Ok(false);
    }
    let entries: Vec<_> = fs::read_dir(root)
        .map_err(|error| error.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|error| error.to_string())?;
    if entries.is_empty()
        || entries.iter().any(|entry| {
            !entry
                .file_name()
                .to_string_lossy()
                .starts_with(TEMP_IDENTITY_PREFIX)
        })
    {
        return Ok(false);
    }
    if entries.iter().any(|entry| {
        fs::symlink_metadata(entry.path())
            .map(|metadata| !metadata.is_file())
            .unwrap_or(true)
    }) {
        return Ok(false);
    }
    for entry in entries {
        fs::remove_file(entry.path()).map_err(|error| error.to_string())?;
    }
    File::open(root)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| error.to_string())?;
    Ok(true)
}

fn clear_identity(root: &Path) -> Result<(), String> {
    match fs::remove_file(root.join(IDENTITY_FILE)) {
        Ok(()) => File::open(root)
            .and_then(|directory| directory.sync_all())
            .map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn validate_launch_id(value: &str) -> Result<(), LaunchUnitError> {
    if value.len() == 32
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        Ok(())
    } else {
        Err(LaunchUnitError::new(
            LaunchUnitErrorKind::InvalidConfiguration,
            "invalid host launch identity",
        ))
    }
}

fn failure(code: &str, message: impl Into<String>) -> RpcFailure {
    RpcFailure {
        code: code.into(),
        message: message.into(),
    }
}

fn recovery_blocked_failure() -> RpcFailure {
    failure(
        "HostRecoveryBlocked",
        "host recovery identity is missing, tampered, or ambiguous; preserve all game units and require administrator resolution",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{sync::Condvar, thread, time::Duration};

    #[derive(Default)]
    struct BackendState {
        units: BTreeMap<String, LaunchUnitState>,
        stopped: Vec<String>,
        block_stop: bool,
        launch_error_after_start: bool,
        enumeration_unavailable: bool,
        stop_fails_when_collected: bool,
    }

    #[derive(Default)]
    struct DeterministicBackend {
        state: Mutex<BackendState>,
        changed: Condvar,
    }

    impl DeterministicBackend {
        fn insert(&self, id: &str, state: LaunchUnitState) {
            self.state.lock().unwrap().units.insert(id.into(), state);
        }

        fn release_stop(&self) {
            let mut state = self.state.lock().unwrap();
            state.block_stop = false;
            self.changed.notify_all();
        }
    }

    impl LaunchUnitBackend for DeterministicBackend {
        fn launch(
            &self,
            launch_id: &str,
            _command: &[String],
            _environment: &BTreeMap<String, String>,
        ) -> Result<(), LaunchUnitError> {
            self.insert(launch_id, LaunchUnitState::Running);
            if self.state.lock().unwrap().launch_error_after_start {
                Err(LaunchUnitError::new(
                    LaunchUnitErrorKind::Failed,
                    "uncertain launch result",
                ))
            } else {
                Ok(())
            }
        }

        fn state(&self, launch_id: &str) -> Result<LaunchUnitState, LaunchUnitError> {
            Ok(self
                .state
                .lock()
                .unwrap()
                .units
                .get(launch_id)
                .copied()
                .unwrap_or(LaunchUnitState::Completed))
        }

        fn stop(&self, launch_id: &str) -> Result<(), LaunchUnitError> {
            let mut state = self.state.lock().unwrap();
            state.stopped.push(launch_id.into());
            while state.block_stop {
                state = self.changed.wait(state).unwrap();
            }
            if state.stop_fails_when_collected
                && state.units.get(launch_id) == Some(&LaunchUnitState::Completed)
            {
                return Err(LaunchUnitError::new(
                    LaunchUnitErrorKind::Failed,
                    "unit was collected",
                ));
            }
            state
                .units
                .insert(launch_id.into(), LaunchUnitState::Completed);
            Ok(())
        }

        fn live_launch_ids(&self) -> Result<Vec<String>, LaunchUnitError> {
            let state = self.state.lock().unwrap();
            if state.enumeration_unavailable {
                return Err(LaunchUnitError::new(
                    LaunchUnitErrorKind::Failed,
                    "systemd enumeration unavailable",
                ));
            }
            Ok(state
                .units
                .iter()
                .filter(|(_, state)| **state != LaunchUnitState::Completed)
                .map(|(id, _)| id.clone())
                .collect())
        }
    }

    fn control(root: &Path, backend: Arc<DeterministicBackend>) -> HostSessionControl {
        HostSessionControl::new(root, backend)
    }

    fn prepare(control: &HostSessionControl, game: &str) -> SessionPrepared {
        control
            .prepare(game, &["game".into()], &BTreeMap::new())
            .unwrap()
    }

    #[test]
    fn restart_reattaches_only_one_exact_persisted_and_live_unit() {
        let root = tempfile::tempdir().unwrap();
        let backend = Arc::new(DeterministicBackend::default());
        let first = control(root.path(), backend.clone());
        let prepared = prepare(&first, "one");
        drop(first);

        let recovered = control(root.path(), backend);
        assert_eq!(
            recovered.status(),
            HostSessionStatus::Running {
                launch_id: prepared.launch_id
            }
        );
        assert_eq!(
            recovered
                .prepare("two", &["game".into()], &BTreeMap::new())
                .unwrap_err()
                .code,
            "ActiveSessionConflict"
        );
    }

    #[test]
    fn missing_tampered_and_ambiguous_recovery_preserve_units_and_block_mutation() {
        let cases = ["missing", "tampered", "multiple"];
        for case in cases {
            let root = tempfile::tempdir().unwrap();
            let backend = Arc::new(DeterministicBackend::default());
            let a = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
            backend.insert(a, LaunchUnitState::Running);
            if case != "missing" {
                let state = root.path().join("host-session");
                fs::create_dir(&state).unwrap();
                fs::set_permissions(&state, fs::Permissions::from_mode(0o700)).unwrap();
                fs::write(
                    state.join(IDENTITY_FILE),
                    if case == "tampered" { "bad" } else { a },
                )
                .unwrap();
                fs::set_permissions(state.join(IDENTITY_FILE), fs::Permissions::from_mode(0o600))
                    .unwrap();
                if case == "multiple" {
                    fs::write(state.join("other"), a).unwrap();
                }
            }
            let control = control(root.path(), backend.clone());
            assert_eq!(control.status(), HostSessionStatus::RecoveryBlocked);
            assert_eq!(
                control
                    .prepare("two", &["game".into()], &BTreeMap::new())
                    .unwrap_err()
                    .code,
                "HostRecoveryBlocked"
            );
            assert_eq!(control.stop(a), HostSessionStop::RecoveryBlocked);
            assert!(backend.state.lock().unwrap().stopped.is_empty());
            assert_eq!(backend.state(a).unwrap(), LaunchUnitState::Running);
        }
    }

    #[test]
    fn uncertain_launch_result_preserves_and_recovers_the_exact_live_unit() {
        let root = tempfile::tempdir().unwrap();
        let backend = Arc::new(DeterministicBackend::default());
        backend.state.lock().unwrap().launch_error_after_start = true;
        let control = control(root.path(), backend.clone());

        assert_eq!(
            control
                .prepare("one", &["game".into()], &BTreeMap::new())
                .unwrap_err()
                .code,
            "HostRecoveryBlocked"
        );
        assert!(matches!(
            control.status(),
            HostSessionStatus::Running { .. }
        ));
        assert!(backend.state.lock().unwrap().stopped.is_empty());
        assert_eq!(
            backend
                .state
                .lock()
                .unwrap()
                .units
                .values()
                .copied()
                .collect::<Vec<_>>(),
            [LaunchUnitState::Running]
        );
    }

    #[test]
    fn stale_stop_never_targets_a_replacement_launch() {
        let root = tempfile::tempdir().unwrap();
        let backend = Arc::new(DeterministicBackend::default());
        let control = control(root.path(), backend.clone());
        let first = prepare(&control, "one");
        backend.insert(&first.launch_id, LaunchUnitState::Completed);
        assert!(matches!(
            control.status(),
            HostSessionStatus::Completed { .. }
        ));
        let second = prepare(&control, "two");

        assert_eq!(
            control.stop(&first.launch_id),
            HostSessionStop::StaleIdentity {
                active_launch_id: Some(second.launch_id.clone())
            }
        );
        assert!(backend.state.lock().unwrap().stopped.is_empty());
        assert_eq!(
            backend.state(&second.launch_id).unwrap(),
            LaunchUnitState::Running
        );
    }

    #[test]
    fn prepare_and_repeated_stop_are_safe_while_exact_stop_is_in_flight() {
        let root = tempfile::tempdir().unwrap();
        let backend = Arc::new(DeterministicBackend::default());
        let control = control(root.path(), backend.clone());
        let prepared = prepare(&control, "one");
        backend.state.lock().unwrap().block_stop = true;
        let stopping = control.clone();
        let expected = prepared.launch_id.clone();
        let stop_thread = thread::spawn(move || stopping.stop(&expected));
        for _ in 0..50 {
            if matches!(control.status(), HostSessionStatus::Stopping { .. }) {
                break;
            }
            thread::sleep(Duration::from_millis(2));
        }

        assert_eq!(
            control
                .prepare("two", &["game".into()], &BTreeMap::new())
                .unwrap_err()
                .code,
            "ActiveSessionConflict"
        );
        assert_eq!(
            control.stop(&prepared.launch_id),
            HostSessionStop::AlreadyStopping {
                launch_id: prepared.launch_id.clone()
            }
        );
        backend.release_stop();
        assert_eq!(
            stop_thread.join().unwrap(),
            HostSessionStop::Completed {
                launch_id: prepared.launch_id.clone()
            }
        );
        assert_eq!(
            control.stop(&prepared.launch_id),
            HostSessionStop::Completed {
                launch_id: prepared.launch_id
            }
        );
    }

    #[test]
    fn completed_persisted_unit_recovers_inactive_and_clears_only_identity() {
        let root = tempfile::tempdir().unwrap();
        let backend = Arc::new(DeterministicBackend::default());
        let id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        persist_identity(&root.path().join("host-session"), id).unwrap();
        backend.insert(id, LaunchUnitState::Completed);

        let recovered = control(root.path(), backend.clone());

        assert_eq!(recovered.status(), HostSessionStatus::NoActive);
        assert!(!root.path().join("host-session/launch-id").exists());
        assert!(backend.state.lock().unwrap().stopped.is_empty());
    }

    #[test]
    fn exact_stop_collected_completion_race_returns_completed() {
        let root = tempfile::tempdir().unwrap();
        let backend = Arc::new(DeterministicBackend::default());
        let control = control(root.path(), backend.clone());
        let prepared = prepare(&control, "one");
        backend.insert(&prepared.launch_id, LaunchUnitState::Completed);
        backend.state.lock().unwrap().stop_fails_when_collected = true;

        assert_eq!(
            control.stop(&prepared.launch_id),
            HostSessionStop::Completed {
                launch_id: prepared.launch_id
            }
        );
    }

    #[test]
    fn enumeration_unavailability_retries_without_becoming_ambiguity() {
        let root = tempfile::tempdir().unwrap();
        let backend = Arc::new(DeterministicBackend::default());
        backend.state.lock().unwrap().enumeration_unavailable = true;
        let runtime_control = control(root.path(), backend.clone());

        assert_eq!(runtime_control.status(), HostSessionStatus::RecoveryBlocked);
        backend.state.lock().unwrap().enumeration_unavailable = false;
        assert_eq!(runtime_control.status(), HostSessionStatus::NoActive);
        assert!(runtime_control
            .prepare("one", &["game".into()], &BTreeMap::new())
            .is_ok());

        let prepare_root = tempfile::tempdir().unwrap();
        let prepare_backend = Arc::new(DeterministicBackend::default());
        prepare_backend
            .state
            .lock()
            .unwrap()
            .enumeration_unavailable = true;
        let prepare_control = control(prepare_root.path(), prepare_backend.clone());
        assert_eq!(prepare_control.status(), HostSessionStatus::RecoveryBlocked);
        prepare_backend
            .state
            .lock()
            .unwrap()
            .enumeration_unavailable = false;
        assert!(prepare_control
            .prepare("one", &["game".into()], &BTreeMap::new())
            .is_ok());
    }

    #[test]
    fn crash_temporary_identity_is_cleared_only_when_no_game_is_live() {
        let root = tempfile::tempdir().unwrap();
        let backend = Arc::new(DeterministicBackend::default());
        let state_root = root.path().join("host-session");
        fs::create_dir(&state_root).unwrap();
        fs::set_permissions(&state_root, fs::Permissions::from_mode(0o700)).unwrap();
        let temporary = state_root.join(format!("{TEMP_IDENTITY_PREFIX}partial"));
        fs::write(&temporary, "partial").unwrap();

        let recovered = control(root.path(), backend.clone());
        assert_eq!(recovered.status(), HostSessionStatus::NoActive);
        assert!(!temporary.exists());

        let live_root = tempfile::tempdir().unwrap();
        let live_state = live_root.path().join("host-session");
        fs::create_dir(&live_state).unwrap();
        fs::set_permissions(&live_state, fs::Permissions::from_mode(0o700)).unwrap();
        let live_temporary = live_state.join(format!("{TEMP_IDENTITY_PREFIX}partial"));
        fs::write(&live_temporary, "partial").unwrap();
        let id = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        backend.insert(id, LaunchUnitState::Running);

        let blocked = control(live_root.path(), backend);
        assert_eq!(blocked.status(), HostSessionStatus::RecoveryBlocked);
        assert!(live_temporary.exists());
    }

    fn systemd_backend(uid: u32, gid: u32) -> SystemdLaunchUnitBackend {
        SystemdLaunchUnitBackend::new(
            PathBuf::from("/nix/store/systemd/bin/systemd-run"),
            PathBuf::from("/nix/store/systemd/bin/systemctl"),
            uid,
            gid,
        )
        .unwrap()
    }

    #[test]
    fn systemd_operations_use_exact_immutable_helpers_and_hardened_game_credentials() {
        let id = "0123456789abcdef0123456789abcdef";
        let unit = "korri-game-0123456789abcdef0123456789abcdef.service";
        let backend = systemd_backend(1001, 1002);
        assert_eq!(SystemdLaunchUnitBackend::unit_name(id).unwrap(), unit);
        assert_eq!(
            backend.systemd_run,
            PathBuf::from("/nix/store/systemd/bin/systemd-run")
        );
        assert_eq!(
            backend.systemctl,
            PathBuf::from("/nix/store/systemd/bin/systemctl")
        );
        let launch = backend
            .launch_arguments(
                id,
                &["/games/retroarch".into(), "rom.gba".into()],
                &BTreeMap::from([("SAVE_ROOT".into(), "/saves".into())]),
            )
            .unwrap();
        for expected in [
            format!("--unit={unit}"),
            "--uid=1001".into(),
            "--gid=1002".into(),
            "--property=KillMode=control-group".into(),
            "--property=NoNewPrivileges=yes".into(),
            "--property=CapabilityBoundingSet=".into(),
            "--property=AmbientCapabilities=".into(),
            "--property=PrivateTmp=yes".into(),
            "--property=ProtectKernelTunables=yes".into(),
            "--property=ProtectKernelModules=yes".into(),
            "--property=ProtectControlGroups=yes".into(),
            "--property=RestrictSUIDSGID=yes".into(),
        ] {
            assert!(
                launch.contains(&expected),
                "missing {expected:?} from {launch:?}"
            );
        }
        assert_eq!(
            launch[launch.len() - 3..],
            ["--", "/games/retroarch", "rom.gba"]
        );
        assert_eq!(
            SystemdLaunchUnitBackend::stop_arguments(id).unwrap(),
            ["--system", "--no-ask-password", "stop", unit]
        );
        assert!(SystemdLaunchUnitBackend::stop_arguments("game-name").is_err());
    }

    #[test]
    fn systemd_backend_rejects_root_credentials_and_relative_helpers() {
        assert!(matches!(
            SystemdLaunchUnitBackend::new(
                PathBuf::from("systemd-run"),
                PathBuf::from("/bin/systemctl"),
                1000,
                1000,
            ),
            Err(LaunchUnitError {
                kind: LaunchUnitErrorKind::InvalidConfiguration,
                ..
            })
        ));
        assert!(SystemdLaunchUnitBackend::new(
            PathBuf::from("/bin/systemd-run"),
            PathBuf::from("/bin/systemctl"),
            0,
            1000,
        )
        .is_err());
        assert!(SystemdLaunchUnitBackend::new(
            PathBuf::from("/bin/systemd-run"),
            PathBuf::from("/bin/systemctl"),
            1000,
            0,
        )
        .is_err());
    }

    #[test]
    fn hanging_systemd_helper_is_killed_reaped_and_returns_tagged_timeout() {
        let root = tempfile::tempdir().unwrap();
        let helper = root.path().join("systemd-helper");
        let pid_file = root.path().join("helper.pid");
        fs::write(
            &helper,
            format!(
                "#!/bin/sh\nprintf '%s' \"$$\" > {}\nexec sleep 30\n",
                pid_file.display()
            ),
        )
        .unwrap();
        fs::set_permissions(&helper, fs::Permissions::from_mode(0o700)).unwrap();
        let backend = SystemdLaunchUnitBackend::with_timeout(
            helper.clone(),
            helper,
            1000,
            1000,
            Duration::from_millis(30),
        )
        .unwrap();

        let started = Instant::now();
        let error = backend
            .run(&backend.systemctl, &["ignored".into()])
            .unwrap_err();

        assert_eq!(error.kind, LaunchUnitErrorKind::Timeout);
        assert!(started.elapsed() < Duration::from_secs(2));
        let pid: i32 = fs::read_to_string(pid_file).unwrap().parse().unwrap();
        assert_eq!(unsafe { libc::kill(pid, 0) }, -1);
        assert_eq!(
            std::io::Error::last_os_error().raw_os_error(),
            Some(libc::ESRCH)
        );
    }
}
