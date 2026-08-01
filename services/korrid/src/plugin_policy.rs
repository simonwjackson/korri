//! Layered enablement policy for device-local plugins.
//!
//! Registration and enablement stay separate: bundled source registers the
//! plugins available to this korrid build, and semantic policy layers decide
//! which registered plugin ids are enabled. Later layers override earlier ones.

use std::collections::BTreeMap;

use crate::plugin::{load_plugin_source, Plugin, PluginError};

pub const ANDROID_APP_PLUGIN_ID: &str = "@korri:android-app";
pub const ANDROID_APP_PLUGIN_SOURCE: &str = include_str!("../plugins/android-app.plugin.ts");

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PluginPolicyLayer {
    entries: BTreeMap<String, bool>,
}

impl PluginPolicyLayer {
    pub fn from_enabled<'a>(entries: impl IntoIterator<Item = (&'a str, bool)>) -> Self {
        Self {
            entries: entries
                .into_iter()
                .map(|(plugin_id, enabled)| (plugin_id.to_owned(), enabled))
                .collect(),
        }
    }
}

pub fn bundled_plugins() -> Result<Vec<Plugin>, PluginError> {
    Ok(vec![load_plugin_source(ANDROID_APP_PLUGIN_SOURCE)?])
}

pub fn bundled_plugin_policy_layer() -> PluginPolicyLayer {
    PluginPolicyLayer::from_enabled([(ANDROID_APP_PLUGIN_ID, true)])
}

pub fn empty_user_plugin_policy_layer() -> PluginPolicyLayer {
    PluginPolicyLayer::default()
}

pub fn resolve_enabled_plugin_ids(
    layers: impl IntoIterator<Item = PluginPolicyLayer>,
) -> Vec<String> {
    let mut resolved = BTreeMap::new();
    for layer in layers {
        for (plugin_id, enabled) in layer.entries {
            resolved.insert(plugin_id, enabled);
        }
    }

    resolved
        .into_iter()
        .filter_map(|(plugin_id, enabled)| enabled.then_some(plugin_id))
        .collect()
}
