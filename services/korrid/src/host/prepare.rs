use super::{
    config::{HostConfig, HostGame},
    control::{HostSessionControl, LaunchUnitBackend, SystemdLaunchUnitBackend},
};
use crate::{RpcFailure, SessionPrepared};
use std::{collections::HashMap, path::Path, sync::Arc};

#[derive(Clone)]
pub struct HostLauncher {
    games: Arc<HashMap<String, HostGame>>,
    environment: Arc<std::collections::BTreeMap<String, String>>,
    control: HostSessionControl,
}

impl HostLauncher {
    pub fn new(config: &HostConfig, private_state_root: &Path) -> Self {
        Self::with_backend(
            config,
            private_state_root,
            Arc::new(SystemdLaunchUnitBackend),
        )
    }

    pub(crate) fn with_backend(
        config: &HostConfig,
        private_state_root: &Path,
        backend: Arc<dyn LaunchUnitBackend>,
    ) -> Self {
        Self {
            games: Arc::new(
                config
                    .games
                    .iter()
                    .cloned()
                    .map(|game| (game.id.clone(), game))
                    .collect(),
            ),
            environment: Arc::new(config.environment.clone()),
            control: HostSessionControl::new(private_state_root, backend),
        }
    }

    pub fn prepare(&self, game_id: &str) -> Result<SessionPrepared, RpcFailure> {
        let game = self.games.get(game_id).ok_or_else(|| RpcFailure {
            code: "HostGameNotFound".into(),
            message: format!("host game {game_id:?} is not configured"),
        })?;
        self.prepare_command(game_id, &game.command)
    }

    pub fn prepare_command(
        &self,
        game_id: &str,
        configured_command: &[String],
    ) -> Result<SessionPrepared, RpcFailure> {
        self.control
            .prepare(game_id, configured_command, &self.environment)
    }

    pub fn control(&self) -> &HostSessionControl {
        &self.control
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host::{
        config::{HostConfig, HostGame},
        control::{LaunchUnitError, LaunchUnitState},
    };
    use std::{collections::BTreeMap, sync::Mutex};

    #[derive(Default)]
    struct RecordingBackend {
        launches: Mutex<Vec<(String, Vec<String>)>>,
        units: Mutex<BTreeMap<String, LaunchUnitState>>,
    }

    impl LaunchUnitBackend for RecordingBackend {
        fn launch(
            &self,
            launch_id: &str,
            command: &[String],
            _environment: &BTreeMap<String, String>,
        ) -> Result<(), LaunchUnitError> {
            self.launches
                .lock()
                .unwrap()
                .push((launch_id.into(), command.into()));
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

    fn launcher(game: HostGame) -> (tempfile::TempDir, Arc<RecordingBackend>, HostLauncher) {
        let root = tempfile::tempdir().unwrap();
        let backend = Arc::new(RecordingBackend::default());
        let launcher = HostLauncher::with_backend(
            &HostConfig {
                label: "zao".into(),
                games: vec![game],
                environment: BTreeMap::new(),
            },
            root.path(),
            backend.clone(),
        );
        (root, backend, launcher)
    }

    #[test]
    fn prepare_launches_the_configured_command_in_an_owned_unit() {
        let (_root, backend, launcher) = launcher(HostGame {
            id: "neverball".into(),
            title: "Neverball".into(),
            identity: None,
            command: vec!["neverball".into(), "--windowed".into()],
        });

        let prepared = launcher.prepare("neverball").unwrap();

        assert_eq!(prepared.game_id, "neverball");
        let launches = backend.launches.lock().unwrap();
        assert_eq!(launches[0].0, prepared.launch_id);
        assert_eq!(launches[0].1, ["neverball", "--windowed"]);
    }

    #[test]
    fn prepare_rejects_an_unknown_game() {
        let (_root, _backend, launcher) = launcher(HostGame {
            id: "neverball".into(),
            title: "Neverball".into(),
            identity: None,
            command: vec!["neverball".into()],
        });

        assert_eq!(
            launcher.prepare("missing").unwrap_err().code,
            "HostGameNotFound"
        );
    }

    #[test]
    fn prepare_is_idempotent_only_for_the_same_globally_active_game() {
        let (_root, backend, launcher) = launcher(HostGame {
            id: "slow".into(),
            title: "Slow".into(),
            identity: None,
            command: vec!["slow".into()],
        });

        let first = launcher.prepare("slow").unwrap();
        let repeated = launcher.prepare("slow").unwrap();

        assert_eq!(repeated.launch_id, first.launch_id);
        assert_eq!(backend.launches.lock().unwrap().len(), 1);
    }
}
