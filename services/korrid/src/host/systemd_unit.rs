use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{Read, Seek},
    os::unix::fs::OpenOptionsExt,
    path::{Path, PathBuf},
    process::{Command, ExitStatus, Output, Stdio},
    thread,
    time::{Duration, Instant},
};

#[cfg(test)]
use std::sync::Mutex;

const UNIT_PREFIX: &str = "korri-game-";
const UNIT_SUFFIX: &str = ".service";
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
    pub(super) fn new(kind: LaunchUnitErrorKind, message: impl Into<String>) -> Self {
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
    pub(super) systemd_run: PathBuf,
    pub(super) systemctl: PathBuf,
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

    pub(super) fn with_timeout(
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

    pub(super) fn unit_name(launch_id: &str) -> Result<String, LaunchUnitError> {
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

    pub(super) fn run(
        &self,
        program: &Path,
        arguments: &[String],
    ) -> Result<Output, LaunchUnitError> {
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

    pub(super) fn launch_arguments(
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

    pub(super) fn stop_arguments(launch_id: &str) -> Result<Vec<String>, LaunchUnitError> {
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

pub(super) fn validate_launch_id(value: &str) -> Result<(), LaunchUnitError> {
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
