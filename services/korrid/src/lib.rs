//! Embedded-capable korrid server core: contracts, dispatch, and lifecycle.

use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use std::{
    net::{Ipv4Addr, SocketAddrV4, TcpListener as StdTcpListener},
    sync::{Mutex, OnceLock},
    thread::JoinHandle,
};
use tokio::sync::oneshot;
use typeshare::typeshare;

pub const VERSION: &str = "korrid-v0";

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CatalogSnapshotRequest {}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Game {
    pub id: String,
    pub title: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CatalogSnapshot {
    pub games: Vec<Game>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPrepareRequest {
    pub game_id: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPrepared {
    pub game_id: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SessionStatusRequest {}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveSession {
    pub launch_id: String,
    pub game_id: Option<String>,
    pub title: Option<String>,
    pub phase: Option<String>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SessionStatus {
    pub active: Option<ActiveSession>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SessionStopRequest {
    #[serde(default)]
    pub force: Option<bool>,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionStopPhase {
    Stopped,
    Pending,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SessionStopResult {
    pub phase: SessionStopPhase,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HealthRequest {}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Health {
    pub version: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct RpcFailure {
    pub code: String,
    pub message: String,
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum CatalogSnapshotOutcome {
    Ok(CatalogSnapshot),
    Err(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum SessionPrepareOutcome {
    Ok(SessionPrepared),
    Err(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum SessionStatusOutcome {
    Ok(SessionStatus),
    Err(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum SessionStopOutcome {
    Ok(SessionStopResult),
    Err(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum HealthOutcome {
    Ok(Health),
    Err(RpcFailure),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "payload")]
pub enum RpcRequest {
    #[serde(rename = "app.catalog.snapshot")]
    CatalogSnapshot(CatalogSnapshotRequest),
    #[serde(rename = "app.session.prepare")]
    SessionPrepare(SessionPrepareRequest),
    #[serde(rename = "app.session.status")]
    SessionStatus(SessionStatusRequest),
    #[serde(rename = "app.session.stop")]
    SessionStop(SessionStopRequest),
    #[serde(rename = "system.health")]
    Health(HealthRequest),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "outcome")]
pub enum RpcResponse {
    #[serde(rename = "app.catalog.snapshot")]
    CatalogSnapshot(CatalogSnapshotOutcome),
    #[serde(rename = "app.session.prepare")]
    SessionPrepare(SessionPrepareOutcome),
    #[serde(rename = "app.session.status")]
    SessionStatus(SessionStatusOutcome),
    #[serde(rename = "app.session.stop")]
    SessionStop(SessionStopOutcome),
    #[serde(rename = "system.health")]
    Health(HealthOutcome),
}

#[derive(Clone)]
struct AppState {
    upstream: upstream::UpstreamClient,
}

fn upstream_failure(error: upstream::UpstreamError) -> RpcFailure {
    let code = match &error {
        upstream::UpstreamError::Unreachable(_) => "UpstreamUnreachable",
        upstream::UpstreamError::Http(_) => "UpstreamHttp",
        upstream::UpstreamError::Wire(_) => "UpstreamWire",
        upstream::UpstreamError::Failure(_) => "UpstreamFailure",
    };
    RpcFailure {
        code: code.into(),
        message: error.to_string(),
    }
}

/// Pure mapping from the legacy status union to the korrid-shaped outcome.
fn session_status_outcome(
    result: Result<upstream::UpstreamSessionStatus, upstream::UpstreamError>,
) -> SessionStatusOutcome {
    match result {
        Ok(upstream::UpstreamSessionStatus::SessionStatus { active }) => {
            SessionStatusOutcome::Ok(SessionStatus {
                active: active.map(|active| ActiveSession {
                    launch_id: active.launch_id,
                    game_id: active.game_id,
                    title: active.title,
                    phase: active.phase,
                }),
            })
        }
        Ok(upstream::UpstreamSessionStatus::SessiondNotConfigured {}) => {
            SessionStatusOutcome::Err(RpcFailure {
                code: "SessiondNotConfigured".into(),
                message: "host session daemon is not configured".into(),
            })
        }
        Ok(upstream::UpstreamSessionStatus::HostUnavailable {}) => {
            SessionStatusOutcome::Err(RpcFailure {
                code: "HostUnavailable".into(),
                message: "host is unavailable".into(),
            })
        }
        Err(error) => SessionStatusOutcome::Err(upstream_failure(error)),
    }
}

/// Pure mapping from the legacy stop union to the korrid-shaped outcome.
fn session_stop_outcome(
    result: Result<upstream::UpstreamSessionStop, upstream::UpstreamError>,
) -> SessionStopOutcome {
    match result {
        Ok(upstream::UpstreamSessionStop::Stopped { .. }) => {
            SessionStopOutcome::Ok(SessionStopResult {
                phase: SessionStopPhase::Stopped,
            })
        }
        Ok(upstream::UpstreamSessionStop::StopPending { .. }) => {
            SessionStopOutcome::Ok(SessionStopResult {
                phase: SessionStopPhase::Pending,
            })
        }
        Ok(upstream::UpstreamSessionStop::SessiondNotConfigured {}) => {
            SessionStopOutcome::Err(RpcFailure {
                code: "SessiondNotConfigured".into(),
                message: "host session daemon is not configured".into(),
            })
        }
        Ok(upstream::UpstreamSessionStop::HostUnavailable {}) => {
            SessionStopOutcome::Err(RpcFailure {
                code: "HostUnavailable".into(),
                message: "host is unavailable".into(),
            })
        }
        Err(error) => SessionStopOutcome::Err(upstream_failure(error)),
    }
}

pub async fn dispatch(state: &AppState, request: RpcRequest) -> RpcResponse {
    match request {
        RpcRequest::CatalogSnapshot(_) => {
            let outcome = match state.upstream.catalog_snapshot().await {
                Ok(catalog) => CatalogSnapshotOutcome::Ok(CatalogSnapshot {
                    games: catalog
                        .entries
                        .into_iter()
                        .filter(|entry| entry.launchable)
                        .map(|entry| Game {
                            title: entry.title.clone().unwrap_or_else(|| entry.id.clone()),
                            id: entry.id,
                        })
                        .collect(),
                }),
                Err(error) => CatalogSnapshotOutcome::Err(upstream_failure(error)),
            };
            RpcResponse::CatalogSnapshot(outcome)
        }
        RpcRequest::SessionPrepare(request) => {
            let outcome = match state.upstream.prepare_stream(&request.game_id).await {
                Ok(prepared) => SessionPrepareOutcome::Ok(SessionPrepared {
                    game_id: prepared.game_id,
                }),
                Err(error) => SessionPrepareOutcome::Err(upstream_failure(error)),
            };
            RpcResponse::SessionPrepare(outcome)
        }
        RpcRequest::SessionStatus(_) => RpcResponse::SessionStatus(session_status_outcome(
            state.upstream.session_status().await,
        )),
        RpcRequest::SessionStop(request) => RpcResponse::SessionStop(session_stop_outcome(
            state
                .upstream
                .session_stop(request.force.unwrap_or(false))
                .await,
        )),
        RpcRequest::Health(_) => RpcResponse::Health(HealthOutcome::Ok(Health {
            version: VERSION.into(),
        })),
    }
}

async fn rpc(State(state): State<AppState>, Json(request): Json<RpcRequest>) -> Json<RpcResponse> {
    Json(dispatch(&state, request).await)
}

pub fn router() -> Router {
    let state = AppState {
        upstream: upstream::UpstreamClient::new(upstream::UpstreamConfig::from_env()),
    };
    Router::new()
        .route("/rpc", post(rpc))
        // The server binds loopback only; the WebView portal calls it from
        // a synthetic https origin, so preflights must be answered.
        .layer(tower_http::cors::CorsLayer::permissive())
        .with_state(state)
}

#[derive(Debug, thiserror::Error)]
pub enum ServerError {
    #[error("korrid server is already running")]
    AlreadyRunning,
    #[error("korrid server is not running")]
    NotRunning,
    #[error("failed to start korrid server: {details}")]
    StartFailed { details: String },
}

struct ServerHandle {
    port: u16,
    stop: oneshot::Sender<()>,
    thread: JoinHandle<()>,
}

static SERVER: OnceLock<Mutex<Option<ServerHandle>>> = OnceLock::new();

fn server_slot() -> &'static Mutex<Option<ServerHandle>> {
    SERVER.get_or_init(|| Mutex::new(None))
}

pub fn korrid_version() -> String {
    VERSION.into()
}

/// Starts the exact same Axum router used by the Linux binary on localhost.
pub fn start_local_server() -> Result<u16, ServerError> {
    let mut slot = server_slot().lock().expect("server mutex poisoned");
    if slot.is_some() {
        return Err(ServerError::AlreadyRunning);
    }

    let listener =
        StdTcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0)).map_err(|error| {
            ServerError::StartFailed {
                details: error.to_string(),
            }
        })?;
    listener
        .set_nonblocking(true)
        .map_err(|error| ServerError::StartFailed {
            details: error.to_string(),
        })?;
    let port = listener
        .local_addr()
        .map_err(|error| ServerError::StartFailed {
            details: error.to_string(),
        })?
        .port();
    let (stop, stopped) = oneshot::channel();
    let thread = std::thread::Builder::new()
        .name("korrid".into())
        .spawn(move || {
            let runtime = tokio::runtime::Runtime::new().expect("create Tokio runtime");
            runtime.block_on(async move {
                let listener = tokio::net::TcpListener::from_std(listener)
                    .expect("convert localhost listener");
                axum::serve(listener, router())
                    .with_graceful_shutdown(async {
                        let _ = stopped.await;
                    })
                    .await
                    .expect("serve korrid");
            });
        })
        .map_err(|error| ServerError::StartFailed {
            details: error.to_string(),
        })?;

    *slot = Some(ServerHandle { port, stop, thread });
    Ok(port)
}

pub fn stop_local_server() -> Result<(), ServerError> {
    let handle = server_slot()
        .lock()
        .expect("server mutex poisoned")
        .take()
        .ok_or(ServerError::NotRunning)?;
    let _ = handle.stop.send(());
    handle.thread.join().map_err(|_| ServerError::StartFailed {
        details: "server thread panicked".into(),
    })?;
    Ok(())
}

pub fn local_server_port() -> Option<u16> {
    server_slot()
        .lock()
        .expect("server mutex poisoned")
        .as_ref()
        .map(|server| server.port)
}

pub mod upstream;

#[cfg(target_os = "android")]
mod android;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_with_active_session_maps_to_ok_with_details() {
        let outcome = session_status_outcome(Ok(upstream::UpstreamSessionStatus::SessionStatus {
            active: Some(upstream::UpstreamActiveSession {
                launch_id: "l1".into(),
                game_id: Some("g1".into()),
                title: Some("Skate 3".into()),
                phase: Some("running".into()),
            }),
        }));
        let SessionStatusOutcome::Ok(status) = outcome else {
            panic!("expected Ok");
        };
        let active = status.active.expect("active session");
        assert_eq!(active.game_id.as_deref(), Some("g1"));
        assert_eq!(active.title.as_deref(), Some("Skate 3"));
        assert_eq!(active.phase.as_deref(), Some("running"));
    }

    #[test]
    fn status_without_active_session_maps_to_nothing_playing() {
        let outcome = session_status_outcome(Ok(upstream::UpstreamSessionStatus::SessionStatus {
            active: None,
        }));
        assert!(matches!(
            outcome,
            SessionStatusOutcome::Ok(SessionStatus { active: None })
        ));
    }

    #[test]
    fn status_daemon_variants_map_to_distinct_failure_codes() {
        let not_configured = session_status_outcome(Ok(
            upstream::UpstreamSessionStatus::SessiondNotConfigured {},
        ));
        let SessionStatusOutcome::Err(failure) = not_configured else {
            panic!("expected Err");
        };
        assert_eq!(failure.code, "SessiondNotConfigured");

        let unavailable =
            session_status_outcome(Ok(upstream::UpstreamSessionStatus::HostUnavailable {}));
        let SessionStatusOutcome::Err(failure) = unavailable else {
            panic!("expected Err");
        };
        assert_eq!(failure.code, "HostUnavailable");
    }

    #[test]
    fn stop_variants_map_to_stopped_and_pending_phases() {
        let stopped = session_stop_outcome(Ok(upstream::UpstreamSessionStop::Stopped {
            launch_id: Some("l1".into()),
        }));
        assert!(matches!(
            stopped,
            SessionStopOutcome::Ok(SessionStopResult {
                phase: SessionStopPhase::Stopped
            })
        ));

        let pending = session_stop_outcome(Ok(upstream::UpstreamSessionStop::StopPending {
            launch_id: None,
        }));
        assert!(matches!(
            pending,
            SessionStopOutcome::Ok(SessionStopResult {
                phase: SessionStopPhase::Pending
            })
        ));
    }
}
