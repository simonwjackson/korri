//! Narrow, conflict-safe writes to Korri's fixed `config.yaml`.
//!
//! Settings never serialise a `ConfigSnapshot`: that would drop schema content
//! this slice can read but does not execute. Instead we edit the YAML value,
//! validate the complete candidate beside the current `library.yaml`, and only
//! then atomically replace the fixed file. The revision is the hash of the bytes
//! the user actually edited, so a file-manager change between read and save is
//! rejected rather than silently overwritten.

use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use serde_yaml::{Mapping, Value};

use super::{
    classify_snapshot_support, decode_config_pair,
    snapshot::{CONFIG_FILE_NAME, LIBRARY_FILE_NAME},
};
use crate::plugin_policy;

pub const DEVICE_NAME_SETTING_ID: &str = "device-name";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReadableSettings {
    pub revision: String,
    pub device_name: Option<String>,
    pub plugins: Vec<ReadablePluginSetting>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReadablePluginSetting {
    pub id: String,
    pub title: String,
    pub enabled: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SettingChange {
    DeviceName(String),
    PluginEnabled { id: String, enabled: bool },
}

#[derive(Debug, thiserror::Error)]
pub enum SettingsError {
    #[error("settings changed outside Korri; reload and try again")]
    Conflict,
    #[error("invalid setting: {0}")]
    Invalid(String),
    #[error("settings storage: {0}")]
    Storage(String),
    #[error("settings candidate: {0}")]
    Candidate(String),
}

pub fn read(root: &Path) -> Result<ReadableSettings, SettingsError> {
    ensure_fixed_files(root)?;
    let config = read_fixed(root, CONFIG_FILE_NAME)?;
    let library = read_fixed(root, LIBRARY_FILE_NAME)?;
    let snapshot = decode_config_pair(&config, &library)
        .map_err(|error| SettingsError::Candidate(error.to_string()))?;
    // Existing unsupported content is still reported rather than presenting a
    // settings page that would be unable to save it safely.
    classify_snapshot_support(&snapshot)
        .map_err(|error| SettingsError::Candidate(error.to_string()))?;

    let enabled = plugin_policy::enabled_plugin_ids_for_snapshot(&snapshot)
        .map_err(|error| SettingsError::Candidate(error.to_string()))?;
    let plugins = plugin_policy::bundled_plugins()
        .map_err(|error| SettingsError::Candidate(error.to_string()))?
        .into_iter()
        .map(|plugin| ReadablePluginSetting {
            enabled: enabled.iter().any(|id| id == plugin.id()),
            id: plugin.id().to_owned(),
            title: plugin.title().to_owned(),
        })
        .collect();

    Ok(ReadableSettings {
        revision: revision(&config),
        device_name: snapshot.host.and_then(|host| host.title),
        plugins,
    })
}

pub fn update(
    root: &Path,
    expected_revision: &str,
    change: SettingChange,
) -> Result<ReadableSettings, SettingsError> {
    let config = read_fixed(root, CONFIG_FILE_NAME)?;
    if revision(&config) != expected_revision {
        return Err(SettingsError::Conflict);
    }
    let library = read_fixed(root, LIBRARY_FILE_NAME)?;
    let mut document = parse_mapping(&config)?;

    match change {
        SettingChange::DeviceName(value) => set_device_name(&mut document, value)?,
        SettingChange::PluginEnabled { id, enabled } => {
            set_plugin_enabled(&mut document, id, enabled)?
        }
    }

    let candidate = serde_yaml::to_string(&Value::Mapping(document))
        .map_err(|error| SettingsError::Candidate(error.to_string()))?;
    let snapshot = decode_config_pair(&candidate, &library)
        .map_err(|error| SettingsError::Candidate(error.to_string()))?;
    classify_snapshot_support(&snapshot)
        .map_err(|error| SettingsError::Candidate(error.to_string()))?;
    plugin_policy::enabled_plugin_ids_for_snapshot(&snapshot)
        .map_err(|error| SettingsError::Candidate(error.to_string()))?;

    write_atomically(
        &root.join(CONFIG_FILE_NAME),
        candidate.as_bytes(),
        expected_revision,
    )?;
    read(root)
}

fn set_device_name(document: &mut Mapping, value: String) -> Result<(), SettingsError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(SettingsError::Invalid("device name cannot be empty".into()));
    }
    if value.chars().count() > 64 {
        return Err(SettingsError::Invalid(
            "device name must be 64 characters or fewer".into(),
        ));
    }
    let host = mapping_at(document, "host")?;
    host.insert(Value::String("title".into()), Value::String(value.into()));
    Ok(())
}

fn set_plugin_enabled(
    document: &mut Mapping,
    id: String,
    enabled: bool,
) -> Result<(), SettingsError> {
    let known = plugin_policy::bundled_plugins()
        .map_err(|error| SettingsError::Candidate(error.to_string()))?
        .into_iter()
        .any(|plugin| plugin.id() == id);
    if !known {
        return Err(SettingsError::Invalid(format!("unknown plugin {id}")));
    }
    let host = mapping_at(document, "host")?;
    let plugin = mapping_at(host, "plugin")?;
    plugin.insert(Value::String(id), Value::Bool(enabled));
    Ok(())
}

fn mapping_at<'a>(parent: &'a mut Mapping, key: &str) -> Result<&'a mut Mapping, SettingsError> {
    let key = Value::String(key.into());
    if !parent.contains_key(&key) {
        parent.insert(key.clone(), Value::Mapping(Mapping::new()));
    }
    parent
        .get_mut(&key)
        .and_then(Value::as_mapping_mut)
        .ok_or_else(|| SettingsError::Invalid(format!("{key:?} must be a record")))
}

fn parse_mapping(config: &str) -> Result<Mapping, SettingsError> {
    let value: Value = serde_yaml::from_str(config)
        .map_err(|error| SettingsError::Candidate(error.to_string()))?;
    match value {
        Value::Null => Ok(Mapping::new()),
        Value::Mapping(mapping) => Ok(mapping),
        _ => Err(SettingsError::Invalid(
            "config.yaml must contain a record".into(),
        )),
    }
}

fn ensure_fixed_files(root: &Path) -> Result<(), SettingsError> {
    fs::create_dir_all(root).map_err(|error| SettingsError::Storage(error.to_string()))?;
    for name in [CONFIG_FILE_NAME, LIBRARY_FILE_NAME] {
        let path = root.join(name);
        if path.exists() {
            continue;
        }
        match OpenOptions::new().write(true).create_new(true).open(path) {
            Ok(mut file) => file
                .write_all(b"{}\n")
                .map_err(|error| SettingsError::Storage(error.to_string()))?,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(SettingsError::Storage(error.to_string())),
        }
    }
    Ok(())
}

fn read_fixed(root: &Path, name: &str) -> Result<String, SettingsError> {
    fs::read_to_string(root.join(name)).map_err(|error| SettingsError::Storage(error.to_string()))
}

fn revision(content: &str) -> String {
    hex::encode(Sha256::digest(content.as_bytes()))
}

fn write_atomically(
    path: &Path,
    content: &[u8],
    expected_revision: &str,
) -> Result<(), SettingsError> {
    let parent = path
        .parent()
        .ok_or_else(|| SettingsError::Storage("config file has no parent".into()))?;
    let temporary: PathBuf = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("config"),
        hex::encode(rand::random::<[u8; 8]>())
    ));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| SettingsError::Storage(error.to_string()))?;
        file.write_all(content)
            .map_err(|error| SettingsError::Storage(error.to_string()))?;
        file.sync_all()
            .map_err(|error| SettingsError::Storage(error.to_string()))?;

        // Validation may take long enough for a file manager or sync tool to
        // replace config.yaml. Gate the rename on the bytes that are present
        // immediately before replacement, not only those read at update start.
        let current =
            fs::read_to_string(path).map_err(|error| SettingsError::Storage(error.to_string()))?;
        if revision(&current) != expected_revision {
            return Err(SettingsError::Conflict);
        }

        fs::rename(&temporary, path).map_err(|error| SettingsError::Storage(error.to_string()))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root(config: &str) -> tempfile::TempDir {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join(CONFIG_FILE_NAME), config).unwrap();
        fs::write(root.path().join(LIBRARY_FILE_NAME), "{}\n").unwrap();
        root
    }

    #[test]
    fn first_read_creates_only_the_two_fixed_empty_documents() {
        let root = tempfile::tempdir().unwrap();

        let settings = read(root.path()).unwrap();

        assert_eq!(settings.device_name, None);
        assert_eq!(
            fs::read(root.path().join(CONFIG_FILE_NAME)).unwrap(),
            b"{}\n"
        );
        assert_eq!(
            fs::read(root.path().join(LIBRARY_FILE_NAME)).unwrap(),
            b"{}\n"
        );
    }

    #[test]
    fn changes_the_name_without_dropping_other_sections() {
        let root = root("host:\n  title: old\nproviders: {}\n");
        let before = read(root.path()).unwrap();

        let after = update(
            root.path(),
            &before.revision,
            SettingChange::DeviceName("  usu  ".into()),
        )
        .unwrap();

        assert_eq!(after.device_name.as_deref(), Some("usu"));
        let saved = fs::read_to_string(root.path().join(CONFIG_FILE_NAME)).unwrap();
        assert!(saved.contains("providers: {}"));
    }

    #[test]
    fn plugin_choice_changes_effective_policy() {
        let root = root("{}\n");
        let before = read(root.path()).unwrap();
        assert!(before.plugins.iter().all(|plugin| plugin.enabled));

        let after = update(
            root.path(),
            &before.revision,
            SettingChange::PluginEnabled {
                id: plugin_policy::MGBA_PLUGIN_ID.into(),
                enabled: false,
            },
        )
        .unwrap();

        assert!(
            !after
                .plugins
                .iter()
                .find(|plugin| plugin.id == plugin_policy::MGBA_PLUGIN_ID)
                .unwrap()
                .enabled
        );
    }

    #[test]
    fn rejects_an_external_edit_instead_of_overwriting_it() {
        let root = root("host:\n  title: first\n");
        let before = read(root.path()).unwrap();
        fs::write(
            root.path().join(CONFIG_FILE_NAME),
            "host:\n  title: outside\n",
        )
        .unwrap();

        let error = update(
            root.path(),
            &before.revision,
            SettingChange::DeviceName("inside".into()),
        )
        .unwrap_err();

        assert!(matches!(error, SettingsError::Conflict));
        assert!(fs::read_to_string(root.path().join(CONFIG_FILE_NAME))
            .unwrap()
            .contains("outside"));
    }

    #[test]
    fn rechecks_external_edits_at_the_final_rename_gate() {
        let root = root("host:\n  title: first\n");
        let path = root.path().join(CONFIG_FILE_NAME);
        let expected_revision = revision(&fs::read_to_string(&path).unwrap());
        fs::write(&path, "host:\n  title: changed-during-validation\n").unwrap();

        let error = write_atomically(
            &path,
            b"host:\n  title: settings-write\n",
            &expected_revision,
        )
        .unwrap_err();

        assert!(matches!(error, SettingsError::Conflict));
        assert!(fs::read_to_string(path)
            .unwrap()
            .contains("changed-during-validation"));
    }

    #[test]
    fn rejects_unknown_plugins_without_touching_the_file() {
        let root = root("{}\n");
        let before = read(root.path()).unwrap();
        let original = fs::read(root.path().join(CONFIG_FILE_NAME)).unwrap();

        let error = update(
            root.path(),
            &before.revision,
            SettingChange::PluginEnabled {
                id: "@someone:surprise".into(),
                enabled: false,
            },
        )
        .unwrap_err();

        assert!(matches!(error, SettingsError::Invalid(_)));
        assert_eq!(
            fs::read(root.path().join(CONFIG_FILE_NAME)).unwrap(),
            original
        );
    }
}
