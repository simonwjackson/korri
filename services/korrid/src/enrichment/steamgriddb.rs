use reqwest::{blocking::Client, header, redirect::Policy, StatusCode, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    cmp::Reverse,
    collections::{BTreeMap, BTreeSet},
    io::Read,
    net::{IpAddr, SocketAddr, ToSocketAddrs},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use crate::{
    config::settings,
    discovery::{self, title},
    game_assets::{AssetCandidate, AssetError, GameAssetRepository},
};

const STATE_DIR: &str = "steamgriddb-enrichment";
const ATTEMPTS_FILE: &str = "attempts.json";
const DEFAULT_BATCH_LIMIT: usize = 8;
const DEFAULT_RETRY_LIMIT: usize = 2;
const DEFAULT_MAX_IMAGE_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Clone)]
pub(crate) struct SteamGridDbEnricher {
    readable_root: PathBuf,
    private_root: PathBuf,
    write_lock: Arc<Mutex<()>>,
    options: EnrichmentOptions,
}

#[derive(Clone)]
pub(crate) struct EnrichmentOptions {
    pub api_base_url: Url,
    pub batch_limit: usize,
    pub retry_limit: usize,
    pub max_image_bytes: u64,
    pub retry_after_delay: Arc<dyn Fn(Duration) + Send + Sync>,
}

impl std::fmt::Debug for EnrichmentOptions {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("EnrichmentOptions")
            .field("api_base_url", &self.api_base_url)
            .field("batch_limit", &self.batch_limit)
            .field("retry_limit", &self.retry_limit)
            .field("max_image_bytes", &self.max_image_bytes)
            .finish_non_exhaustive()
    }
}

impl Default for EnrichmentOptions {
    fn default() -> Self {
        Self {
            api_base_url: Url::parse("https://www.steamgriddb.com/api/v2/")
                .expect("valid SGDB API URL"),
            batch_limit: DEFAULT_BATCH_LIMIT,
            retry_limit: DEFAULT_RETRY_LIMIT,
            max_image_bytes: DEFAULT_MAX_IMAGE_BYTES,
            retry_after_delay: Arc::new(thread::sleep),
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct EnrichmentReport {
    pub attempted: usize,
    pub assigned: usize,
    pub remaining: usize,
    pub diagnostics: Vec<EnrichmentDiagnostic>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct EnrichmentDiagnostic {
    pub code: &'static str,
    pub message: String,
    pub playable_id: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
struct AttemptState {
    #[serde(default)]
    attempts: BTreeMap<String, AttemptOutcome>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum AttemptOutcome {
    Assigned,
    NoMatch,
    Ambiguous,
    Unverified,
    Transient,
    AssetRejected,
}

impl SteamGridDbEnricher {
    pub(crate) fn new(
        readable_root: impl AsRef<Path>,
        private_root: impl AsRef<Path>,
        write_lock: Arc<Mutex<()>>,
    ) -> Self {
        Self::with_options(
            readable_root,
            private_root,
            write_lock,
            EnrichmentOptions::default(),
        )
    }

    pub(crate) fn with_options(
        readable_root: impl AsRef<Path>,
        private_root: impl AsRef<Path>,
        write_lock: Arc<Mutex<()>>,
        options: EnrichmentOptions,
    ) -> Self {
        Self {
            readable_root: readable_root.as_ref().to_owned(),
            private_root: private_root.as_ref().to_owned(),
            write_lock,
            options,
        }
    }

    pub(crate) fn clear_retryable_attempts(&self) -> Result<(), EnrichmentDiagnostic> {
        let mut state = read_attempt_state(&self.private_root).map_err(storage_diagnostic)?;
        state
            .attempts
            .retain(|_, outcome| matches!(outcome, AttemptOutcome::Assigned));
        write_attempt_state(&self.private_root, &state).map_err(storage_diagnostic)
    }

    pub(crate) fn run(&self) -> EnrichmentReport {
        let token = match settings::read_steamgriddb_credential(&self.private_root) {
            Ok(Some(token)) => token,
            Ok(None) => {
                return EnrichmentReport {
                    diagnostics: vec![EnrichmentDiagnostic {
                        code: "SteamGridDbCredentialMissing",
                        message: "SteamGridDB credential is not configured".into(),
                        playable_id: None,
                    }],
                    ..EnrichmentReport::default()
                };
            }
            Err(_) => {
                return EnrichmentReport {
                    diagnostics: vec![EnrichmentDiagnostic {
                        code: "SteamGridDbCredentialUnavailable",
                        message: "SteamGridDB credential state is unavailable".into(),
                        playable_id: None,
                    }],
                    ..EnrichmentReport::default()
                };
            }
        };

        let mut attempts = match read_attempt_state(&self.private_root) {
            Ok(state) => state,
            Err(error) => {
                return EnrichmentReport {
                    diagnostics: vec![storage_diagnostic(error)],
                    ..EnrichmentReport::default()
                };
            }
        };
        let asset_repo = GameAssetRepository::new(&self.private_root);
        let games = match discovery::reconcile::owned_discovery_games(
            &self.readable_root,
            &self.private_root,
        ) {
            Ok(games) => games,
            Err(error) => {
                return EnrichmentReport {
                    diagnostics: vec![EnrichmentDiagnostic {
                        code: "EnrichmentCatalogUnavailable",
                        message: error.to_string(),
                        playable_id: None,
                    }],
                    ..EnrichmentReport::default()
                };
            }
        };
        let eligible: Vec<_> = games
            .into_iter()
            .filter(|game| !attempts.attempts.contains_key(&game.playable_id))
            .filter(|game| {
                !asset_repo
                    .has_assignment(&game.playable_id)
                    .unwrap_or(false)
            })
            .collect();
        let mut report = EnrichmentReport {
            remaining: eligible.len().saturating_sub(self.options.batch_limit),
            ..EnrichmentReport::default()
        };
        if eligible.is_empty() {
            return report;
        }
        let client = match api_client(&self.options.api_base_url) {
            Ok(client) => client,
            Err(diagnostic) => {
                report.diagnostics.push(diagnostic);
                return report;
            }
        };

        for game in eligible.into_iter().take(self.options.batch_limit) {
            report.attempted += 1;
            let result = self.enrich_one(&client, &token, &asset_repo, &game);
            match result {
                Ok(AttemptOutcome::Assigned) => {
                    attempts
                        .attempts
                        .insert(game.playable_id.clone(), AttemptOutcome::Assigned);
                    report.assigned += 1;
                }
                Ok(outcome) => {
                    attempts.attempts.insert(game.playable_id.clone(), outcome);
                }
                Err(ProviderStop::Unauthorized(diagnostic)) => {
                    report.diagnostics.push(diagnostic);
                    break;
                }
                Err(ProviderStop::Diagnostic(diagnostic, outcome)) => {
                    attempts.attempts.insert(game.playable_id.clone(), outcome);
                    report.diagnostics.push(diagnostic);
                }
            }
            if let Err(error) = write_attempt_state(&self.private_root, &attempts) {
                report.diagnostics.push(storage_diagnostic(error));
                break;
            }
        }
        report
    }

    fn enrich_one(
        &self,
        client: &Client,
        token: &str,
        asset_repo: &GameAssetRepository,
        game: &discovery::reconcile::DiscoveryOwnedGame,
    ) -> Result<AttemptOutcome, ProviderStop> {
        let query = title::normalized_match_name(&game.title);
        let matches = request_with_retry(self, game, || {
            search_game(client, &self.options.api_base_url, token, &query)
        })?;
        let accepted = match exact_verified_match(&query, &matches) {
            MatchDecision::Accepted(game) => game,
            MatchDecision::NoMatch => return Ok(AttemptOutcome::NoMatch),
            MatchDecision::Unverified => return Ok(AttemptOutcome::Unverified),
            MatchDecision::Ambiguous => return Ok(AttemptOutcome::Ambiguous),
        };
        let grids = request_with_retry(self, game, || {
            grids_for_game(client, &self.options.api_base_url, token, accepted.id)
        })?;
        let Some(grid) = choose_grid(&grids) else {
            return Ok(AttemptOutcome::NoMatch);
        };
        let bytes =
            download_image(&grid.url, self.options.max_image_bytes).map_err(|diagnostic| {
                ProviderStop::Diagnostic(
                    with_game(diagnostic, &game.playable_id),
                    AttemptOutcome::Transient,
                )
            })?;
        asset_repo
            .assign_tile(
                &game.playable_id,
                AssetCandidate {
                    bytes,
                    declared_width: grid.width,
                    declared_height: grid.height,
                    game_id: accepted.id,
                    grid_id: grid.id,
                },
            )
            .map_err(|error| {
                ProviderStop::Diagnostic(
                    asset_diagnostic(error, &game.playable_id),
                    AttemptOutcome::AssetRejected,
                )
            })?;
        let _ = discovery::reconcile::update_owned_discovery_title(
            &self.readable_root,
            &self.private_root,
            &self.write_lock,
            &game.playable_id,
            &accepted.name,
        )
        .map_err(|error| {
            ProviderStop::Diagnostic(
                EnrichmentDiagnostic {
                    code: "EnrichmentCatalogWriteFailed",
                    message: error.to_string(),
                    playable_id: Some(game.playable_id.clone()),
                },
                AttemptOutcome::Transient,
            )
        })?;
        Ok(AttemptOutcome::Assigned)
    }
}

#[derive(Debug)]
enum ProviderStop {
    Unauthorized(EnrichmentDiagnostic),
    Diagnostic(EnrichmentDiagnostic, AttemptOutcome),
}

fn request_with_retry<T>(
    enricher: &SteamGridDbEnricher,
    game: &discovery::reconcile::DiscoveryOwnedGame,
    mut request: impl FnMut() -> Result<T, RequestFailure>,
) -> Result<T, ProviderStop> {
    for attempt in 0..=enricher.options.retry_limit {
        match request() {
            Ok(value) => return Ok(value),
            Err(RequestFailure::Unauthorized) => {
                return Err(ProviderStop::Unauthorized(EnrichmentDiagnostic {
                    code: "SteamGridDbCredentialUnauthorized",
                    message: "SteamGridDB rejected the configured credential".into(),
                    playable_id: None,
                }));
            }
            Err(RequestFailure::RetryAfter(duration)) if attempt < enricher.options.retry_limit => {
                (enricher.options.retry_after_delay)(duration);
            }
            Err(RequestFailure::Transient(message)) if attempt < enricher.options.retry_limit => {
                let shift = attempt.min(4) as u32;
                (enricher.options.retry_after_delay)(Duration::from_millis(
                    50 * 2u64.saturating_pow(shift),
                ));
                let _ = message;
            }
            Err(error) => {
                return Err(ProviderStop::Diagnostic(
                    EnrichmentDiagnostic {
                        code: "SteamGridDbTransientFailure",
                        message: error.sanitized_message(),
                        playable_id: Some(game.playable_id.clone()),
                    },
                    AttemptOutcome::Transient,
                ));
            }
        }
    }
    unreachable!("retry loop returns on final failure")
}

#[derive(Clone, Debug, Deserialize)]
struct SearchResponse {
    data: Vec<SearchGame>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
struct SearchGame {
    id: u64,
    name: String,
    #[serde(default)]
    verified: bool,
}

#[derive(Clone, Debug, Deserialize)]
struct GridResponse {
    data: Vec<Grid>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
struct Grid {
    id: u64,
    #[serde(deserialize_with = "deserialize_url")]
    url: Url,
    #[serde(default)]
    score: Option<i64>,
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    height: Option<u32>,
    #[serde(default)]
    nsfw: bool,
    #[serde(default)]
    humor: bool,
    #[serde(default)]
    epilepsy: bool,
    #[serde(default)]
    style: Option<String>,
    #[serde(default, rename = "type")]
    kind: Option<String>,
}

fn deserialize_url<'de, D>(deserializer: D) -> Result<Url, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = String::deserialize(deserializer)?;
    Url::parse(&value).map_err(serde::de::Error::custom)
}

fn search_game(
    client: &Client,
    base: &Url,
    token: &str,
    query: &str,
) -> Result<Vec<SearchGame>, RequestFailure> {
    let url = base
        .join(&format!("search/autocomplete/{}", url_path_segment(query)))
        .map_err(|error| RequestFailure::Permanent(error.to_string()))?;
    let response = client
        .get(url)
        .bearer_auth(token)
        .query(&[("types", "game")])
        .send()
        .map_err(|error| RequestFailure::Transient(error.to_string()))?;
    parse_response::<SearchResponse>(response).map(|response| response.data)
}

fn grids_for_game(
    client: &Client,
    base: &Url,
    token: &str,
    game_id: u64,
) -> Result<Vec<Grid>, RequestFailure> {
    let url = base
        .join(&format!("grids/game/{game_id}"))
        .map_err(|error| RequestFailure::Permanent(error.to_string()))?;
    let response = client
        .get(url)
        .bearer_auth(token)
        .query(&[("dimensions", "1x1"), ("types", "static")])
        .send()
        .map_err(|error| RequestFailure::Transient(error.to_string()))?;
    parse_response::<GridResponse>(response).map(|response| response.data)
}

fn parse_response<T: for<'de> Deserialize<'de>>(
    response: reqwest::blocking::Response,
) -> Result<T, RequestFailure> {
    match response.status() {
        StatusCode::UNAUTHORIZED => Err(RequestFailure::Unauthorized),
        StatusCode::TOO_MANY_REQUESTS => Err(retry_after(&response).unwrap_or(
            RequestFailure::Transient("SteamGridDB rate limited the request".into()),
        )),
        status if status.is_server_error() => Err(retry_after(&response).unwrap_or(
            RequestFailure::Transient("SteamGridDB is temporarily unavailable".into()),
        )),
        status if !status.is_success() => Err(RequestFailure::Permanent(format!(
            "SteamGridDB request failed with status {status}"
        ))),
        _ => response
            .json::<T>()
            .map_err(|error| RequestFailure::Permanent(error.to_string())),
    }
}

fn retry_after(response: &reqwest::blocking::Response) -> Option<RequestFailure> {
    let seconds = response
        .headers()
        .get(header::RETRY_AFTER)?
        .to_str()
        .ok()?
        .parse::<u64>()
        .ok()?;
    Some(RequestFailure::RetryAfter(Duration::from_secs(
        seconds.min(60),
    )))
}

#[derive(Debug)]
enum RequestFailure {
    Unauthorized,
    RetryAfter(Duration),
    Transient(String),
    Permanent(String),
}

impl RequestFailure {
    fn sanitized_message(&self) -> String {
        match self {
            Self::Unauthorized => "SteamGridDB rejected the configured credential".into(),
            Self::RetryAfter(_) => "SteamGridDB asked Korri to retry later".into(),
            Self::Transient(_) => "SteamGridDB is temporarily unavailable".into(),
            Self::Permanent(message) => message.replace("Bearer", "authorization"),
        }
    }
}

#[derive(Debug, Eq, PartialEq)]
enum MatchDecision {
    Accepted(SearchGame),
    NoMatch,
    Unverified,
    Ambiguous,
}

fn exact_verified_match(query: &str, games: &[SearchGame]) -> MatchDecision {
    let exact: Vec<_> = games
        .iter()
        .filter(|game| title::normalized_match_name(&game.name) == query)
        .cloned()
        .collect();
    if exact.is_empty() {
        return MatchDecision::NoMatch;
    }
    let verified: Vec<_> = exact.iter().filter(|game| game.verified).cloned().collect();
    if verified.is_empty() {
        return MatchDecision::Unverified;
    }
    if verified.len() == 1 {
        MatchDecision::Accepted(verified[0].clone())
    } else {
        MatchDecision::Ambiguous
    }
}

fn choose_grid(grids: &[Grid]) -> Option<Grid> {
    let mut safe: Vec<_> = grids
        .iter()
        .filter(|grid| !grid.nsfw && !grid.humor && !grid.epilepsy)
        .filter(|grid| grid.width == grid.height && grid.width.is_some())
        .filter(|grid| {
            grid.style.as_deref().is_none_or(|style| {
                style == "alternate"
                    || style == "blurred"
                    || style == "material"
                    || style == "white"
                    || style == "black"
            })
        })
        .filter(|grid| grid.kind.as_deref().is_none_or(|kind| kind == "static"))
        .cloned()
        .collect();
    safe.sort_by_key(|grid| Reverse(grid.score.unwrap_or(0)));
    safe.into_iter().next()
}

fn download_image(url: &Url, max_bytes: u64) -> Result<Vec<u8>, EnrichmentDiagnostic> {
    if url.scheme() != "https" {
        return Err(EnrichmentDiagnostic {
            code: "AssetUrlRejected",
            message: "SteamGridDB asset URL must use HTTPS".into(),
            playable_id: None,
        });
    }
    let host = url.host_str().ok_or_else(|| EnrichmentDiagnostic {
        code: "AssetUrlRejected",
        message: "SteamGridDB asset URL has no host".into(),
        playable_id: None,
    })?;
    let approved = resolve_public_address(host, url.port_or_known_default().unwrap_or(443))?;
    let client = Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(10))
        .resolve(host, approved)
        .build()
        .map_err(|_| EnrichmentDiagnostic {
            code: "AssetDownloadFailed",
            message: "asset download client could not be created".into(),
            playable_id: None,
        })?;
    let mut response = client
        .get(url.clone())
        .send()
        .map_err(|_| EnrichmentDiagnostic {
            code: "AssetDownloadFailed",
            message: "asset download failed".into(),
            playable_id: None,
        })?;
    if response.status().is_redirection() {
        return Err(EnrichmentDiagnostic {
            code: "AssetRedirectRejected",
            message: "SteamGridDB asset redirects are not followed".into(),
            playable_id: None,
        });
    }
    if !response.status().is_success() {
        return Err(EnrichmentDiagnostic {
            code: "AssetDownloadFailed",
            message: "asset download failed".into(),
            playable_id: None,
        });
    }
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes)
    {
        return Err(EnrichmentDiagnostic {
            code: "AssetTooLarge",
            message: "asset bytes exceed the configured limit".into(),
            playable_id: None,
        });
    }
    let mut bytes = Vec::new();
    let mut hasher = Sha256::new();
    let mut chunk = [0u8; 8192];
    loop {
        let read = response
            .read(&mut chunk)
            .map_err(|_| EnrichmentDiagnostic {
                code: "AssetDownloadFailed",
                message: "asset download failed".into(),
                playable_id: None,
            })?;
        if read == 0 {
            break;
        }
        hasher.update(&chunk[..read]);
        bytes.extend_from_slice(&chunk[..read]);
        if bytes.len() as u64 > max_bytes {
            return Err(EnrichmentDiagnostic {
                code: "AssetTooLarge",
                message: "asset bytes exceed the configured limit".into(),
                playable_id: None,
            });
        }
    }
    let _sha256 = hasher.finalize();
    Ok(bytes)
}

fn resolve_public_address(host: &str, port: u16) -> Result<SocketAddr, EnrichmentDiagnostic> {
    let mut seen = BTreeSet::new();
    let addrs = (host, port)
        .to_socket_addrs()
        .map_err(|_| EnrichmentDiagnostic {
            code: "AssetUrlRejected",
            message: "asset host could not be resolved".into(),
            playable_id: None,
        })?;
    for addr in addrs {
        if seen.insert(addr.ip()) && is_public_ip(addr.ip()) {
            return Ok(addr);
        }
    }
    Err(EnrichmentDiagnostic {
        code: "AssetUrlRejected",
        message: "asset host resolved to a private address".into(),
        playable_id: None,
    })
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            !(ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_unspecified()
                || ip.is_multicast()
                || ip.octets()[0] == 0)
        }
        IpAddr::V6(ip) => {
            !(ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || (ip.segments()[0] & 0xfe00) == 0xfc00
                || (ip.segments()[0] & 0xffc0) == 0xfe80)
        }
    }
}

fn api_client(base: &Url) -> Result<Client, EnrichmentDiagnostic> {
    let local_test_base = base
        .host_str()
        .is_some_and(|host| host == "127.0.0.1" || host == "localhost" || host == "[::1]");
    if base.scheme() != "https" && !local_test_base {
        return Err(EnrichmentDiagnostic {
            code: "SteamGridDbConfigurationInvalid",
            message: "SteamGridDB API URL must use HTTPS".into(),
            playable_id: None,
        });
    }
    Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| EnrichmentDiagnostic {
            code: "SteamGridDbClientUnavailable",
            message: "SteamGridDB client could not be created".into(),
            playable_id: None,
        })
}

fn url_path_segment(value: &str) -> String {
    value.replace('/', " ").replace('?', " ")
}

fn with_game(mut diagnostic: EnrichmentDiagnostic, playable_id: &str) -> EnrichmentDiagnostic {
    diagnostic.playable_id = Some(playable_id.to_owned());
    diagnostic
}

fn asset_diagnostic(error: AssetError, playable_id: &str) -> EnrichmentDiagnostic {
    let code = match error {
        AssetError::Oversized => "AssetTooLarge",
        AssetError::Unsupported => "AssetUnsupported",
        AssetError::Malformed => "AssetMalformed",
        AssetError::UnsafeDimensions => "AssetUnsafeDimensions",
        AssetError::InconsistentDimensions => "AssetInconsistentDimensions",
        AssetError::Storage => "AssetStorageUnavailable",
    };
    EnrichmentDiagnostic {
        code,
        message: error.to_string(),
        playable_id: Some(playable_id.to_owned()),
    }
}

fn storage_diagnostic(_error: std::io::Error) -> EnrichmentDiagnostic {
    EnrichmentDiagnostic {
        code: "EnrichmentStateUnavailable",
        message: "enrichment state is unavailable".into(),
        playable_id: None,
    }
}

fn attempt_state_path(private_root: &Path) -> PathBuf {
    private_root.join(STATE_DIR).join(ATTEMPTS_FILE)
}

fn read_attempt_state(private_root: &Path) -> Result<AttemptState, std::io::Error> {
    let path = attempt_state_path(private_root);
    match std::fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(std::io::Error::other),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(AttemptState::default()),
        Err(error) => Err(error),
    }
}

fn write_attempt_state(private_root: &Path, state: &AttemptState) -> Result<(), std::io::Error> {
    let path = attempt_state_path(private_root);
    let parent = path.parent().expect("attempt state has parent");
    std::fs::create_dir_all(parent)?;
    let temporary = parent.join(format!(".attempts.{}.tmp", rand::random::<u64>()));
    let bytes = serde_json::to_vec_pretty(state).map_err(std::io::Error::other)?;
    std::fs::write(&temporary, bytes)?;
    std::fs::rename(temporary, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{config::settings, discovery::reconcile::DiscoveryCoordinator};
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::{Arc, Mutex},
        thread,
    };

    fn discovery_options() -> discovery::DiscoveryOptions {
        discovery::DiscoveryOptions {
            first_seen_at: "2026-08-05T00:00:00Z".into(),
            max_diagnostics: 100,
            max_candidates: 100,
            ..discovery::DiscoveryOptions::default()
        }
    }

    fn api_server(
        responses: Vec<&'static str>,
    ) -> (Url, Arc<Mutex<Vec<String>>>, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = Url::parse(&format!(
            "http://{}/api/v2/",
            listener.local_addr().unwrap()
        ))
        .unwrap();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let captured = requests.clone();
        let responses = Arc::new(Mutex::new(responses));
        let handle = thread::spawn(move || {
            while !responses.lock().unwrap().is_empty() {
                let (mut stream, _) = listener.accept().unwrap();
                let mut buffer = [0u8; 4096];
                let read = stream.read(&mut buffer).unwrap();
                captured
                    .lock()
                    .unwrap()
                    .push(String::from_utf8_lossy(&buffer[..read]).into_owned());
                let response = responses.lock().unwrap().remove(0);
                stream.write_all(response.as_bytes()).unwrap();
            }
        });
        (base, requests, handle)
    }

    fn options_with_base(base: Url, batch_limit: usize) -> EnrichmentOptions {
        EnrichmentOptions {
            api_base_url: base,
            batch_limit,
            retry_limit: 0,
            max_image_bytes: 1024,
            retry_after_delay: Arc::new(|_| {}),
        }
    }

    #[test]
    fn exact_match_requires_one_verified_normalized_result() {
        let query = title::normalized_match_name("Wario Land 4");
        assert!(matches!(
            exact_verified_match(
                &query,
                &[SearchGame {
                    id: 1,
                    name: "Wario Land 4".into(),
                    verified: true
                }]
            ),
            MatchDecision::Accepted(_)
        ));
        assert_eq!(
            exact_verified_match(
                &query,
                &[SearchGame {
                    id: 1,
                    name: "Wario Land 4".into(),
                    verified: false
                }]
            ),
            MatchDecision::Unverified
        );
        assert_eq!(
            exact_verified_match(
                &query,
                &[
                    SearchGame {
                        id: 1,
                        name: "Wario Land 4".into(),
                        verified: true
                    },
                    SearchGame {
                        id: 2,
                        name: "Wario-Land 4".into(),
                        verified: true
                    },
                ]
            ),
            MatchDecision::Ambiguous
        );
        assert_eq!(
            exact_verified_match(
                &query,
                &[SearchGame {
                    id: 1,
                    name: "Wario Land".into(),
                    verified: true
                }]
            ),
            MatchDecision::NoMatch
        );
    }

    #[test]
    fn chooses_highest_ranked_static_safe_square_grid() {
        let grids = vec![
            Grid {
                id: 1,
                url: Url::parse("https://example.com/1.png").unwrap(),
                score: Some(100),
                width: Some(600),
                height: Some(900),
                nsfw: false,
                humor: false,
                epilepsy: false,
                style: None,
                kind: Some("static".into()),
            },
            Grid {
                id: 2,
                url: Url::parse("https://example.com/2.png").unwrap(),
                score: Some(10),
                width: Some(512),
                height: Some(512),
                nsfw: true,
                humor: false,
                epilepsy: false,
                style: None,
                kind: Some("static".into()),
            },
            Grid {
                id: 3,
                url: Url::parse("https://example.com/3.png").unwrap(),
                score: Some(50),
                width: Some(512),
                height: Some(512),
                nsfw: false,
                humor: false,
                epilepsy: false,
                style: None,
                kind: Some("static".into()),
            },
        ];
        assert_eq!(choose_grid(&grids).unwrap().id, 3);
    }

    #[test]
    fn rejects_private_asset_destinations_before_request() {
        let url = Url::parse("https://127.0.0.1/asset.png").unwrap();
        let error = download_image(&url, 1024).unwrap_err();
        assert_eq!(error.code, "AssetUrlRejected");
    }

    #[test]
    fn unauthorized_credential_stops_after_one_redacted_provider_error() {
        let readable = tempfile::tempdir().unwrap();
        let private = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("one.gba"), b"one").unwrap();
        std::fs::write(root.path().join("two.gba"), b"two").unwrap();
        DiscoveryCoordinator::new(readable.path(), private.path())
            .add_location(root.path(), &discovery_options())
            .unwrap();
        settings::set_steamgriddb_credential(private.path(), "secret-token-123").unwrap();
        let (base, requests, handle) = api_server(vec![
            "HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n",
        ]);

        let report = SteamGridDbEnricher::with_options(
            readable.path(),
            private.path(),
            Arc::new(Mutex::new(())),
            options_with_base(base, 10),
        )
        .run();
        handle.join().unwrap();

        assert_eq!(requests.lock().unwrap().len(), 1);
        assert_eq!(report.diagnostics.len(), 1);
        let rendered = format!("{:?}", report.diagnostics);
        assert!(!rendered.contains("secret-token-123"));
        assert!(!rendered.contains("Bearer"));
        assert_eq!(
            report.diagnostics[0].code,
            "SteamGridDbCredentialUnauthorized"
        );
    }

    #[test]
    fn finite_batch_attempts_no_matches_so_later_restart_resumes() {
        let readable = tempfile::tempdir().unwrap();
        let private = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("one.gba"), b"one").unwrap();
        std::fs::write(root.path().join("two.gba"), b"two").unwrap();
        DiscoveryCoordinator::new(readable.path(), private.path())
            .add_location(root.path(), &discovery_options())
            .unwrap();
        settings::set_steamgriddb_credential(private.path(), "secret-token-123").unwrap();
        let no_match = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{\"data\":[]}";
        let (base, requests, handle) = api_server(vec![no_match, no_match]);
        let options = options_with_base(base, 1);

        let first = SteamGridDbEnricher::with_options(
            readable.path(),
            private.path(),
            Arc::new(Mutex::new(())),
            options.clone(),
        )
        .run();
        let second = SteamGridDbEnricher::with_options(
            readable.path(),
            private.path(),
            Arc::new(Mutex::new(())),
            options,
        )
        .run();
        handle.join().unwrap();

        assert_eq!(first.attempted, 1);
        assert_eq!(second.attempted, 1);
        assert_eq!(requests.lock().unwrap().len(), 2);
    }
}
