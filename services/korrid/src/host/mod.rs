mod config;
mod prepare;

use crate::{CatalogSnapshot, Game, RpcFailure, SessionPrepared};
use config::{HostConfig, HostConfigError};
use prepare::HostLauncher;
use std::path::Path;

#[derive(Clone)]
pub struct HostRuntime {
    config: Result<HostConfig, HostConfigError>,
    launcher: Option<HostLauncher>,
}

impl HostRuntime {
    pub fn from_path(path: &Path) -> Self {
        let config = HostConfig::read(path);
        let launcher = config.as_ref().ok().map(HostLauncher::new);
        Self { config, launcher }
    }

    pub fn catalog_snapshot(&self) -> Result<CatalogSnapshot, RpcFailure> {
        let config = self.config.as_ref().map_err(config_failure)?;
        Ok(CatalogSnapshot {
            games: config
                .games
                .iter()
                .map(|game| Game {
                    id: game.id.clone(),
                    title: game.title.clone(),
                    host: Some(config.label.clone()),
                })
                .collect(),
            failures: None,
        })
    }

    pub fn prepare(&self, game_id: &str) -> Result<SessionPrepared, RpcFailure> {
        let launcher = self.launcher.as_ref().ok_or_else(|| {
            config_failure(self.config.as_ref().expect_err("invalid host config"))
        })?;
        launcher.prepare(game_id)
    }
}

fn config_failure(error: &HostConfigError) -> RpcFailure {
    RpcFailure {
        code: "HostConfigInvalid".into(),
        message: error.to_string(),
    }
}
