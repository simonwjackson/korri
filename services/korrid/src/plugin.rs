//! Declaration-only plugins and their device-local registry.
//!
//! This is the narrow legacy plugin seam exercised by the Android application
//! checkpoint: a plugin identifies itself and contributes provider, system,
//! and launcher records. Plugins still perform no effects; this module only
//! evaluates, validates, normalizes, and announces their declarations.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Deserializer};
use thiserror::Error;

use crate::script;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProviderRecord {
    pub id: String,
    pub title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ProviderContribution {
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    id: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    title: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SystemRecord {
    pub id: String,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    pub title: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct LauncherRecord {
    pub id: String,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    pub plugin: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    pub command: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    pub systems: Option<Vec<String>>,
}

#[derive(Clone, Debug)]
pub struct Plugin {
    id: String,
    title: String,
    description: Option<String>,
    providers: BTreeMap<String, ProviderRecord>,
    systems: BTreeMap<String, SystemRecord>,
    launchers: BTreeMap<String, LauncherRecord>,
}

impl Plugin {
    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn title(&self) -> &str {
        &self.title
    }

    pub fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }
}

#[derive(Clone, Debug)]
pub struct PluginRegistry {
    plugins: BTreeMap<String, Plugin>,
    enabled_plugin_ids: BTreeSet<String>,
    registered_provider_ids: BTreeSet<String>,
    registered_system_ids: BTreeSet<String>,
    registered_launcher_ids: BTreeSet<String>,
    providers: BTreeMap<String, ProviderRecord>,
    systems: BTreeMap<String, SystemRecord>,
    launchers: BTreeMap<String, LauncherRecord>,
}

impl PluginRegistry {
    pub fn new(
        plugins: Vec<Plugin>,
        enabled_plugin_ids: impl IntoIterator<Item = String>,
    ) -> Result<Self, PluginError> {
        let requested_enabled: BTreeSet<String> = enabled_plugin_ids.into_iter().collect();
        let mut by_id = BTreeMap::new();

        for plugin in plugins {
            let plugin_id = plugin.id.clone();
            if by_id.insert(plugin_id.clone(), plugin).is_some() {
                return Err(PluginError::DuplicatePluginId(plugin_id));
            }
        }

        let enabled_plugin_ids = requested_enabled;
        let mut registered_provider_ids = BTreeSet::new();
        let mut registered_system_ids = BTreeSet::new();
        let mut registered_launcher_ids = BTreeSet::new();
        let mut providers = BTreeMap::new();
        let mut systems = BTreeMap::new();
        let mut launchers = BTreeMap::new();

        for plugin in by_id.values() {
            registered_provider_ids
                .extend(plugin.providers.values().map(|record| record.id.clone()));
            registered_system_ids.extend(plugin.systems.values().map(|record| record.id.clone()));
            registered_launcher_ids
                .extend(plugin.launchers.values().map(|record| record.id.clone()));
        }

        for plugin_id in &enabled_plugin_ids {
            let plugin = by_id
                .get(plugin_id)
                .ok_or_else(|| PluginError::UnknownEnabledPlugin(plugin_id.clone()))?;

            for (record_id, record) in &plugin.providers {
                insert_unique(&mut providers, record_id.clone(), record.clone())?;
            }
            for (local_id, record) in &plugin.systems {
                insert_unique(
                    &mut systems,
                    plugin_record_id(plugin_id, local_id),
                    record.clone(),
                )?;
            }
            for (local_id, record) in &plugin.launchers {
                insert_unique(
                    &mut launchers,
                    plugin_record_id(plugin_id, local_id),
                    record.clone(),
                )?;
            }
        }

        Ok(Self {
            plugins: by_id,
            enabled_plugin_ids,
            registered_provider_ids,
            registered_system_ids,
            registered_launcher_ids,
            providers,
            systems,
            launchers,
        })
    }

    pub fn registered_plugin_ids(&self) -> Vec<&str> {
        self.plugins.keys().map(String::as_str).collect()
    }

    pub fn enabled_plugin_ids(&self) -> Vec<&str> {
        self.enabled_plugin_ids.iter().map(String::as_str).collect()
    }

    pub fn owns_registered_provider_id(&self, id: &str) -> bool {
        self.registered_provider_ids.contains(id)
    }

    pub fn owns_registered_system_id(&self, id: &str) -> bool {
        self.registered_system_ids.contains(id)
    }

    pub fn owns_registered_launcher_id(&self, id: &str) -> bool {
        self.registered_launcher_ids.contains(id)
    }

    pub fn providers(&self) -> &BTreeMap<String, ProviderRecord> {
        &self.providers
    }

    pub fn systems(&self) -> &BTreeMap<String, SystemRecord> {
        &self.systems
    }

    pub fn launchers(&self) -> &BTreeMap<String, LauncherRecord> {
        &self.launchers
    }
}

#[derive(Debug, Error)]
pub enum PluginError {
    #[error("plugin evaluation failed: {0}")]
    Evaluation(String),
    #[error("invalid plugin declaration: {0}")]
    InvalidDeclaration(#[from] serde_json::Error),
    #[error("invalid plugin id {0}")]
    InvalidPluginId(String),
    #[error("invalid {kind} contribution {record_id}: {reason}")]
    InvalidContribution {
        kind: &'static str,
        record_id: String,
        reason: String,
    },
    #[error("invalid {kind} contribution key: local ids must not be empty")]
    EmptyContributionId { kind: &'static str },
    #[error("duplicate plugin id {0}")]
    DuplicatePluginId(String),
    #[error("enabled plugin {0} is not registered")]
    UnknownEnabledPlugin(String),
    #[error("duplicate contributed record id {0}")]
    DuplicateContribution(String),
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct PluginDeclaration {
    namespace: String,
    name: String,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    title: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_non_null")]
    description: Option<String>,
    #[serde(default)]
    contributes: PluginContributions,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct PluginContributions {
    #[serde(default)]
    config: PluginConfigContributions,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct PluginConfigContributions {
    #[serde(default)]
    providers: BTreeMap<String, ProviderContribution>,
    #[serde(default)]
    systems: BTreeMap<String, SystemRecord>,
    #[serde(default)]
    launchers: BTreeMap<String, LauncherRecord>,
}

pub fn load_plugin_source(source: &str) -> Result<Plugin, PluginError> {
    let declaration_json = script::eval_plugin_ts(source).map_err(PluginError::Evaluation)?;
    decode_plugin_declaration(&declaration_json)
}

pub fn decode_plugin_declaration(declaration_json: &str) -> Result<Plugin, PluginError> {
    let declaration: PluginDeclaration = serde_json::from_str(declaration_json)?;
    normalize_plugin(declaration)
}

fn normalize_plugin(declaration: PluginDeclaration) -> Result<Plugin, PluginError> {
    let id = format!("{}:{}", declaration.namespace, declaration.name);
    if !is_provider_id(&id) {
        return Err(PluginError::InvalidPluginId(id));
    }

    let title = declaration
        .title
        .unwrap_or_else(|| titleize(&declaration.name));
    let mut providers = BTreeMap::new();

    for (record_id, contribution) in declaration.contributes.config.providers {
        if !is_provider_id(&record_id) {
            return Err(PluginError::InvalidContribution {
                kind: "provider",
                record_id,
                reason: "map key is not a provider id".to_owned(),
            });
        }
        if let Some(contributed_id) = contribution.id {
            if contributed_id != record_id {
                return Err(PluginError::InvalidContribution {
                    kind: "provider",
                    record_id,
                    reason: format!("record id {contributed_id} does not match its map key"),
                });
            }
        }
        providers.insert(
            record_id.clone(),
            ProviderRecord {
                id: record_id,
                title: contribution.title,
            },
        );
    }

    match providers.get_mut(&id) {
        Some(own_provider) => {
            if own_provider.title.is_none() {
                own_provider.title = Some(title.clone());
            }
        }
        None => {
            providers.insert(
                id.clone(),
                ProviderRecord {
                    id: id.clone(),
                    title: Some(title.clone()),
                },
            );
        }
    }

    for (local_id, system) in &declaration.contributes.config.systems {
        if local_id.is_empty() {
            return Err(PluginError::EmptyContributionId { kind: "system" });
        }
        if system.id != *local_id {
            return Err(PluginError::InvalidContribution {
                kind: "system",
                record_id: local_id.clone(),
                reason: format!("record id {} does not match its local key", system.id),
            });
        }
    }

    for (local_id, launcher) in &declaration.contributes.config.launchers {
        if local_id.is_empty() {
            return Err(PluginError::EmptyContributionId { kind: "launcher" });
        }
        let expected_id = plugin_record_id(&id, local_id);
        if launcher.id != expected_id {
            return Err(PluginError::InvalidContribution {
                kind: "launcher",
                record_id: local_id.clone(),
                reason: format!("record id {} must be {expected_id}", launcher.id),
            });
        }
        if let Some(provider_id) = &launcher.plugin {
            if !is_provider_id(provider_id) {
                return Err(PluginError::InvalidPluginId(provider_id.clone()));
            }
        }
        if launcher.command.as_deref() == Some("") {
            return Err(PluginError::EmptyContributionId {
                kind: "launcher command",
            });
        }
    }

    Ok(Plugin {
        id,
        title,
        description: declaration.description,
        providers,
        systems: declaration.contributes.config.systems,
        launchers: declaration.contributes.config.launchers,
    })
}

fn insert_unique<T>(
    records: &mut BTreeMap<String, T>,
    id: String,
    record: T,
) -> Result<(), PluginError> {
    if records.insert(id.clone(), record).is_some() {
        return Err(PluginError::DuplicateContribution(id));
    }
    Ok(())
}

fn plugin_record_id(plugin_id: &str, local_id: &str) -> String {
    format!("{plugin_id}/{local_id}")
}

fn is_provider_id(value: &str) -> bool {
    let Some(without_at) = value.strip_prefix('@') else {
        return false;
    };
    let Some((namespace, name)) = without_at.split_once(':') else {
        return false;
    };
    !namespace.contains(':') && is_provider_segment(namespace) && is_provider_segment(name)
}

fn is_provider_segment(value: &str) -> bool {
    let mut chars = value.chars();
    matches!(chars.next(), Some(first) if first.is_ascii_lowercase() || first.is_ascii_digit())
        && chars.all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '.' | '_' | '-')
        })
}

fn deserialize_optional_non_null<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}

fn titleize(id: &str) -> String {
    id.split(['-', '_', '.'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut characters = part.chars();
            match characters.next() {
                Some(first) => first.to_uppercase().chain(characters).collect(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
