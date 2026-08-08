mod config;
pub(crate) mod control;
mod prepare;

use crate::{
    config::{
        resolver::{resolve_launchable_routes_for_platform, RoutePlatform},
        snapshot::{ConfigSnapshotCoordinator, SnapshotAuthorization},
    },
    launcher::linux_retroarch,
    plugin_policy, CatalogSnapshot, Game, GameIdentity, RpcFailure, SessionPrepared,
};
use config::{HostConfig, HostConfigError};
#[cfg(test)]
use control::LaunchUnitBackend;
use control::{HostSessionControl, HostSessionStatus, HostSessionStop};
use prepare::HostLauncher;
#[cfg(test)]
use std::sync::Arc;
use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

#[derive(Clone)]
struct DynamicHostGame {
    id: String,
    title: String,
    identity: Option<GameIdentity>,
    command: Vec<String>,
}

#[derive(Clone)]
struct DynamicHostRuntime {
    games: Vec<DynamicHostGame>,
}

impl DynamicHostRuntime {
    fn from_root(root: &Path) -> Result<Self, RpcFailure> {
        Self::from_root_with_env(root, |key| std::env::var_os(key))
    }

    fn from_root_with_env(
        root: &Path,
        lookup: impl Fn(&str) -> Option<OsString> + Copy,
    ) -> Result<Self, RpcFailure> {
        let coordinator = ConfigSnapshotCoordinator::new(root);
        let state = coordinator.reload();
        if state.authorization != SnapshotAuthorization::Authorized {
            return Err(dynamic_failure(
                state
                    .diagnostic
                    .map(|diagnostic| diagnostic.message)
                    .unwrap_or_else(|| "host library is unavailable".into()),
            ));
        }
        if let Some(diagnostic) = state.diagnostic {
            return Err(dynamic_failure(diagnostic.message));
        }
        let registry = plugin_policy::registry_for_snapshot(&state.snapshot)
            .map_err(|error| dynamic_failure(error.to_string()))?;
        let catalog = resolve_launchable_routes_for_platform(
            &state.snapshot,
            &registry,
            std::iter::empty(),
            RoutePlatform::Linux,
        );
        if !catalog.diagnostics.is_empty() {
            return Err(dynamic_failure(
                catalog
                    .diagnostics
                    .into_iter()
                    .map(|diagnostic| diagnostic.message)
                    .collect::<Vec<_>>()
                    .join("; "),
            ));
        }
        let mut games = Vec::new();
        for route in catalog.routes {
            let launch = linux_retroarch::launch_route_with_env(root, &route, lookup)
                .map_err(|error| dynamic_failure(error.to_string()))?;
            games.push(DynamicHostGame {
                id: route.playable_id,
                title: route.title.unwrap_or(route.release_id),
                identity: route.identity,
                command: launch.command,
            });
        }
        Ok(Self { games })
    }
}

#[derive(Clone)]
pub struct HostRuntime {
    config: Result<HostConfig, HostConfigError>,
    launcher: Option<HostLauncher>,
    dynamic: Option<Result<DynamicHostRuntime, RpcFailure>>,
}

impl HostRuntime {
    pub fn from_path(path: &Path) -> Self {
        Self::from_paths(path, None, PathBuf::from("korri-state"))
    }

    pub fn from_paths(
        path: &Path,
        storage_root: Option<PathBuf>,
        private_state_root: PathBuf,
    ) -> Self {
        let config = HostConfig::read(path);
        let launcher = config
            .as_ref()
            .ok()
            .map(|config| HostLauncher::new(config, &private_state_root));
        let dynamic = storage_root.map(|root| DynamicHostRuntime::from_root(&root));
        Self {
            config,
            launcher,
            dynamic,
        }
    }

    #[cfg(test)]
    pub(crate) fn from_paths_with_backend(
        path: &Path,
        storage_root: Option<PathBuf>,
        private_state_root: PathBuf,
        backend: Arc<dyn LaunchUnitBackend>,
    ) -> Self {
        let config = HostConfig::read(path);
        let launcher = config
            .as_ref()
            .ok()
            .map(|config| HostLauncher::with_backend(config, &private_state_root, backend));
        let dynamic = storage_root.map(|root| DynamicHostRuntime::from_root(&root));
        Self {
            config,
            launcher,
            dynamic,
        }
    }

    pub fn catalog_snapshot(&self) -> Result<CatalogSnapshot, RpcFailure> {
        let config = self.config.as_ref().map_err(config_failure)?;
        let mut games: Vec<Game> = config
            .games
            .iter()
            .map(|game| Game {
                id: game.id.clone(),
                title: game.title.clone(),
                host: Some(config.label.clone()),
                identity: game.identity.clone(),
            })
            .collect();
        if let Some(dynamic) = &self.dynamic {
            let dynamic = dynamic.as_ref().map_err(Clone::clone)?;
            for game in &dynamic.games {
                if games.iter().any(|existing| existing.id == game.id) {
                    return Err(dynamic_failure(format!(
                        "game id {:?} is declared by both host.toml and library.yaml",
                        game.id
                    )));
                }
                games.push(Game {
                    id: game.id.clone(),
                    title: game.title.clone(),
                    host: Some(config.label.clone()),
                    identity: game.identity.clone(),
                });
            }
        }
        Ok(CatalogSnapshot {
            games,
            failures: None,
        })
    }

    pub fn prepare(&self, game_id: &str) -> Result<SessionPrepared, RpcFailure> {
        let launcher = self.launcher.as_ref().ok_or_else(|| {
            config_failure(self.config.as_ref().expect_err("invalid host config"))
        })?;
        if let Some(dynamic) = &self.dynamic {
            let dynamic = dynamic.as_ref().map_err(Clone::clone)?;
            if let Some(game) = dynamic.games.iter().find(|game| game.id == game_id) {
                return launcher.prepare_command(game_id, &game.command);
            }
        }
        launcher.prepare(game_id)
    }

    fn control(&self) -> Result<&HostSessionControl, RpcFailure> {
        self.launcher
            .as_ref()
            .map(HostLauncher::control)
            .ok_or_else(|| config_failure(self.config.as_ref().expect_err("invalid host config")))
    }

    pub fn session_status(&self) -> Result<HostSessionStatus, RpcFailure> {
        Ok(self.control()?.status())
    }

    pub fn session_stop(&self, expected_launch_id: &str) -> Result<HostSessionStop, RpcFailure> {
        Ok(self.control()?.stop(expected_launch_id))
    }
}

fn config_failure(error: &HostConfigError) -> RpcFailure {
    RpcFailure {
        code: "HostConfigInvalid".into(),
        message: error.to_string(),
    }
}

fn dynamic_failure(message: impl Into<String>) -> RpcFailure {
    RpcFailure {
        code: "HostLibraryInvalid".into(),
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{collections::HashMap, fs};

    #[test]
    fn linux_host_materializes_wario_from_the_shared_plugins() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("config.yaml"), "{}\n").unwrap();
        fs::write(
            root.path().join("library.yaml"),
            r#"
library:
  wl4:
    title: Wario Land 4
    releases:
      - id: gba
        system: gba
        target: { kind: file, storage: roms, path: wl4.gba }
        identity: { kind: hash, value: "sha256:d16c7bf6e62bb84049fff1b387108fbd1e6e2cd38ca994ab5310dd9cbf9ba414" }
        launch:
          use: "@korri:retroarch/retroarch"
          runtime: "@korri:mgba/mgba"
"#,
        )
        .unwrap();
        fs::create_dir(root.path().join("roms")).unwrap();
        fs::write(root.path().join("roms/wl4.gba"), b"rom").unwrap();
        let executable = root.path().join("bin/retroarch");
        let core = root.path().join("cores/mgba.so");
        fs::create_dir_all(executable.parent().unwrap()).unwrap();
        fs::create_dir_all(core.parent().unwrap()).unwrap();
        fs::write(&executable, b"binary").unwrap();
        fs::write(&core, b"core").unwrap();
        let environment = HashMap::from([
            ("KORRI_RETROARCH_EXECUTABLE", executable.as_os_str()),
            ("KORRI_MGBA_CORE", core.as_os_str()),
        ]);

        let runtime = DynamicHostRuntime::from_root_with_env(root.path(), |key| {
            environment.get(key).map(|value| OsString::from(value))
        })
        .unwrap();

        assert_eq!(runtime.games.len(), 1);
        assert_eq!(runtime.games[0].id, "wl4");
        assert_eq!(
            runtime.games[0].identity,
            Some(GameIdentity::Hash(
                "sha256:d16c7bf6e62bb84049fff1b387108fbd1e6e2cd38ca994ab5310dd9cbf9ba414".into()
            ))
        );
        assert_eq!(
            runtime.games[0].command[0],
            executable.display().to_string()
        );
        assert_eq!(runtime.games[0].command[4], core.display().to_string());
    }
}
