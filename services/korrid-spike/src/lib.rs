//! THROWAWAY PROTOTYPE: proves the Rust/TypeScript/Android seams only.

use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use std::{
    net::{Ipv4Addr, SocketAddrV4, TcpListener as StdTcpListener},
    sync::{Mutex, OnceLock},
    thread::JoinHandle,
};
use tokio::sync::oneshot;
use typeshare::typeshare;

pub const VERSION: &str = "korrid-rust-spike-v1";

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
    #[serde(rename = "system.health")]
    Health(HealthRequest),
}

#[typeshare]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "_tag", content = "outcome")]
pub enum RpcResponse {
    #[serde(rename = "app.catalog.snapshot")]
    CatalogSnapshot(CatalogSnapshotOutcome),
    #[serde(rename = "system.health")]
    Health(HealthOutcome),
}

#[derive(Clone)]
struct AppState;

pub fn dispatch(request: RpcRequest) -> RpcResponse {
    match request {
        RpcRequest::CatalogSnapshot(_) => {
            RpcResponse::CatalogSnapshot(CatalogSnapshotOutcome::Ok(CatalogSnapshot {
                games: vec![Game {
                    id: "spike.desktop".into(),
                    title: "Desktop from Rust".into(),
                }],
            }))
        }
        RpcRequest::Health(_) => RpcResponse::Health(HealthOutcome::Ok(Health {
            version: VERSION.into(),
        })),
    }
}

async fn rpc(State(_): State<AppState>, Json(request): Json<RpcRequest>) -> Json<RpcResponse> {
    Json(dispatch(request))
}

pub fn router() -> Router {
    Router::new().route("/rpc", post(rpc)).with_state(AppState)
}

#[derive(Debug, thiserror::Error)]
pub enum SpikeError {
    #[error("korrid spike server is already running")]
    AlreadyRunning,
    #[error("korrid spike server is not running")]
    NotRunning,
    #[error("failed to start korrid spike server: {details}")]
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

pub fn korrid_spike_version() -> String {
    VERSION.into()
}

/// Starts the exact same Axum router used by the Linux binary on localhost.
pub fn start_local_server() -> Result<u16, SpikeError> {
    let mut slot = server_slot().lock().expect("server mutex poisoned");
    if slot.is_some() {
        return Err(SpikeError::AlreadyRunning);
    }

    let listener =
        StdTcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0)).map_err(|error| {
            SpikeError::StartFailed {
                details: error.to_string(),
            }
        })?;
    listener
        .set_nonblocking(true)
        .map_err(|error| SpikeError::StartFailed {
            details: error.to_string(),
        })?;
    let port = listener
        .local_addr()
        .map_err(|error| SpikeError::StartFailed {
            details: error.to_string(),
        })?
        .port();
    let (stop, stopped) = oneshot::channel();
    let thread = std::thread::Builder::new()
        .name("korrid-spike".into())
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
                    .expect("serve korrid spike");
            });
        })
        .map_err(|error| SpikeError::StartFailed {
            details: error.to_string(),
        })?;

    *slot = Some(ServerHandle { port, stop, thread });
    Ok(port)
}

pub fn stop_local_server() -> Result<(), SpikeError> {
    let handle = server_slot()
        .lock()
        .expect("server mutex poisoned")
        .take()
        .ok_or(SpikeError::NotRunning)?;
    let _ = handle.stop.send(());
    handle.thread.join().map_err(|_| SpikeError::StartFailed {
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

#[cfg(target_os = "android")]
mod android;
