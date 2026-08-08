use std::{sync::Arc, time::Duration};

use korri_inputd::korrid_client::{
    ExactStopOutcome, KorridClient, LocalControlError, LocalControlLimits, SessionStatus,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::UnixListener,
    sync::Mutex,
};

const LAUNCH_ID: &str = "0123456789abcdef0123456789abcdef";

fn limits(status_attempts: usize) -> LocalControlLimits {
    LocalControlLimits {
        operation_timeout: Duration::from_millis(500),
        status_attempts,
        retry_delay: Duration::from_millis(5),
        max_response_bytes: 4096,
    }
}

async fn reply(stream: &mut tokio::net::UnixStream, body: &str) {
    let response = format!(
        "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
        body.len(), body
    );
    stream.write_all(response.as_bytes()).await.unwrap();
}

async fn request_body(stream: &mut tokio::net::UnixStream) -> serde_json::Value {
    let mut request = Vec::new();
    stream.read_to_end(&mut request).await.unwrap();
    let body = request
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|position| &request[position + 4..])
        .unwrap();
    serde_json::from_slice(body).unwrap()
}

fn status_ok(phase: &str) -> String {
    serde_json::json!({
        "_tag": "app.session.status",
        "outcome": {
            "_tag": "Ok",
            "payload": { "active": { "launchId": LAUNCH_ID, "phase": phase } }
        }
    })
    .to_string()
}

fn status_error(code: &str) -> String {
    serde_json::json!({
        "_tag": "app.session.status",
        "outcome": { "_tag": "Err", "payload": { "code": code, "message": "test" } }
    })
    .to_string()
}

#[tokio::test]
async fn status_reads_the_exact_running_launch() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("control.sock");
    let listener = UnixListener::bind(&path).unwrap();
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        assert_eq!(
            request_body(&mut stream).await,
            serde_json::json!({"_tag":"app.session.status", "payload":{}})
        );
        reply(&mut stream, &status_ok("running")).await;
    });

    assert_eq!(
        KorridClient::with_limits(path, limits(1))
            .status()
            .await
            .unwrap(),
        SessionStatus::Running {
            launch_id: LAUNCH_ID.into()
        }
    );
    server.await.unwrap();
}

#[tokio::test]
async fn exact_stop_uses_the_observed_launch_id_and_mutates_once() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("control.sock");
    let listener = UnixListener::bind(&path).unwrap();
    let requests = Arc::new(Mutex::new(Vec::new()));
    let observed = Arc::clone(&requests);
    let server = tokio::spawn(async move {
        let (mut status, _) = listener.accept().await.unwrap();
        observed.lock().await.push(request_body(&mut status).await);
        reply(&mut status, &status_ok("running")).await;
        drop(status);
        let (mut stop, _) = listener.accept().await.unwrap();
        observed.lock().await.push(request_body(&mut stop).await);
        reply(
            &mut stop,
            r#"{"_tag":"app.session.stop","outcome":{"_tag":"Ok","payload":{"phase":"stopped"}}}"#,
        )
        .await;
    });

    assert_eq!(
        KorridClient::with_limits(path, limits(2))
            .stop_active_exact()
            .await
            .unwrap(),
        ExactStopOutcome::Completed
    );
    server.await.unwrap();
    let requests = requests.lock().await;
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[1]["_tag"], "app.session.stop");
    assert_eq!(requests[1]["payload"]["expectedLaunchId"], LAUNCH_ID);
}

#[tokio::test]
async fn stopping_returns_already_stopping_without_a_stop_mutation() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("control.sock");
    let listener = UnixListener::bind(&path).unwrap();
    let server = tokio::spawn(async move {
        let (mut status, _) = listener.accept().await.unwrap();
        let _ = request_body(&mut status).await;
        reply(&mut status, &status_ok("stopping")).await;
        assert!(
            tokio::time::timeout(Duration::from_millis(50), listener.accept())
                .await
                .is_err()
        );
    });

    assert_eq!(
        KorridClient::with_limits(path, limits(1))
            .stop_active_exact()
            .await
            .unwrap(),
        ExactStopOutcome::AlreadyStopping
    );
    server.await.unwrap();
}

#[tokio::test]
async fn no_active_and_recovery_blocked_never_send_a_stop() {
    for (code, expected) in [
        ("NoActiveSession", ExactStopOutcome::NoActive),
        ("HostRecoveryBlocked", ExactStopOutcome::RecoveryBlocked),
        ("SessionCompleted", ExactStopOutcome::Completed),
    ] {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("control.sock");
        let listener = UnixListener::bind(&path).unwrap();
        let server = tokio::spawn(async move {
            let (mut status, _) = listener.accept().await.unwrap();
            let _ = request_body(&mut status).await;
            reply(&mut status, &status_error(code)).await;
            assert!(
                tokio::time::timeout(Duration::from_millis(50), listener.accept())
                    .await
                    .is_err()
            );
        });

        assert_eq!(
            KorridClient::with_limits(path, limits(1))
                .stop_active_exact()
                .await
                .unwrap(),
            expected
        );
        server.await.unwrap();
    }
}

#[tokio::test]
async fn stop_outcomes_distinguish_stale_and_already_stopping() {
    for (stop_body, expected) in [
        (
            r#"{"_tag":"app.session.stop","outcome":{"_tag":"Err","payload":{"code":"StaleLaunchIdentity","message":"stale"}}}"#,
            ExactStopOutcome::StaleIdentity,
        ),
        (
            r#"{"_tag":"app.session.stop","outcome":{"_tag":"Ok","payload":{"phase":"pending"}}}"#,
            ExactStopOutcome::AlreadyStopping,
        ),
    ] {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("control.sock");
        let listener = UnixListener::bind(&path).unwrap();
        let server = tokio::spawn(async move {
            let (mut status, _) = listener.accept().await.unwrap();
            let _ = request_body(&mut status).await;
            reply(&mut status, &status_ok("running")).await;
            drop(status);
            let (mut stop, _) = listener.accept().await.unwrap();
            let _ = request_body(&mut stop).await;
            reply(&mut stop, stop_body).await;
        });

        assert_eq!(
            KorridClient::with_limits(path, limits(1))
                .stop_active_exact()
                .await
                .unwrap(),
            expected
        );
        server.await.unwrap();
    }
}

#[tokio::test]
async fn read_only_status_retries_but_stop_is_never_retried() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("control.sock");
    let listener = UnixListener::bind(&path).unwrap();
    let server = tokio::spawn(async move {
        let (mut first_status, _) = listener.accept().await.unwrap();
        let _ = request_body(&mut first_status).await;
        drop(first_status);
        let (mut second_status, _) = listener.accept().await.unwrap();
        let _ = request_body(&mut second_status).await;
        reply(&mut second_status, &status_ok("running")).await;
        drop(second_status);
        let (mut stop, _) = listener.accept().await.unwrap();
        let _ = request_body(&mut stop).await;
        drop(stop);
        assert!(
            tokio::time::timeout(Duration::from_millis(100), listener.accept())
                .await
                .is_err()
        );
    });

    let error = KorridClient::with_limits(path, limits(2))
        .stop_active_exact()
        .await
        .unwrap_err();
    assert!(matches!(
        error,
        LocalControlError::InvalidHttpResponse | LocalControlError::Read(_)
    ));
    server.await.unwrap();
}

#[tokio::test]
async fn response_framing_requires_one_exact_bounded_content_length() {
    for response in [
        "HTTP/1.1 200 OK\r\nconnection: close\r\n\r\n{}".to_owned(),
        "HTTP/1.1 200 OK\r\ncontent-length: 2\r\nContent-Length: 2\r\n\r\n{}".to_owned(),
        "HTTP/1.1 200 OK\r\ncontent-length: nope\r\n\r\n{}".to_owned(),
        "HTTP/1.1 200 OK\r\ncontent-length: 3\r\n\r\n{}".to_owned(),
        "HTTP/1.1 200 OK\r\ncontent-length: 1\r\n\r\n{}".to_owned(),
    ] {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("control.sock");
        let listener = UnixListener::bind(&path).unwrap();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let _ = request_body(&mut stream).await;
            stream.write_all(response.as_bytes()).await.unwrap();
        });

        assert!(matches!(
            KorridClient::with_limits(path, limits(1)).status().await,
            Err(LocalControlError::InvalidHttpResponse)
        ));
        server.await.unwrap();
    }

    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("control.sock");
    let listener = UnixListener::bind(&path).unwrap();
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let _ = request_body(&mut stream).await;
        stream
            .write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 99999\r\n\r\n")
            .await
            .unwrap();
    });
    assert!(matches!(
        KorridClient::with_limits(path, limits(1)).status().await,
        Err(LocalControlError::ResponseTooLarge)
    ));
    server.await.unwrap();
}

#[tokio::test]
async fn response_size_is_bounded() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("control.sock");
    let listener = UnixListener::bind(&path).unwrap();
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let _ = request_body(&mut stream).await;
        stream.write_all(&vec![b'x'; 1024]).await.unwrap();
    });
    let mut bounded = limits(1);
    bounded.max_response_bytes = 128;

    assert!(matches!(
        KorridClient::with_limits(path, bounded).status().await,
        Err(LocalControlError::ResponseTooLarge)
    ));
    server.await.unwrap();
}
