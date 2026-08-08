use std::{fmt, io, path::PathBuf, time::Duration};

use serde::Deserialize;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::UnixStream,
};

const STATUS_REQUEST: &[u8] = br#"{"_tag":"app.session.status","payload":{}}"#;
const MAX_LAUNCH_ID_BYTES: usize = 128;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalControlLimits {
    pub operation_timeout: Duration,
    pub status_attempts: usize,
    pub retry_delay: Duration,
    pub max_response_bytes: usize,
}

impl Default for LocalControlLimits {
    fn default() -> Self {
        Self {
            operation_timeout: Duration::from_millis(750),
            status_attempts: 2,
            retry_delay: Duration::from_millis(50),
            max_response_bytes: 16 * 1024,
        }
    }
}

#[derive(Clone, Debug)]
pub struct KorridClient {
    socket_path: PathBuf,
    limits: LocalControlLimits,
}

impl KorridClient {
    pub fn new(socket_path: impl Into<PathBuf>) -> Self {
        Self {
            socket_path: socket_path.into(),
            limits: LocalControlLimits::default(),
        }
    }

    pub fn with_limits(socket_path: impl Into<PathBuf>, limits: LocalControlLimits) -> Self {
        Self {
            socket_path: socket_path.into(),
            limits,
        }
    }

    pub async fn status(&self) -> Result<SessionStatus, LocalControlError> {
        let attempts = self.limits.status_attempts.max(1);
        for attempt in 0..attempts {
            match self.request(STATUS_REQUEST).await {
                Ok(response) => return parse_status(&response),
                Err(error) if error.retryable_read() && attempt + 1 < attempts => {
                    tokio::time::sleep(self.limits.retry_delay).await;
                }
                Err(error) => return Err(error),
            }
        }
        unreachable!("status always returns from a positive attempt count")
    }

    pub async fn stop_active_exact(&self) -> Result<ExactStopOutcome, LocalControlError> {
        let launch_id = match self.status().await? {
            SessionStatus::Running { launch_id } | SessionStatus::Stopping { launch_id } => {
                launch_id
            }
            SessionStatus::NoActive => return Ok(ExactStopOutcome::NoActive),
            SessionStatus::Completed => return Ok(ExactStopOutcome::Completed),
            SessionStatus::RecoveryBlocked => return Ok(ExactStopOutcome::RecoveryBlocked),
        };
        validate_launch_id(&launch_id)?;
        let request = serde_json::json!({
            "_tag": "app.session.stop",
            "payload": { "expectedLaunchId": launch_id }
        });
        // Mutation is intentionally attempted once. A transport failure is not
        // evidence that korrid did not receive the stop.
        let response = self.request(request.to_string().as_bytes()).await?;
        parse_stop(&response)
    }

    async fn request(&self, body: &[u8]) -> Result<Vec<u8>, LocalControlError> {
        tokio::time::timeout(self.limits.operation_timeout, self.request_inner(body))
            .await
            .map_err(|_| LocalControlError::TimedOut)?
    }

    async fn request_inner(&self, body: &[u8]) -> Result<Vec<u8>, LocalControlError> {
        let mut stream = UnixStream::connect(&self.socket_path)
            .await
            .map_err(LocalControlError::Connect)?;
        let head = format!(
            "POST /rpc HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        stream
            .write_all(head.as_bytes())
            .await
            .map_err(LocalControlError::Write)?;
        stream
            .write_all(body)
            .await
            .map_err(LocalControlError::Write)?;
        stream.shutdown().await.map_err(LocalControlError::Write)?;

        let mut response = Vec::new();
        let mut buffer = [0_u8; 4096];
        loop {
            let count = stream
                .read(&mut buffer)
                .await
                .map_err(LocalControlError::Read)?;
            if count == 0 {
                break;
            }
            if response.len().saturating_add(count) > self.limits.max_response_bytes {
                return Err(LocalControlError::ResponseTooLarge);
            }
            response.extend_from_slice(&buffer[..count]);
        }
        parse_http_response(&response)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SessionStatus {
    Running { launch_id: String },
    Stopping { launch_id: String },
    NoActive,
    Completed,
    RecoveryBlocked,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ExactStopOutcome {
    NoActive,
    StaleIdentity,
    AlreadyStopping,
    Completed,
    RecoveryBlocked,
}

#[derive(Debug)]
pub enum LocalControlError {
    Connect(io::Error),
    Write(io::Error),
    Read(io::Error),
    TimedOut,
    ResponseTooLarge,
    InvalidHttpResponse,
    HttpStatus(u16),
    InvalidTreaty(String),
    Rejected { code: String, message: String },
}

impl LocalControlError {
    fn retryable_read(&self) -> bool {
        matches!(
            self,
            Self::Connect(_)
                | Self::Write(_)
                | Self::Read(_)
                | Self::TimedOut
                | Self::InvalidHttpResponse
        )
    }
}

impl fmt::Display for LocalControlError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Connect(error) => write!(formatter, "local control connect failed: {error}"),
            Self::Write(error) => write!(formatter, "local control request failed: {error}"),
            Self::Read(error) => write!(formatter, "local control response failed: {error}"),
            Self::TimedOut => formatter.write_str("local control operation timed out"),
            Self::ResponseTooLarge => formatter.write_str("local control response exceeded limit"),
            Self::InvalidHttpResponse => {
                formatter.write_str("local control HTTP response is invalid")
            }
            Self::HttpStatus(status) => write!(formatter, "local control returned HTTP {status}"),
            Self::InvalidTreaty(message) => {
                write!(formatter, "local control treaty mismatch: {message}")
            }
            Self::Rejected { code, message } => {
                write!(formatter, "local control rejected {code}: {message}")
            }
        }
    }
}

impl std::error::Error for LocalControlError {}

fn parse_http_response(response: &[u8]) -> Result<Vec<u8>, LocalControlError> {
    let header_end = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or(LocalControlError::InvalidHttpResponse)?;
    let headers = std::str::from_utf8(&response[..header_end])
        .map_err(|_| LocalControlError::InvalidHttpResponse)?;
    let status = headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or(LocalControlError::InvalidHttpResponse)?;
    if status != 200 {
        return Err(LocalControlError::HttpStatus(status));
    }
    Ok(response[header_end + 4..].to_vec())
}

#[derive(Deserialize)]
struct ResponseEnvelope {
    #[serde(rename = "_tag")]
    tag: String,
    outcome: Outcome,
}

#[derive(Deserialize)]
#[serde(tag = "_tag", content = "payload")]
enum Outcome {
    Ok(serde_json::Value),
    Err(Failure),
}

#[derive(Deserialize)]
struct Failure {
    code: String,
    message: String,
}

#[derive(Deserialize)]
struct StatusPayload {
    active: Option<ActivePayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivePayload {
    launch_id: String,
    phase: Option<String>,
}

#[derive(Deserialize)]
struct StopPayload {
    phase: String,
}

fn parse_status(body: &[u8]) -> Result<SessionStatus, LocalControlError> {
    let response = parse_envelope(body, "app.session.status")?;
    match response {
        Outcome::Ok(payload) => {
            let payload: StatusPayload = serde_json::from_value(payload)
                .map_err(|error| LocalControlError::InvalidTreaty(error.to_string()))?;
            let Some(active) = payload.active else {
                return Ok(SessionStatus::NoActive);
            };
            validate_launch_id(&active.launch_id)?;
            match active.phase.as_deref() {
                Some("running") => Ok(SessionStatus::Running {
                    launch_id: active.launch_id,
                }),
                Some("stopping") => Ok(SessionStatus::Stopping {
                    launch_id: active.launch_id,
                }),
                phase => Err(LocalControlError::InvalidTreaty(format!(
                    "unknown active phase {phase:?}"
                ))),
            }
        }
        Outcome::Err(failure) => match failure.code.as_str() {
            "NoActiveSession" => Ok(SessionStatus::NoActive),
            "SessionCompleted" => Ok(SessionStatus::Completed),
            "HostRecoveryBlocked" => Ok(SessionStatus::RecoveryBlocked),
            _ => Err(LocalControlError::Rejected {
                code: failure.code,
                message: failure.message,
            }),
        },
    }
}

fn parse_stop(body: &[u8]) -> Result<ExactStopOutcome, LocalControlError> {
    let response = parse_envelope(body, "app.session.stop")?;
    match response {
        Outcome::Ok(payload) => {
            let payload: StopPayload = serde_json::from_value(payload)
                .map_err(|error| LocalControlError::InvalidTreaty(error.to_string()))?;
            match payload.phase.as_str() {
                "stopped" => Ok(ExactStopOutcome::Completed),
                "pending" => Ok(ExactStopOutcome::AlreadyStopping),
                phase => Err(LocalControlError::InvalidTreaty(format!(
                    "unknown stop phase {phase:?}"
                ))),
            }
        }
        Outcome::Err(failure) => match failure.code.as_str() {
            "NoActiveSession" => Ok(ExactStopOutcome::NoActive),
            "StaleLaunchIdentity" => Ok(ExactStopOutcome::StaleIdentity),
            "HostRecoveryBlocked" => Ok(ExactStopOutcome::RecoveryBlocked),
            "SessionCompleted" => Ok(ExactStopOutcome::Completed),
            _ => Err(LocalControlError::Rejected {
                code: failure.code,
                message: failure.message,
            }),
        },
    }
}

fn parse_envelope(body: &[u8], expected_tag: &str) -> Result<Outcome, LocalControlError> {
    let response: ResponseEnvelope = serde_json::from_slice(body)
        .map_err(|error| LocalControlError::InvalidTreaty(error.to_string()))?;
    if response.tag != expected_tag {
        return Err(LocalControlError::InvalidTreaty(format!(
            "expected {expected_tag}, got {}",
            response.tag
        )));
    }
    Ok(response.outcome)
}

fn validate_launch_id(launch_id: &str) -> Result<(), LocalControlError> {
    if launch_id.is_empty()
        || launch_id.len() > MAX_LAUNCH_ID_BYTES
        || !launch_id.bytes().all(|byte| byte.is_ascii_alphanumeric())
    {
        return Err(LocalControlError::InvalidTreaty(
            "launchId is not a bounded opaque identifier".into(),
        ));
    }
    Ok(())
}
