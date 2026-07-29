//! Upstream client: speaks the legacy korrid Effect-RPC wire over HTTP.
//!
//! Envelope (verified against the working hand-rolled client in
//! KorriShellActivity.korriRpc and legacy rpc schemas):
//!   request  {"_tag":"Request","id":"<bigint-string>","tag":<op>,
//!             "payload":{...},"headers":[]}
//!   response frames array; the frame carrying "exit" resolves the call:
//!   exit._tag == "Success" -> exit.value, otherwise a failure exit.
//!
//! This wire format is scaffolding: it exists so the Android-local brain
//! can orchestrate today's TS daemon on the host. When the host daemon is
//! rewritten, this module is replaced by the Rust-owned treaty.

use serde::Deserialize;
use serde_json::{json, Value};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug)]
pub struct UpstreamConfig {
    pub base_url: String,
}

impl UpstreamConfig {
    pub fn from_env() -> Self {
        Self {
            // Scaffolding default: aka's LAN control URL. Replaced by
            // pairing-derived discovery when the shell owns upstream wiring.
            base_url: std::env::var("KORRID_UPSTREAM_URL")
                .unwrap_or_else(|_| "http://192.168.1.117:3001".into()),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum UpstreamError {
    #[error("upstream unreachable: {0}")]
    Unreachable(String),
    #[error("upstream returned HTTP {0}")]
    Http(u16),
    #[error("upstream wire error: {0}")]
    Wire(String),
    #[error("upstream call failed: {0}")]
    Failure(String),
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpstreamCatalogEntry {
    pub id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub launchable: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpstreamCatalog {
    pub entries: Vec<UpstreamCatalogEntry>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpstreamPrepared {
    pub game_id: String,
    pub session_id: String,
}

#[derive(Clone)]
pub struct UpstreamClient {
    config: UpstreamConfig,
    http: reqwest::Client,
}

impl UpstreamClient {
    pub fn new(config: UpstreamConfig) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .expect("construct reqwest client");
        Self { config, http }
    }

    pub async fn catalog_snapshot(&self) -> Result<UpstreamCatalog, UpstreamError> {
        let value = self
            .call("app.catalog.snapshot", json!({"scope": "self"}))
            .await?;
        serde_json::from_value(value).map_err(|error| UpstreamError::Wire(error.to_string()))
    }

    pub async fn prepare_stream(&self, game_id: &str) -> Result<UpstreamPrepared, UpstreamError> {
        let value = self
            .call("app.server.stream.prepare", json!({"id": game_id}))
            .await?;
        serde_json::from_value(value).map_err(|error| UpstreamError::Wire(error.to_string()))
    }

    async fn call(&self, tag: &str, payload: Value) -> Result<Value, UpstreamError> {
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock after epoch")
            .as_micros()
            .to_string();
        let body = json!({
            "_tag": "Request",
            "id": id,
            "tag": tag,
            "payload": payload,
            "headers": [],
        });
        let response = self
            .http
            .post(format!("{}/api/rpc", self.config.base_url))
            .json(&body)
            .send()
            .await
            .map_err(|error| UpstreamError::Unreachable(error.to_string()))?;
        let status = response.status();
        if !status.is_success() {
            return Err(UpstreamError::Http(status.as_u16()));
        }
        let text = response
            .text()
            .await
            .map_err(|error| UpstreamError::Wire(error.to_string()))?;
        decode_exit_value(&text)
    }
}

/// Extracts the Success exit value from an Effect-RPC response body.
fn decode_exit_value(body: &str) -> Result<Value, UpstreamError> {
    let parsed: Value =
        serde_json::from_str(body).map_err(|error| UpstreamError::Wire(error.to_string()))?;
    let frames: Vec<Value> = match parsed {
        Value::Array(frames) => frames,
        other => vec![other],
    };
    for frame in frames {
        let Some(exit) = frame.get("exit") else {
            continue;
        };
        if exit.get("_tag").and_then(Value::as_str) == Some("Success") {
            return Ok(exit.get("value").cloned().unwrap_or(Value::Null));
        }
        return Err(UpstreamError::Failure(exit.to_string()));
    }
    Err(UpstreamError::Wire("no Exit frame in RPC response".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_a_success_exit_from_a_frame_array() {
        let body = r#"[{"_tag":"Exit","requestId":"1","exit":{"_tag":"Success","value":{"entries":[{"id":"g1","title":"Skate 3","launchable":true}]}}}]"#;
        let value = decode_exit_value(body).expect("success exit");
        let catalog: UpstreamCatalog = serde_json::from_value(value).expect("catalog shape");
        assert_eq!(catalog.entries.len(), 1);
        assert_eq!(catalog.entries[0].title.as_deref(), Some("Skate 3"));
        assert!(catalog.entries[0].launchable);
    }

    #[test]
    fn surfaces_a_failure_exit_as_an_error() {
        let body = r#"[{"exit":{"_tag":"Failure","cause":{"_tag":"Fail"}}}]"#;
        let error = decode_exit_value(body).expect_err("failure exit");
        assert!(matches!(error, UpstreamError::Failure(_)));
    }

    #[test]
    fn rejects_bodies_without_an_exit_frame() {
        let error = decode_exit_value(r#"[{"_tag":"Pong"}]"#).expect_err("no exit frame");
        assert!(matches!(error, UpstreamError::Wire(_)));
    }

    #[test]
    fn tolerates_unknown_upstream_entry_fields() {
        let value = serde_json::json!({
            "entries": [{"id":"g2","itemId":"i2","launchable":false,"releases":[]}],
            "generation": 4,
        });
        let catalog: UpstreamCatalog = serde_json::from_value(value).expect("lenient decode");
        assert_eq!(catalog.entries[0].title, None);
        assert!(!catalog.entries[0].launchable);
    }
}
