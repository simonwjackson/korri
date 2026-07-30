use crate::{
    CatalogSnapshot, CatalogSnapshotOutcome, RpcFailure, RpcRequest, RpcResponse,
    SessionPrepareOutcome, SessionPrepareRequest, SessionPrepared,
};
use std::time::Duration;

use crate::upstreams::UpstreamError;

#[derive(Clone)]
pub struct NativeClient {
    rpc_url: String,
    http: reqwest::Client,
}

impl NativeClient {
    pub fn new(base_url: String) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .expect("construct native upstream client");
        Self {
            rpc_url: format!("{}/rpc", base_url.trim_end_matches('/')),
            http,
        }
    }

    fn tagged_failure(failure: RpcFailure) -> UpstreamError {
        UpstreamError::Tagged {
            code: failure.code,
            message: failure.message,
        }
    }

    pub async fn catalog_snapshot(&self) -> Result<CatalogSnapshot, UpstreamError> {
        match self
            .call(RpcRequest::CatalogSnapshot(
                crate::CatalogSnapshotRequest {},
            ))
            .await?
        {
            RpcResponse::CatalogSnapshot(CatalogSnapshotOutcome::Ok(catalog)) => Ok(catalog),
            RpcResponse::CatalogSnapshot(CatalogSnapshotOutcome::Err(failure)) => {
                Err(Self::tagged_failure(failure))
            }
            response => Err(UpstreamError::Wire(format!(
                "native catalog returned {response:?}"
            ))),
        }
    }

    pub async fn prepare_stream(&self, game_id: &str) -> Result<SessionPrepared, UpstreamError> {
        match self
            .call(RpcRequest::SessionPrepare(SessionPrepareRequest {
                game_id: game_id.into(),
                host: None,
            }))
            .await?
        {
            RpcResponse::SessionPrepare(SessionPrepareOutcome::Ok(prepared)) => Ok(prepared),
            RpcResponse::SessionPrepare(SessionPrepareOutcome::Err(failure)) => {
                Err(Self::tagged_failure(failure))
            }
            response => Err(UpstreamError::Wire(format!(
                "native prepare returned {response:?}"
            ))),
        }
    }

    async fn call(&self, request: RpcRequest) -> Result<RpcResponse, UpstreamError> {
        let response = self
            .http
            .post(&self.rpc_url)
            .json(&request)
            .send()
            .await
            .map_err(|error| UpstreamError::Unreachable(error.to_string()))?;
        let status = response.status();
        if !status.is_success() {
            return Err(UpstreamError::Http(status.as_u16()));
        }
        response
            .json()
            .await
            .map_err(|error| UpstreamError::Wire(error.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{path::Path, time::Duration};

    async fn serve(app: axum::Router) -> String {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        format!("http://{address}")
    }

    async fn serve_response(status: axum::http::StatusCode, body: &'static str) -> String {
        let app = axum::Router::new().route(
            "/rpc",
            axum::routing::post(move || async move {
                (
                    status,
                    [(axum::http::header::CONTENT_TYPE, "application/json")],
                    body,
                )
            }),
        );
        serve(app).await
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

    #[tokio::test]
    async fn native_client_maps_host_http_and_wire_failures() {
        let root = tempfile::tempdir().unwrap();
        let tagged =
            NativeClient::new(serve(crate::host_router(root.path().join("missing"))).await)
                .catalog_snapshot()
                .await
                .unwrap_err();
        assert!(matches!(
            tagged,
            UpstreamError::Tagged { code, .. } if code == "HostConfigInvalid"
        ));

        let http = NativeClient::new(
            serve_response(axum::http::StatusCode::SERVICE_UNAVAILABLE, "unavailable").await,
        )
        .catalog_snapshot()
        .await
        .unwrap_err();
        assert!(matches!(http, UpstreamError::Http(503)));

        for body in [
            "not json",
            r#"{"_tag":"system.health","outcome":{"_tag":"Ok","payload":{"version":"test"}}}"#,
        ] {
            let error = NativeClient::new(serve_response(axum::http::StatusCode::OK, body).await)
                .catalog_snapshot()
                .await
                .unwrap_err();
            assert!(matches!(error, UpstreamError::Wire(_)));
        }
    }

    #[tokio::test]
    async fn native_client_round_trips_catalog_and_prepare() {
        let root = tempfile::tempdir().unwrap();
        let marker = root.path().join("prepared");
        let config = root.path().join("host.toml");
        std::fs::write(
            &config,
            format!(
                r#"
label = "zao"

[[games]]
id = "neverball"
title = "Neverball"
command = ["sh", "-c", "printf prepared > {}; sleep 1"]
"#,
                marker.display()
            ),
        )
        .unwrap();
        let base_url = serve(crate::host_router(&config)).await;
        let client = NativeClient::new(base_url);

        let catalog = client.catalog_snapshot().await.unwrap();
        assert_eq!(catalog.games[0].id, "neverball");
        assert_eq!(catalog.games[0].host.as_deref(), Some("zao"));

        let prepared = client.prepare_stream("neverball").await.unwrap();
        assert_eq!(prepared.game_id, "neverball");
        wait_for(&marker);
    }
}
