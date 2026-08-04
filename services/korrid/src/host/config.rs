use crate::GameIdentity;
use serde::Deserialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};

#[derive(Clone, Debug, Deserialize)]
pub struct HostConfig {
    pub label: String,
    #[serde(default)]
    pub games: Vec<HostGame>,
    #[serde(default)]
    pub environment: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct HostGame {
    pub id: String,
    pub title: String,
    pub command: Vec<String>,
    #[serde(default)]
    pub identity: Option<GameIdentity>,
}

#[derive(Clone, Debug, thiserror::Error)]
#[error("host config {path}: {details}")]
pub struct HostConfigError {
    path: String,
    details: String,
}

impl HostConfig {
    pub fn read(path: &Path) -> Result<Self, HostConfigError> {
        let contents = fs::read_to_string(path).map_err(|error| HostConfigError {
            path: path.display().to_string(),
            details: error.to_string(),
        })?;
        let config: Self = toml::from_str(&contents).map_err(|error| HostConfigError {
            path: path.display().to_string(),
            details: error.to_string(),
        })?;
        let mut game_ids = BTreeSet::new();
        if let Some(duplicate) = config
            .games
            .iter()
            .find(|game| !game_ids.insert(game.id.as_str()))
        {
            return Err(HostConfigError {
                path: path.display().to_string(),
                details: format!("duplicate game id {:?}", duplicate.id),
            });
        }
        Ok(config)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_an_empty_catalog_and_environment() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("host.toml");
        std::fs::write(&path, "label = \"zao\"\n").unwrap();

        let config = HostConfig::read(&path).unwrap();

        assert_eq!(config.label, "zao");
        assert!(config.games.is_empty());
        assert!(config.environment.is_empty());
    }

    #[test]
    fn reads_an_optional_static_game_identity() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("host.toml");
        std::fs::write(
            &path,
            r#"
label = "zao"

[[games]]
id = "neverball"
title = "Neverball"
command = ["neverball"]
identity = { kind = "provider", value = { provider = "@korri:store", ref = "neverball" } }
"#,
        )
        .unwrap();

        let config = HostConfig::read(&path).unwrap();

        assert_eq!(
            config.games[0].identity,
            Some(GameIdentity::Provider(crate::GameProviderIdentity {
                provider: "@korri:store".into(),
                provider_ref: "neverball".into(),
            }))
        );
    }

    #[test]
    fn duplicate_game_ids_are_invalid() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("host.toml");
        std::fs::write(
            &path,
            r#"
label = "zao"

[[games]]
id = "neverball"
title = "First"
command = ["first"]

[[games]]
id = "neverball"
title = "Second"
command = ["second"]
"#,
        )
        .unwrap();

        let error = HostConfig::read(&path).unwrap_err().to_string();

        assert!(error.contains("duplicate game id \"neverball\""));
    }

    #[test]
    fn malformed_config_names_the_file_and_parse_error() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("host.toml");
        std::fs::write(&path, "label = [\n").unwrap();

        let error = HostConfig::read(&path).unwrap_err().to_string();

        assert!(error.contains("host.toml"));
        assert!(error.contains("TOML parse error"));
    }
}
