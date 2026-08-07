use reqwest::{blocking::Client, header, redirect::Policy, StatusCode, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    cmp::Reverse,
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use crate::{
    config::settings,
    discovery::{self, title},
    game_assets::{AssetCandidate, AssetError, AssetOwnerIdentity, GameAssetRepository},
};

mod asset_download;

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
    #[cfg(test)]
    pub asset_download_policy: AssetDownloadPolicy,
}

#[cfg(test)]
#[derive(Clone)]
pub(crate) struct AssetDownloadPolicy {
    pub allow_http_loopback: bool,
    pub resolver: Arc<
        dyn Fn(&str, u16) -> Result<std::net::SocketAddr, EnrichmentDiagnostic>
            + Send
            + Sync
            + 'static,
    >,
    pub resolver_timeout: Duration,
}

#[cfg(test)]
impl Default for AssetDownloadPolicy {
    fn default() -> Self {
        Self {
            allow_http_loopback: false,
            resolver: Arc::new(asset_download::resolve_public_address),
            resolver_timeout: asset_download::ASSET_RESOLUTION_TIMEOUT,
        }
    }
}

#[cfg(test)]
impl std::fmt::Debug for AssetDownloadPolicy {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("AssetDownloadPolicy")
            .field("allow_http_loopback", &self.allow_http_loopback)
            .field("resolver_timeout", &self.resolver_timeout)
            .finish_non_exhaustive()
    }
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
            #[cfg(test)]
            asset_download_policy: AssetDownloadPolicy::default(),
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
    attempts: BTreeMap<String, AttemptRecord>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
struct AttemptRecord {
    outcome: AttemptOutcome,
    playable_id: String,
    release_id: String,
    release_fingerprint: String,
    rom_identity: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum AttemptOutcome {
    Assigned,
    NoMatch,
    Ambiguous,
    Unverified,
    Transient,
    Permanent,
    AssetRejected,
    Skipped,
}

fn attempt_key(game: &discovery::reconcile::DiscoveryOwnedGame) -> String {
    let mut hasher = Sha256::new();
    hasher.update(game.playable_id.as_bytes());
    hasher.update(b"\0");
    hasher.update(game.release_id.as_bytes());
    hasher.update(b"\0");
    hasher.update(game.release_fingerprint.as_bytes());
    hasher.update(b"\0");
    hasher.update(game.rom_identity.as_bytes());
    format!("sha256:{}", hex::encode(hasher.finalize()))
}

fn attempt_record(
    game: &discovery::reconcile::DiscoveryOwnedGame,
    outcome: AttemptOutcome,
) -> AttemptRecord {
    AttemptRecord {
        outcome,
        playable_id: game.playable_id.clone(),
        release_id: game.release_id.clone(),
        release_fingerprint: game.release_fingerprint.clone(),
        rom_identity: game.rom_identity.clone(),
    }
}

fn owner_identity(game: &discovery::reconcile::DiscoveryOwnedGame) -> AssetOwnerIdentity {
    AssetOwnerIdentity {
        playable_id: game.playable_id.clone(),
        release_id: game.release_id.clone(),
        release_fingerprint: game.release_fingerprint.clone(),
        rom_identity: game.rom_identity.clone(),
    }
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
        let _guard = self
            .write_lock
            .lock()
            .expect("discovery write lock poisoned");
        let mut state = read_attempt_state(&self.private_root).map_err(storage_diagnostic)?;
        state
            .attempts
            .retain(|_, record| !matches!(record.outcome, AttemptOutcome::Transient));
        write_attempt_state(&self.private_root, &state).map_err(storage_diagnostic)
    }

    pub(crate) fn clear_non_assigned_attempts(
        private_root: impl AsRef<Path>,
    ) -> Result<(), EnrichmentDiagnostic> {
        let mut state = read_attempt_state(private_root.as_ref()).map_err(storage_diagnostic)?;
        state
            .attempts
            .retain(|_, record| matches!(record.outcome, AttemptOutcome::Assigned));
        write_attempt_state(private_root.as_ref(), &state).map_err(storage_diagnostic)
    }

    pub(crate) fn run(&self) -> EnrichmentReport {
        let (token, attempts) = {
            let _guard = self
                .write_lock
                .lock()
                .expect("discovery write lock poisoned");
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
            let attempts = match read_attempt_state(&self.private_root) {
                Ok(state) => state,
                Err(error) => {
                    return EnrichmentReport {
                        diagnostics: vec![storage_diagnostic(error)],
                        ..EnrichmentReport::default()
                    };
                }
            };
            (token, attempts)
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
            .filter(|game| !attempts.attempts.contains_key(&attempt_key(game)))
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
            let record = match result {
                Ok(AttemptOutcome::Assigned) => {
                    report.assigned += 1;
                    Some(attempt_record(&game, AttemptOutcome::Assigned))
                }
                Ok(AttemptOutcome::Skipped) => None,
                Ok(outcome) => Some(attempt_record(&game, outcome)),
                Err(ProviderStop::Unauthorized(diagnostic)) => {
                    report.diagnostics.push(diagnostic);
                    break;
                }
                Err(ProviderStop::Diagnostic(diagnostic, outcome)) => {
                    report.diagnostics.push(diagnostic);
                    Some(attempt_record(&game, outcome))
                }
            };
            let Some(record) = record else {
                continue;
            };
            match self.record_attempt_if_credential_current(&token, attempt_key(&game), record) {
                Ok(true) => {}
                Ok(false) => break,
                Err(diagnostic) => {
                    report.diagnostics.push(diagnostic);
                    break;
                }
            }
        }
        report
    }

    fn download_image(&self, url: &Url) -> Result<Vec<u8>, EnrichmentDiagnostic> {
        #[cfg(test)]
        {
            return asset_download::download_image_with_policy(
                url,
                self.options.max_image_bytes,
                &self.options.asset_download_policy,
            );
        }
        #[cfg(not(test))]
        {
            asset_download::download_image(url, self.options.max_image_bytes)
        }
    }

    fn record_attempt_if_credential_current(
        &self,
        expected_token: &str,
        key: String,
        record: AttemptRecord,
    ) -> Result<bool, EnrichmentDiagnostic> {
        let _guard = self
            .write_lock
            .lock()
            .expect("discovery write lock poisoned");
        match settings::read_steamgriddb_credential(&self.private_root) {
            Ok(Some(token)) if token == expected_token => {}
            Ok(_) => return Ok(false),
            Err(_) => {
                return Err(EnrichmentDiagnostic {
                    code: "SteamGridDbCredentialUnavailable",
                    message: "SteamGridDB credential state is unavailable".into(),
                    playable_id: None,
                })
            }
        }
        let mut attempts = read_attempt_state(&self.private_root).map_err(storage_diagnostic)?;
        attempts.attempts.insert(key, record);
        write_attempt_state(&self.private_root, &attempts).map_err(storage_diagnostic)?;
        Ok(true)
    }

    fn enrich_one(
        &self,
        client: &Client,
        token: &str,
        asset_repo: &GameAssetRepository,
        game: &discovery::reconcile::DiscoveryOwnedGame,
    ) -> Result<AttemptOutcome, ProviderStop> {
        let query = title::normalized_match_name(&game.title);
        if asset_repo
            .matching_assignment(&owner_identity(game))
            .map_err(|error| {
                ProviderStop::Diagnostic(
                    asset_diagnostic(error, &game.playable_id),
                    AttemptOutcome::Transient,
                )
            })?
            .is_some()
        {
            return Ok(AttemptOutcome::Assigned);
        }
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
        let bytes = self.download_image(&grid.url).map_err(|diagnostic| {
            ProviderStop::Diagnostic(
                with_game(diagnostic, &game.playable_id),
                AttemptOutcome::Transient,
            )
        })?;
        if discovery::reconcile::current_owned_discovery_game(
            &self.readable_root,
            &self.private_root,
            game,
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
        })?
        .is_none()
        {
            return Ok(AttemptOutcome::Skipped);
        }
        let Some(updated_game) = discovery::reconcile::update_owned_discovery_title(
            &self.readable_root,
            &self.private_root,
            &self.write_lock,
            game,
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
        })?
        else {
            return Ok(AttemptOutcome::Skipped);
        };
        let _assignment_guard = self
            .write_lock
            .lock()
            .expect("discovery write lock poisoned");
        let Some(current_game) = discovery::reconcile::current_owned_discovery_game(
            &self.readable_root,
            &self.private_root,
            &updated_game,
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
        })?
        else {
            return Ok(AttemptOutcome::Skipped);
        };
        asset_repo
            .assign_tile(
                owner_identity(&current_game),
                AssetCandidate {
                    bytes,
                    declared_width: None,
                    declared_height: None,
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
                let (code, outcome) = match error {
                    RequestFailure::Permanent(_) => {
                        ("SteamGridDbPermanentFailure", AttemptOutcome::Permanent)
                    }
                    _ => ("SteamGridDbTransientFailure", AttemptOutcome::Transient),
                };
                return Err(ProviderStop::Diagnostic(
                    EnrichmentDiagnostic {
                        code,
                        message: error.sanitized_message(),
                        playable_id: Some(game.playable_id.clone()),
                    },
                    outcome,
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
    tags: Vec<String>,
    #[serde(default)]
    style: Option<String>,
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
        .query(&[
            ("dimensions", "512x512"),
            ("types", "static"),
            ("styles", "alternate,blurred,material,no_logo"),
        ])
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

fn safe_grid_tags(tags: &[String]) -> bool {
    !tags.iter().any(|tag| {
        let normalized = tag.to_ascii_lowercase();
        normalized == "nsfw" || normalized == "humor" || normalized == "epilepsy"
    })
}

fn choose_grid(grids: &[Grid]) -> Option<Grid> {
    let mut safe: Vec<_> = grids
        .iter()
        .filter(|grid| safe_grid_tags(&grid.tags))
        .filter(|grid| {
            grid.style.as_deref().is_none_or(|style| {
                style == "alternate"
                    || style == "blurred"
                    || style == "material"
                    || style == "white"
                    || style == "black"
            })
        })
        .cloned()
        .collect();
    safe.sort_by_key(|grid| Reverse(grid.score.unwrap_or(0)));
    safe.into_iter().next()
}

fn api_client(base: &Url) -> Result<Client, EnrichmentDiagnostic> {
    let local_test_base = base
        .host_str()
        .is_some_and(|host| host == "127.0.0.1" || host == "localhost" || host == "::1");
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
mod tests;
