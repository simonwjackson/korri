use super::config::{HostConfig, HostGame};
use crate::{RpcFailure, SessionPrepared};
use std::{
    collections::HashMap,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
};

#[derive(Clone)]
pub struct HostLauncher {
    games: Arc<HashMap<String, HostGame>>,
    environment: Arc<std::collections::BTreeMap<String, String>>,
    running: Arc<Mutex<HashMap<String, String>>>,
}

impl HostLauncher {
    pub fn new(config: &HostConfig) -> Self {
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
            running: Arc::new(Mutex::new(HashMap::new())),
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
        let mut running = self.running.lock().expect("host child mutex poisoned");
        if let Some(launch_id) = running.get(game_id) {
            return Ok(SessionPrepared {
                game_id: game_id.into(),
                launch_id: launch_id.clone(),
            });
        }

        let (program, arguments) = configured_command.split_first().ok_or_else(|| RpcFailure {
            code: "HostLaunchFailed".into(),
            message: format!("host game {game_id:?} has an empty command"),
        })?;
        let mut command = Command::new(program);
        command
            .args(arguments)
            .envs(self.environment.iter())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        let mut child = command.spawn().map_err(|error| RpcFailure {
            code: "HostLaunchFailed".into(),
            message: format!("could not start {program:?} for {game_id:?}: {error}"),
        })?;
        std::thread::sleep(std::time::Duration::from_millis(50));
        if let Some(status) = child.try_wait().map_err(|error| RpcFailure {
            code: "HostLaunchFailed".into(),
            message: format!("could not inspect {game_id:?}: {error}"),
        })? {
            return Err(RpcFailure {
                code: "HostLaunchFailed".into(),
                message: format!("{program:?} for {game_id:?} exited immediately with {status}"),
            });
        }
        let game_id = game_id.to_owned();
        let launch_id = crate::generate_launch_id();
        running.insert(game_id.clone(), launch_id.clone());
        drop(running);
        let running = Arc::clone(&self.running);
        let reaped_game_id = game_id.clone();
        let reaped_launch_id = launch_id.clone();
        std::thread::spawn(move || {
            let _ = child.wait();
            let mut running = running.lock().expect("host child mutex poisoned");
            if running.get(&reaped_game_id) == Some(&reaped_launch_id) {
                running.remove(&reaped_game_id);
            }
        });
        Ok(SessionPrepared { game_id, launch_id })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host::config::{HostConfig, HostGame};
    use std::{collections::BTreeMap, path::Path, time::Duration};

    fn launcher(game: HostGame) -> HostLauncher {
        HostLauncher::new(&HostConfig {
            label: "zao".into(),
            games: vec![game],
            environment: BTreeMap::new(),
        })
    }

    fn wait_for(path: &Path) {
        for _ in 0..50 {
            if path.exists() {
                return;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        panic!("{} was not created", path.display());
    }

    #[test]
    fn prepare_spawns_the_configured_command() {
        let root = tempfile::tempdir().unwrap();
        let marker = root.path().join("launched");
        let launcher = launcher(HostGame {
            id: "neverball".into(),
            title: "Neverball".into(),
            identity: None,
            command: vec![
                "sh".into(),
                "-c".into(),
                format!("printf launched > {}; sleep 1", marker.display()),
            ],
        });

        let prepared = launcher.prepare("neverball").unwrap();

        assert_eq!(prepared.game_id, "neverball");
        wait_for(&marker);
        assert_eq!(std::fs::read_to_string(marker).unwrap(), "launched");
    }

    #[test]
    fn prepare_rejects_an_unknown_game() {
        let launcher = launcher(HostGame {
            id: "neverball".into(),
            title: "Neverball".into(),
            identity: None,
            command: vec!["neverball".into()],
        });

        let error = launcher.prepare("missing").unwrap_err();

        assert_eq!(error.code, "HostGameNotFound");
    }

    #[test]
    fn prepare_reports_a_command_that_cannot_start() {
        let launcher = launcher(HostGame {
            id: "broken".into(),
            title: "Broken".into(),
            identity: None,
            command: vec!["/definitely/not/a/program".into()],
        });

        let error = launcher.prepare("broken").unwrap_err();

        assert_eq!(error.code, "HostLaunchFailed");
        assert!(error.message.contains("/definitely/not/a/program"));
    }

    #[test]
    fn prepare_reports_a_command_that_exits_immediately() {
        let launcher = launcher(HostGame {
            id: "broken".into(),
            title: "Broken".into(),
            identity: None,
            command: vec!["sh".into(), "-c".into(), "exit 0".into()],
        });

        let error = launcher.prepare("broken").unwrap_err();

        assert_eq!(error.code, "HostLaunchFailed");
        assert!(error.message.contains("exit status: 0"));
    }

    #[test]
    fn prepare_preserves_a_running_launch_identity_and_replaces_it_after_exit() {
        let root = tempfile::tempdir().unwrap();
        let starts = root.path().join("starts");
        let exited = root.path().join("exited");
        let launcher = launcher(HostGame {
            id: "slow".into(),
            title: "Slow".into(),
            identity: None,
            command: vec![
                "sh".into(),
                "-c".into(),
                format!(
                    "printf x >> {}; sleep 0.2; printf x >> {}",
                    starts.display(),
                    exited.display()
                ),
            ],
        });

        let first = launcher.prepare("slow").unwrap();
        wait_for(&starts);
        let repeated = launcher.prepare("slow").unwrap();

        assert_eq!(repeated.launch_id, first.launch_id);
        assert_eq!(std::fs::read_to_string(&starts).unwrap(), "x");

        wait_for(&exited);
        let restarted = (0..50)
            .find_map(|_| {
                let prepared = launcher.prepare("slow").unwrap();
                if prepared.launch_id != first.launch_id {
                    Some(prepared)
                } else {
                    std::thread::sleep(Duration::from_millis(10));
                    None
                }
            })
            .expect("exited child was not cleared");

        assert_ne!(restarted.launch_id, first.launch_id);
        assert_eq!(std::fs::read_to_string(starts).unwrap(), "xx");
    }
}
