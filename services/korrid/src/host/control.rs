use crate::{RpcFailure, SessionPrepared};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::Write,
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
    process::{Command, Output},
    sync::{Arc, Mutex},
};

const UNIT_PREFIX: &str = "korri-game-";
const UNIT_SUFFIX: &str = ".service";
const IDENTITY_FILE: &str = "launch-id";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LaunchUnitState {
    Running,
    Stopping,
    Completed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LaunchUnitError(pub String);

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

#[derive(Clone, Default)]
pub struct SystemdLaunchUnitBackend;

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
    fn unit_name(launch_id: &str) -> Result<String, LaunchUnitError> {
        validate_launch_id(launch_id)?;
        Ok(format!("{UNIT_PREFIX}{launch_id}{UNIT_SUFFIX}"))
    }

    fn run(program: &str, arguments: &[String]) -> Result<Output, LaunchUnitError> {
        Command::new(program)
            .args(arguments)
            .output()
            .map_err(|error| LaunchUnitError(format!("could not execute {program}: {error}")))
    }

    fn launch_arguments(
        launch_id: &str,
        configured_command: &[String],
        environment: &BTreeMap<String, String>,
    ) -> Result<Vec<String>, LaunchUnitError> {
        let unit = Self::unit_name(launch_id)?;
        if configured_command.is_empty() {
            return Err(LaunchUnitError("configured command is empty".into()));
        }
        let mut arguments = vec![
            "--system".into(),
            "--no-ask-password".into(),
            "--quiet".into(),
            "--collect".into(),
            "--service-type=exec".into(),
            format!("--unit={unit}"),
            "--property=KillMode=control-group".into(),
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

    fn require_success(program: &str, arguments: &[String]) -> Result<Output, LaunchUnitError> {
        let output = Self::run(program, arguments)?;
        if output.status.success() {
            Ok(output)
        } else {
            Err(LaunchUnitError(format!(
                "{program} failed with {}: {}",
                output.status,
                String::from_utf8_lossy(&output.stderr).trim()
            )))
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
        let arguments = Self::launch_arguments(launch_id, configured_command, environment)?;
        Self::require_success("systemd-run", &arguments).map(|_| ())
    }

    fn state(&self, launch_id: &str) -> Result<LaunchUnitState, LaunchUnitError> {
        let unit = Self::unit_name(launch_id)?;
        let output = Self::run(
            "systemctl",
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
            return Err(LaunchUnitError(format!(
                "systemctl show failed with {}: {}",
                output.status,
                String::from_utf8_lossy(&output.stderr).trim()
            )));
        }
        match values.get("ActiveState").copied() {
            Some("activating" | "active" | "reloading") => Ok(LaunchUnitState::Running),
            Some("deactivating") => Ok(LaunchUnitState::Stopping),
            Some("inactive" | "failed" | "dead") => Ok(LaunchUnitState::Completed),
            Some(other) => Err(LaunchUnitError(format!(
                "unit has unknown ActiveState {other:?}"
            ))),
            None => Err(LaunchUnitError("systemctl returned no ActiveState".into())),
        }
    }

    fn stop(&self, launch_id: &str) -> Result<(), LaunchUnitError> {
        let arguments = Self::stop_arguments(launch_id)?;
        Self::require_success("systemctl", &arguments).map(|_| ())
    }

    fn live_launch_ids(&self) -> Result<Vec<String>, LaunchUnitError> {
        let output = Self::require_success(
            "systemctl",
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
        let recovered = recover(&identity_root, backend.as_ref());
        Self {
            backend,
            identity_root,
            state: Arc::new(Mutex::new(recovered)),
        }
    }

    pub fn prepare(
        &self,
        game_id: &str,
        configured_command: &[String],
        environment: &BTreeMap<String, String>,
    ) -> Result<SessionPrepared, RpcFailure> {
        let mut state = self.state.lock().expect("host session mutex poisoned");
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
            ActiveState::RecoveryBlocked => {
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
                    return Err(failure("HostLaunchFailed", error.0));
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
        let tracked = match &*state {
            ActiveState::Running { launch_id, .. } | ActiveState::Stopping { launch_id } => {
                Some(launch_id.clone())
            }
            ActiveState::Completed { .. }
            | ActiveState::NoActive
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
                ActiveState::RecoveryBlocked => return HostSessionStop::RecoveryBlocked,
            }
        };

        if self.backend.stop(&launch_id).is_err() {
            let mut state = self.state.lock().expect("host session mutex poisoned");
            *state = ActiveState::RecoveryBlocked;
            return HostSessionStop::RecoveryBlocked;
        }

        let mut state = self.state.lock().expect("host session mutex poisoned");
        match self.backend.state(&launch_id) {
            Ok(LaunchUnitState::Completed) => {
                if clear_identity(&self.identity_root).is_err() {
                    *state = ActiveState::RecoveryBlocked;
                    HostSessionStop::RecoveryBlocked
                } else {
                    *state = ActiveState::Completed {
                        launch_id: launch_id.clone(),
                    };
                    HostSessionStop::Completed { launch_id }
                }
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
        ActiveState::RecoveryBlocked => HostSessionStatus::RecoveryBlocked,
    }
}

fn recover(identity_root: &Path, backend: &dyn LaunchUnitBackend) -> ActiveState {
    let persisted = read_identity(identity_root);
    let live = backend.live_launch_ids();
    match (persisted, live) {
        (Ok(None), Ok(live)) if live.is_empty() => ActiveState::NoActive,
        (Ok(Some(persisted)), Ok(live)) if live.len() == 1 && live.first() == Some(&persisted) => {
            ActiveState::Running {
                launch_id: persisted,
                game_id: None,
            }
        }
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
    validate_launch_id(&value).map_err(|error| error.0)?;
    Ok(Some(value))
}

fn persist_identity(root: &Path, launch_id: &str) -> Result<(), String> {
    validate_launch_id(launch_id).map_err(|error| error.0)?;
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
    let temporary = root.join(format!(".launch-id-{}", crate::generate_launch_id()));
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
        Err(LaunchUnitError("invalid host launch identity".into()))
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
                Err(LaunchUnitError("uncertain launch result".into()))
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
            state
                .units
                .insert(launch_id.into(), LaunchUnitState::Completed);
            Ok(())
        }

        fn live_launch_ids(&self) -> Result<Vec<String>, LaunchUnitError> {
            Ok(self
                .state
                .lock()
                .unwrap()
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
    fn uncertain_launch_result_preserves_the_live_unit_and_blocks_recovery() {
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
        assert_eq!(control.status(), HostSessionStatus::RecoveryBlocked);
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
    fn systemd_operations_use_only_the_exact_unit_and_its_control_group() {
        let id = "0123456789abcdef0123456789abcdef";
        let unit = "korri-game-0123456789abcdef0123456789abcdef.service";
        assert_eq!(SystemdLaunchUnitBackend::unit_name(id).unwrap(), unit);
        let launch = SystemdLaunchUnitBackend::launch_arguments(
            id,
            &["/games/retroarch".into(), "rom.gba".into()],
            &BTreeMap::from([("SAVE_ROOT".into(), "/saves".into())]),
        )
        .unwrap();
        assert!(launch.contains(&format!("--unit={unit}")));
        assert!(launch.contains(&"--property=KillMode=control-group".into()));
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
}
