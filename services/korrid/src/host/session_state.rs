use crate::{RpcFailure, SessionPrepared};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

#[cfg(test)]
use super::identity::{IDENTITY_FILE, TEMP_IDENTITY_PREFIX};
#[cfg(test)]
use std::fs;

use super::identity::{
    clear_crash_temporary_identity, clear_identity, persist_identity, read_identity,
};
use super::systemd_unit::{LaunchUnitBackend, LaunchUnitState};
#[cfg(test)]
use super::systemd_unit::{LaunchUnitError, LaunchUnitErrorKind, SystemdLaunchUnitBackend};

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
    use std::{
        os::unix::fs::PermissionsExt,
        sync::Condvar,
        thread,
        time::{Duration, Instant},
    };

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
            "--property=InaccessiblePaths=/var/lib/korrid /run/korrid /run/korrid-control/control.sock /run/korrid-control /dev/uinput /dev/inputplumber/sources".into(),
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
    fn systemd_game_units_hide_configured_recovery_and_control_paths() {
        let backend = SystemdLaunchUnitBackend::with_protected_paths(
            PathBuf::from("/nix/store/systemd/bin/systemd-run"),
            PathBuf::from("/nix/store/systemd/bin/systemctl"),
            1001,
            1002,
            PathBuf::from("/srv/korri-test/private-recovery"),
            PathBuf::from("/run/korri-test/control/device.sock"),
            PathBuf::from("/run/korri-test/control"),
        )
        .unwrap();
        let launch = backend
            .launch_arguments(
                "0123456789abcdef0123456789abcdef",
                &["/games/retroarch".into()],
                &BTreeMap::new(),
            )
            .unwrap();
        assert!(launch.contains(
            &"--property=InaccessiblePaths=/srv/korri-test/private-recovery /run/korrid /run/korri-test/control/device.sock /run/korri-test/control /dev/uinput /dev/inputplumber/sources".into()
        ));
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
        assert!(SystemdLaunchUnitBackend::with_protected_paths(
            PathBuf::from("/bin/systemd-run"),
            PathBuf::from("/bin/systemctl"),
            1000,
            1000,
            PathBuf::from("relative/recovery"),
            PathBuf::from("/run/control.sock"),
            PathBuf::from("/run"),
        )
        .is_err());
        assert!(SystemdLaunchUnitBackend::with_protected_paths(
            PathBuf::from("/bin/systemd-run"),
            PathBuf::from("/bin/systemctl"),
            1000,
            1000,
            PathBuf::from("/private/recovery"),
            PathBuf::from("/run/other/control.sock"),
            PathBuf::from("/run/control"),
        )
        .is_err());
        assert!(SystemdLaunchUnitBackend::with_protected_paths(
            PathBuf::from("/bin/systemd-run"),
            PathBuf::from("/bin/systemctl"),
            1000,
            1000,
            PathBuf::from("/private/../recovery"),
            PathBuf::from("/run/control/device.sock"),
            PathBuf::from("/run/control"),
        )
        .is_err());
    }

    #[test]
    fn noisy_systemd_helper_is_killed_reaped_and_returns_tagged_output_limit() {
        let root = tempfile::tempdir().unwrap();
        let helper = root.path().join("systemd-helper");
        let pid_file = root.path().join("helper.pid");
        fs::write(
            &helper,
            format!(
                "#!/bin/sh\nprintf '%s' \"$$\" > {}\nexec yes noisy\n",
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
            Duration::from_secs(2),
        )
        .unwrap();

        let started = Instant::now();
        let error = backend
            .run(&backend.systemctl, &["ignored".into()])
            .unwrap_err();

        assert_eq!(error.kind, LaunchUnitErrorKind::OutputLimit);
        assert!(error.message.contains("65536 bytes"));
        assert!(started.elapsed() < Duration::from_secs(2));
        let pid: i32 = fs::read_to_string(pid_file).unwrap().parse().unwrap();
        assert_eq!(unsafe { libc::kill(pid, 0) }, -1);
        assert_eq!(
            std::io::Error::last_os_error().raw_os_error(),
            Some(libc::ESRCH)
        );
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
