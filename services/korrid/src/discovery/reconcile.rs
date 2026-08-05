use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_yaml::{Mapping, Value};
use sha2::{Digest, Sha256};

use crate::{
    config::{
        self,
        resolver::{self, ResolvedFileTarget},
        snapshot::{CONFIG_FILE_NAME, LIBRARY_FILE_NAME},
        Target,
    },
    discovery::{
        scanner::{
            DiscoveryDiagnostic, DiscoveryDiagnosticCode, FolderScanner, HashCache, ScanCandidate,
            ScanReport, TraversalBudget,
        },
        title,
    },
    plugin_policy,
};

const PRIVATE_STATE_DIR: &str = "game-discovery";
const HASH_CACHE_FILE: &str = "hash-cache.json";
const OWNERSHIP_FILE: &str = "ownership.json";
const REPAIR_FILE: &str = "repair.json";
const DEFAULT_MAX_DIAGNOSTICS: usize = 1000;
const DEFAULT_MAX_CANDIDATES: usize = 10_000;
const DEFAULT_MAX_ENTRIES: usize = 100_000;
const DEFAULT_MAX_DIRECTORIES: usize = 10_000;
const DEFAULT_MAX_DEPTH: usize = 32;
const DEFAULT_MAX_SORTABLE_ENTRIES: usize = 10_000;

#[derive(Clone)]
pub struct DiscoveryCoordinator {
    readable_root: PathBuf,
    private_root: PathBuf,
    write_lock: Arc<Mutex<()>>,
    scan_lock: Arc<Mutex<()>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DiscoveryOptions {
    pub first_seen_at: String,
    pub max_diagnostics: usize,
    pub max_candidates: usize,
    pub max_entries: usize,
    pub max_directories: usize,
    pub max_depth: usize,
    pub max_sortable_entries: usize,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct DiscoveryMutationReport {
    pub scan: ScanReport,
    pub added_library_records: usize,
    pub removed_library_records: usize,
    pub removed_releases: usize,
    pub storage_id: Option<String>,
    pub repaired: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum DiscoveryError {
    #[error("discovery configuration changed outside Korri; reload and try again")]
    Conflict,
    #[error("invalid discovery input: {0}")]
    Invalid(String),
    #[error("discovery storage: {0}")]
    Storage(String),
    #[error("discovery candidate: {0}")]
    Candidate(String),
}

impl Default for DiscoveryOptions {
    fn default() -> Self {
        let seconds = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or_default();
        Self {
            first_seen_at: format!("unix:{seconds}"),
            max_diagnostics: DEFAULT_MAX_DIAGNOSTICS,
            max_candidates: DEFAULT_MAX_CANDIDATES,
            max_entries: DEFAULT_MAX_ENTRIES,
            max_directories: DEFAULT_MAX_DIRECTORIES,
            max_depth: DEFAULT_MAX_DEPTH,
            max_sortable_entries: DEFAULT_MAX_SORTABLE_ENTRIES,
        }
    }
}

impl DiscoveryCoordinator {
    pub fn new(readable_root: impl AsRef<Path>, private_root: impl AsRef<Path>) -> Self {
        Self::with_write_lock(readable_root, private_root, Arc::new(Mutex::new(())))
    }

    pub fn with_write_lock(
        readable_root: impl AsRef<Path>,
        private_root: impl AsRef<Path>,
        write_lock: Arc<Mutex<()>>,
    ) -> Self {
        Self {
            readable_root: readable_root.as_ref().to_owned(),
            private_root: private_root.as_ref().to_owned(),
            write_lock,
            scan_lock: Arc::new(Mutex::new(())),
        }
    }

    pub fn add_location(
        &self,
        selected_root: impl AsRef<Path>,
        options: &DiscoveryOptions,
    ) -> Result<DiscoveryMutationReport, DiscoveryError> {
        let _guard = self
            .write_lock
            .lock()
            .expect("discovery write lock poisoned");
        ensure_fixed_files(&self.readable_root)?;
        let canonical_root = canonical_directory(selected_root.as_ref())?;
        let mut config_yaml = read_fixed(&self.readable_root, CONFIG_FILE_NAME)?;
        let library_yaml = read_fixed(&self.readable_root, LIBRARY_FILE_NAME)?;
        let expected_revision = revision(&config_yaml);
        let mut document = parse_mapping(&config_yaml)?;
        let mut private = PrivateState::read(&self.private_root)?;
        let storage_id = storage_id_for_root(&canonical_root, &document, &private);
        let record = set_storage_record(&mut document, &storage_id, &canonical_root)?;
        private.remember_owned_storage(&storage_id, &canonical_root, &record);
        private.repair.pending_scans.insert(storage_id.clone());
        private.write(&self.private_root)?;
        config_yaml = serialize_mapping(document)?;
        validate_pair(&config_yaml, &library_yaml)?;
        write_atomically(
            &self.readable_root.join(CONFIG_FILE_NAME),
            config_yaml.as_bytes(),
            &expected_revision,
        )?;
        drop(_guard);

        let mut report = self.rescan(options)?;
        report.storage_id = Some(storage_id);
        Ok(report)
    }

    pub fn remove_location(
        &self,
        storage_id: &str,
        options: &DiscoveryOptions,
    ) -> Result<DiscoveryMutationReport, DiscoveryError> {
        let _guard = self
            .write_lock
            .lock()
            .expect("discovery write lock poisoned");
        ensure_fixed_files(&self.readable_root)?;
        let mut private = PrivateState::read(&self.private_root)?;
        private
            .repair
            .pending_removals
            .insert(storage_id.to_owned());
        private.write(&self.private_root)?;

        private.storage_order.retain(|id| id != storage_id);
        private.write(&self.private_root)?;
        drop(_guard);

        let mut report = self.rescan(options)?;
        report.storage_id = Some(storage_id.to_owned());
        Ok(report)
    }

    pub fn rescan(
        &self,
        options: &DiscoveryOptions,
    ) -> Result<DiscoveryMutationReport, DiscoveryError> {
        let mut report = DiscoveryMutationReport::default();
        let (config_revision, library_revision, registry, storages, mut hash_cache) = {
            let _guard = self
                .write_lock
                .lock()
                .expect("discovery write lock poisoned");
            ensure_fixed_files(&self.readable_root)?;
            let mut private = PrivateState::read(&self.private_root)?;
            let mut config_yaml = read_fixed(&self.readable_root, CONFIG_FILE_NAME)?;
            let mut library_yaml = read_fixed(&self.readable_root, LIBRARY_FILE_NAME)?;
            let mut repaired = apply_pending_ownership(&library_yaml, &mut private)?;

            if !private.repair.pending_removals.is_empty() {
                let removals: Vec<String> =
                    private.repair.pending_removals.iter().cloned().collect();
                let cleanup = cleanup_removed_storages(
                    &self.readable_root,
                    &config_yaml,
                    &library_yaml,
                    &mut private,
                    &removals,
                )?;
                report.removed_library_records += cleanup.removed_items;
                report.removed_releases += cleanup.removed_releases;
                repaired |= cleanup.changed;
                library_yaml = read_fixed(&self.readable_root, LIBRARY_FILE_NAME)?;

                let storage_cleanup = cleanup_removed_storage_records(
                    &self.readable_root,
                    &config_yaml,
                    &library_yaml,
                    &mut private,
                    &removals,
                )?;
                repaired |= storage_cleanup.changed;
                if storage_cleanup.changed {
                    config_yaml = read_fixed(&self.readable_root, CONFIG_FILE_NAME)?;
                }
                for storage_id in removals {
                    private.repair.pending_removals.remove(&storage_id);
                }
            }

            if repaired {
                report.repaired = true;
            }
            private.write(&self.private_root)?;
            let snapshot = validate_pair(&config_yaml, &library_yaml)?;
            let registry = plugin_policy::registry_for_snapshot(&snapshot)
                .map_err(|error| DiscoveryError::Candidate(error.to_string()))?;
            let config_doc = parse_mapping(&config_yaml)?;
            (
                revision(&config_yaml),
                revision(&library_yaml),
                registry,
                ordered_storages(&snapshot, &config_doc, &private),
                private.hash_cache.clone(),
            )
        };

        let _scan_guard = self.scan_lock.lock().expect("discovery scan lock poisoned");
        let scanner = FolderScanner::with_budget(
            &registry,
            options.max_diagnostics,
            options.max_candidates,
            TraversalBudget {
                max_entries: options.max_entries,
                max_directories: options.max_directories,
                max_depth: options.max_depth,
                max_sortable_entries: options.max_sortable_entries,
            },
        );
        let mut scan = scanner.scan(&storages, &mut hash_cache);
        append_dedupe_diagnostics(&mut scan, options.max_diagnostics);
        drop(_scan_guard);

        let _guard = self
            .write_lock
            .lock()
            .expect("discovery write lock poisoned");
        let mut private = PrivateState::read(&self.private_root)?;
        private.hash_cache = hash_cache;
        let config_yaml = read_fixed(&self.readable_root, CONFIG_FILE_NAME)?;
        let library_yaml = read_fixed(&self.readable_root, LIBRARY_FILE_NAME)?;
        apply_pending_ownership(&library_yaml, &mut private)?;
        if revision(&config_yaml) != config_revision || revision(&library_yaml) != library_revision
        {
            private.write(&self.private_root)?;
            return Err(DiscoveryError::Conflict);
        }
        let reconciliation = reconcile_candidates(
            &self.readable_root,
            &self.private_root,
            &config_yaml,
            &library_yaml,
            &mut private,
            &scan.candidates,
            options,
        )?;
        report.added_library_records += reconciliation.added_items;
        report.removed_library_records += reconciliation.removed_items;
        report.removed_releases += reconciliation.removed_releases;
        report.scan = scan;
        private.repair.pending_scans.clear();
        private.write(&self.private_root)?;
        Ok(report)
    }
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
struct PrivateState {
    #[serde(default)]
    hash_cache: HashCache,
    #[serde(default)]
    ownership: OwnershipJournal,
    #[serde(default)]
    storage_ownership: StorageOwnershipJournal,
    #[serde(default)]
    repair: RepairJournal,
    #[serde(default)]
    storage_order: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
struct OwnershipJournal {
    #[serde(default)]
    releases: BTreeMap<String, OwnedRelease>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
struct StorageOwnershipJournal {
    #[serde(default)]
    storages: BTreeMap<String, OwnedStorage>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
struct OwnedStorage {
    root: String,
    fingerprint: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
struct OwnedRelease {
    storage_id: String,
    playable_id: String,
    release_id: String,
    fingerprint: String,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
struct RepairJournal {
    #[serde(default)]
    pending_removals: BTreeSet<String>,
    #[serde(default)]
    pending_scans: BTreeSet<String>,
    #[serde(default)]
    pending_ownership: BTreeMap<String, OwnedRelease>,
}

#[derive(Debug, Default)]
struct ReconcileStats {
    changed: bool,
    added_items: usize,
    removed_items: usize,
    removed_releases: usize,
}

impl PrivateState {
    fn read(root: &Path) -> Result<Self, DiscoveryError> {
        Ok(Self {
            hash_cache: read_json(&state_file(root, HASH_CACHE_FILE))?,
            ownership: read_json(&state_file(root, OWNERSHIP_FILE))?,
            storage_ownership: read_json(&state_file(root, "storage-ownership.json"))?,
            repair: read_json(&state_file(root, REPAIR_FILE))?,
            storage_order: read_json(&state_file(root, "storage-order.json"))?,
        })
    }

    fn write(&self, root: &Path) -> Result<(), DiscoveryError> {
        fs::create_dir_all(state_dir(root))
            .map_err(|error| DiscoveryError::Storage(error.to_string()))?;
        write_json_atomically(&state_file(root, HASH_CACHE_FILE), &self.hash_cache)?;
        write_json_atomically(&state_file(root, OWNERSHIP_FILE), &self.ownership)?;
        write_json_atomically(
            &state_file(root, "storage-ownership.json"),
            &self.storage_ownership,
        )?;
        write_json_atomically(&state_file(root, REPAIR_FILE), &self.repair)?;
        write_json_atomically(&state_file(root, "storage-order.json"), &self.storage_order)?;
        Ok(())
    }

    fn remember_storage(&mut self, storage_id: &str) {
        if !self.storage_order.iter().any(|id| id == storage_id) {
            self.storage_order.push(storage_id.to_owned());
        }
    }

    fn remember_owned_storage(&mut self, storage_id: &str, root: &Path, record: &Mapping) {
        self.remember_storage(storage_id);
        self.storage_ownership.storages.insert(
            storage_id.to_owned(),
            OwnedStorage {
                root: root.to_string_lossy().into_owned(),
                fingerprint: fingerprint_mapping(record),
            },
        );
    }

    fn storage_is_owned_current(&self, storage_id: &str, record: Option<&Mapping>) -> bool {
        let Some(owned) = self.storage_ownership.storages.get(storage_id) else {
            return false;
        };
        record.is_some_and(|record| owned.fingerprint == fingerprint_mapping(record))
    }

    fn is_owned_current(
        &self,
        playable_id: &str,
        item: &Mapping,
        storage_id: Option<&str>,
    ) -> bool {
        let releases = item_releases(item);
        releases.iter().any(|release| {
            let Some(release_id) = mapping_string(release, "id") else {
                return false;
            };
            let key = ownership_key(playable_id, &release_id);
            let Some(owned) = self.ownership.releases.get(&key) else {
                return false;
            };
            if storage_id.is_some_and(|id| owned.storage_id != id) {
                return false;
            }
            owned.fingerprint == fingerprint_item(item)
        })
    }
}

fn reconcile_candidates(
    root: &Path,
    private_root: &Path,
    config_yaml: &str,
    library_yaml: &str,
    private: &mut PrivateState,
    candidates: &[ScanCandidate],
    options: &DiscoveryOptions,
) -> Result<ReconcileStats, DiscoveryError> {
    let snapshot = validate_pair(config_yaml, library_yaml)?;
    let mut library_doc = parse_mapping(library_yaml)?;
    let library = mapping_at(&mut library_doc, "library")?;
    let mut stats = ReconcileStats::default();

    let mut generated_by_path = BTreeMap::<(String, String), (String, String)>::new();
    let mut generated_by_canonical = BTreeMap::<PathBuf, (String, String)>::new();
    let mut generated_by_hash = BTreeMap::<String, (String, String)>::new();
    let mut authored_by_path = BTreeMap::<(String, String), (String, String)>::new();
    let mut authored_by_canonical = BTreeMap::<PathBuf, (String, String)>::new();
    let mut authored_by_hash = BTreeMap::<String, (String, String)>::new();

    for (playable_id, item_payload) in &snapshot.library {
        let current_item = library
            .get(Value::String(playable_id.clone()))
            .and_then(Value::as_mapping)
            .cloned();
        let current_owned = current_item
            .as_ref()
            .is_some_and(|item| private.is_owned_current(playable_id, item, None));
        for release in &item_payload.releases.0 {
            let release_id = release.id.0.clone();
            if let Some(Target::File { storage, path, .. }) = &release.target {
                let key = (storage.0.clone(), path.0.clone());
                let canonical = release_canonical_path(&snapshot, &storage.0, &path.0);
                if current_owned {
                    generated_by_path.insert(key, (playable_id.clone(), release_id.clone()));
                    if let Some(canonical) = canonical {
                        generated_by_canonical
                            .insert(canonical, (playable_id.clone(), release_id.clone()));
                    }
                } else {
                    authored_by_path.insert(key, (playable_id.clone(), release_id.clone()));
                    if let Some(canonical) = canonical {
                        authored_by_canonical
                            .insert(canonical, (playable_id.clone(), release_id.clone()));
                    }
                }
            }
            if let Some(identity) = &release.identity {
                let hash = identity.value.0.clone();
                if current_owned {
                    generated_by_hash.insert(hash, (playable_id.clone(), release_id.clone()));
                } else {
                    authored_by_hash.insert(hash, (playable_id.clone(), release_id.clone()));
                }
            }
        }
    }

    let mut authored_reserved_canonical = BTreeSet::<PathBuf>::new();
    let mut authored_reserved_hashes = BTreeSet::<String>::new();
    for candidate in candidates {
        let path_key = (
            candidate.storage_id.clone(),
            candidate.relative_path.clone(),
        );
        let authored_match = authored_by_path.get(&path_key).cloned().or_else(|| {
            authored_by_canonical
                .get(&candidate.canonical_path)
                .cloned()
        });
        if let Some((playable_id, release_id)) = authored_match {
            if backfill_authored_identity(
                library,
                &playable_id,
                &release_id,
                &candidate.hash,
                private,
            )? {
                stats.changed = true;
            }
            authored_reserved_canonical.insert(candidate.canonical_path.clone());
            authored_reserved_hashes.insert(candidate.hash.clone());
        } else if authored_by_hash.contains_key(&candidate.hash) {
            authored_reserved_canonical.insert(candidate.canonical_path.clone());
            authored_reserved_hashes.insert(candidate.hash.clone());
        }
    }

    let mut generated_shadowed_by_authored = BTreeSet::<String>::new();
    for hash in &authored_reserved_hashes {
        if let Some((playable_id, _)) = generated_by_hash.get(hash) {
            generated_shadowed_by_authored.insert(playable_id.clone());
        }
    }
    for canonical in &authored_reserved_canonical {
        if let Some((playable_id, _)) = generated_by_canonical.get(canonical) {
            generated_shadowed_by_authored.insert(playable_id.clone());
        }
    }
    for playable_id in generated_shadowed_by_authored {
        if library.remove(Value::String(playable_id.clone())).is_some() {
            private
                .ownership
                .releases
                .retain(|_, owned| owned.playable_id != playable_id);
            stats.changed = true;
            stats.removed_items += 1;
            stats.removed_releases += 1;
        }
    }

    let mut claimed_canonical = BTreeSet::<PathBuf>::new();
    let mut claimed_hashes = BTreeSet::<String>::new();
    let mut assigned_ids = BTreeSet::<String>::new();
    let mut planned_ownership = BTreeMap::<String, OwnedRelease>::new();
    for candidate in candidates {
        if authored_reserved_canonical.contains(&candidate.canonical_path)
            || authored_reserved_hashes.contains(&candidate.hash)
        {
            continue;
        }
        if !claimed_canonical.insert(candidate.canonical_path.clone()) {
            continue;
        }
        if !claimed_hashes.insert(candidate.hash.clone()) {
            continue;
        }
        let path_key = (
            candidate.storage_id.clone(),
            candidate.relative_path.clone(),
        );
        let existing_generated = generated_by_path
            .get(&path_key)
            .cloned()
            .or_else(|| {
                generated_by_canonical
                    .get(&candidate.canonical_path)
                    .cloned()
            })
            .or_else(|| generated_by_hash.get(&candidate.hash).cloned());
        let (playable_id, release_id, was_existing) =
            if let Some((playable_id, release_id)) = existing_generated {
                (playable_id, release_id, true)
            } else {
                let id = allocate_playable_id(&candidate.title, library, &assigned_ids);
                let release = release_id_for_candidate(candidate);
                assigned_ids.insert(id.clone());
                (id, release, false)
            };
        let first_seen_at = existing_first_seen(library, &playable_id, &release_id)
            .unwrap_or_else(|| options.first_seen_at.clone());
        let item = generated_item(candidate, &playable_id, &release_id, &first_seen_at);
        let fingerprint = fingerprint_item(&item);
        let key = Value::String(playable_id.clone());
        let old = library.get(&key).cloned();
        let ownership = OwnedRelease {
            storage_id: candidate.storage_id.clone(),
            playable_id: playable_id.clone(),
            release_id: release_id.clone(),
            fingerprint,
        };
        if old.as_ref().and_then(Value::as_mapping) != Some(&item) {
            library.insert(key, Value::Mapping(item.clone()));
            planned_ownership.insert(ownership_key(&playable_id, &release_id), ownership);
            stats.changed = true;
            if !was_existing {
                stats.added_items += 1;
            }
        } else {
            private
                .ownership
                .releases
                .insert(ownership_key(&playable_id, &release_id), ownership);
        }
    }

    if stats.changed {
        for (key, ownership) in &planned_ownership {
            private
                .repair
                .pending_ownership
                .insert(key.clone(), ownership.clone());
        }
        private.write(private_root)?;
        let candidate_library = serialize_mapping(library_doc)?;
        validate_pair(config_yaml, &candidate_library)?;
        commit_library_atomically(root, config_yaml, library_yaml, &candidate_library)?;
        for (key, ownership) in planned_ownership {
            private.ownership.releases.insert(key.clone(), ownership);
            private.repair.pending_ownership.remove(&key);
        }
    }
    Ok(stats)
}

fn cleanup_removed_storages(
    root: &Path,
    config_yaml: &str,
    library_yaml: &str,
    private: &mut PrivateState,
    storage_ids: &[String],
) -> Result<ReconcileStats, DiscoveryError> {
    let mut library_doc = parse_mapping(library_yaml)?;
    let Some(library) = library_doc
        .get_mut(Value::String("library".into()))
        .and_then(Value::as_mapping_mut)
    else {
        return Ok(ReconcileStats::default());
    };
    let storage_ids: BTreeSet<&str> = storage_ids.iter().map(String::as_str).collect();
    let mut stats = ReconcileStats::default();
    let playable_ids: Vec<String> = library
        .keys()
        .filter_map(|key| key.as_str().map(str::to_owned))
        .collect();
    for playable_id in playable_ids {
        let key = Value::String(playable_id.clone());
        let Some(item) = library.get(&key).and_then(Value::as_mapping).cloned() else {
            continue;
        };
        if !private.is_owned_current(&playable_id, &item, None) {
            continue;
        }
        let owned_for_removed = item_releases(&item).iter().any(|release| {
            let Some(release_id) = mapping_string(release, "id") else {
                return false;
            };
            private
                .ownership
                .releases
                .get(&ownership_key(&playable_id, &release_id))
                .is_some_and(|owned| {
                    storage_ids.contains(owned.storage_id.as_str())
                        && owned.fingerprint == fingerprint_item(&item)
                })
        });
        if owned_for_removed {
            library.remove(&key);
            private
                .ownership
                .releases
                .retain(|_, owned| owned.playable_id != playable_id);
            stats.changed = true;
            stats.removed_items += 1;
            stats.removed_releases += 1;
        }
    }
    for storage_id in storage_ids {
        private.storage_order.retain(|id| id != storage_id);
    }
    if stats.changed {
        let candidate_library = serialize_mapping(library_doc)?;
        validate_pair(config_yaml, &candidate_library)?;
        commit_library_atomically(root, config_yaml, library_yaml, &candidate_library)?;
    }
    Ok(stats)
}

fn cleanup_removed_storage_records(
    root: &Path,
    config_yaml: &str,
    library_yaml: &str,
    private: &mut PrivateState,
    storage_ids: &[String],
) -> Result<ReconcileStats, DiscoveryError> {
    let mut config_doc = parse_mapping(config_yaml)?;
    let mut stats = ReconcileStats::default();
    for storage_id in storage_ids {
        let record = storage_record(&config_doc, storage_id);
        if !private.storage_is_owned_current(storage_id, record.as_ref()) {
            continue;
        }
        if library_references_storage(library_yaml, storage_id)? {
            continue;
        }
        remove_storage_record(&mut config_doc, storage_id)?;
        private.storage_ownership.storages.remove(storage_id);
        stats.changed = true;
    }
    if stats.changed {
        let candidate_config = serialize_mapping(config_doc)?;
        validate_pair(&candidate_config, library_yaml)?;
        write_atomically(
            &root.join(CONFIG_FILE_NAME),
            candidate_config.as_bytes(),
            &revision(config_yaml),
        )?;
    }
    Ok(stats)
}

fn backfill_authored_identity(
    library: &mut Mapping,
    playable_id: &str,
    release_id: &str,
    hash: &str,
    private: &PrivateState,
) -> Result<bool, DiscoveryError> {
    let Some(item) = library
        .get_mut(Value::String(playable_id.to_owned()))
        .and_then(Value::as_mapping_mut)
    else {
        return Ok(false);
    };
    if private.is_owned_current(playable_id, item, None) {
        return Ok(false);
    }
    for release in item_releases_mut(item) {
        if mapping_string(release, "id").as_deref() == Some(release_id)
            && !release.contains_key(Value::String("identity".into()))
        {
            release.insert(Value::String("identity".into()), identity_value(hash));
            return Ok(true);
        }
    }
    Ok(false)
}

fn generated_item(
    candidate: &ScanCandidate,
    playable_id: &str,
    release_id: &str,
    first_seen_at: &str,
) -> Mapping {
    let mut item = Mapping::new();
    item.insert(
        Value::String("title".into()),
        Value::String(candidate.title.clone()),
    );
    let mut release = Mapping::new();
    release.insert(Value::String("id".into()), Value::String(release_id.into()));
    release.insert(
        Value::String("system".into()),
        Value::String(candidate.system.clone()),
    );
    let mut target = Mapping::new();
    target.insert(Value::String("kind".into()), Value::String("file".into()));
    target.insert(
        Value::String("storage".into()),
        Value::String(candidate.storage_id.clone()),
    );
    target.insert(
        Value::String("path".into()),
        Value::String(candidate.relative_path.clone()),
    );
    let mut discovery = Mapping::new();
    discovery.insert(
        Value::String("first-seen-at".into()),
        Value::String(first_seen_at.into()),
    );
    target.insert(Value::String("discovery".into()), Value::Mapping(discovery));
    release.insert(Value::String("target".into()), Value::Mapping(target));
    release.insert(
        Value::String("identity".into()),
        identity_value(&candidate.hash),
    );
    let mut launch = Mapping::new();
    launch.insert(
        Value::String("use".into()),
        Value::String(candidate.launcher.clone()),
    );
    if let Some(runtime) = &candidate.runtime {
        launch.insert(
            Value::String("runtime".into()),
            Value::String(runtime.clone()),
        );
    }
    release.insert(Value::String("launch".into()), Value::Mapping(launch));
    item.insert(
        Value::String("releases".into()),
        Value::Sequence(vec![Value::Mapping(release)]),
    );

    // Validate the generated item's id shape while keeping the function pure.
    debug_assert!(!playable_id.is_empty());
    item
}

fn identity_value(hash: &str) -> Value {
    let mut identity = Mapping::new();
    identity.insert(Value::String("kind".into()), Value::String("hash".into()));
    identity.insert(Value::String("value".into()), Value::String(hash.into()));
    Value::Mapping(identity)
}

fn release_id_for_candidate(candidate: &ScanCandidate) -> String {
    let base = candidate
        .system
        .rsplit('/')
        .next()
        .unwrap_or(&candidate.system);
    title::slug_base(base)
}

fn allocate_playable_id(title: &str, library: &Mapping, assigned: &BTreeSet<String>) -> String {
    let base = title::slug_base(title);
    for suffix in 0..10_000u32 {
        let candidate = if suffix == 0 {
            base.clone()
        } else {
            format!("{base}-{}", suffix + 1)
        };
        if !library.contains_key(Value::String(candidate.clone())) && !assigned.contains(&candidate)
        {
            return candidate;
        }
    }
    format!(
        "{base}-{}",
        hex::encode(Sha256::digest(title.as_bytes()))[..8].to_owned()
    )
}

fn existing_first_seen(library: &Mapping, playable_id: &str, release_id: &str) -> Option<String> {
    let item = library
        .get(Value::String(playable_id.into()))?
        .as_mapping()?;
    for release in item_releases(item) {
        if mapping_string(&release, "id").as_deref() == Some(release_id) {
            return release
                .get(Value::String("target".into()))?
                .as_mapping()?
                .get(Value::String("discovery".into()))?
                .as_mapping()?
                .get(Value::String("first-seen-at".into()))?
                .as_str()
                .map(str::to_owned);
        }
    }
    None
}

fn append_dedupe_diagnostics(scan: &mut ScanReport, max_diagnostics: usize) {
    let mut canonical_seen = BTreeSet::new();
    let mut hash_seen = BTreeSet::new();
    let mut pending = Vec::new();
    for candidate in &scan.candidates {
        if !canonical_seen.insert(candidate.canonical_path.clone()) {
            pending.push(DiscoveryDiagnostic {
                code: DiscoveryDiagnosticCode::ClaimConflict,
                storage_id: Some(candidate.storage_id.clone()),
                path: Some(candidate.relative_path.clone()),
                message: "file overlaps an earlier selected folder and was not duplicated".into(),
            });
        } else if !hash_seen.insert(candidate.hash.clone()) {
            pending.push(DiscoveryDiagnostic {
                code: DiscoveryDiagnosticCode::ClaimConflict,
                storage_id: Some(candidate.storage_id.clone()),
                path: Some(candidate.relative_path.clone()),
                message:
                    "file content duplicates an earlier discovered game and was not duplicated"
                        .into(),
            });
        }
    }
    for diagnostic in pending {
        if scan.diagnostics.len() >= max_diagnostics {
            if !scan
                .diagnostics
                .iter()
                .any(|existing| existing.code == DiscoveryDiagnosticCode::DiagnosticLimitReached)
            {
                scan.diagnostics.push(DiscoveryDiagnostic {
                    code: DiscoveryDiagnosticCode::DiagnosticLimitReached,
                    storage_id: None,
                    path: None,
                    message: "additional discovery diagnostics were omitted".into(),
                });
            }
            break;
        }
        scan.diagnostics.push(diagnostic);
    }
}

fn ordered_storages(
    snapshot: &config::ConfigSnapshot,
    config_doc: &Mapping,
    private: &PrivateState,
) -> Vec<(String, PathBuf)> {
    let mut storages = Vec::new();
    for storage_id in &private.storage_order {
        let record = storage_record(config_doc, storage_id);
        if !private.storage_is_owned_current(storage_id, record.as_ref()) {
            continue;
        }
        if let Some(storage) = snapshot.storage.get(storage_id) {
            storages.push((storage_id.clone(), PathBuf::from(&storage.root.0)));
        }
    }
    storages
}

fn storage_id_for_root(root: &Path, config: &Mapping, private: &PrivateState) -> String {
    let storage = config
        .get(Value::String("storage".into()))
        .and_then(Value::as_mapping);
    if let Some(storage) = storage {
        for (key, value) in storage {
            let Some(key) = key.as_str() else {
                continue;
            };
            let Some(record) = value.as_mapping() else {
                continue;
            };
            if record
                .get(Value::String("root".into()))
                .and_then(Value::as_str)
                .is_some_and(|value| Path::new(value).canonicalize().ok().as_deref() == Some(root))
                && private.storage_is_owned_current(key, Some(record))
            {
                return key.to_owned();
            }
        }
    }
    let digest = hex::encode(Sha256::digest(root.to_string_lossy().as_bytes()));
    let base = format!("game-folder-{}", &digest[..12]);
    for suffix in 0..1000u32 {
        let candidate = if suffix == 0 {
            base.clone()
        } else {
            format!("{base}-{suffix}")
        };
        let exists_in_config =
            storage.is_some_and(|storage| storage.contains_key(Value::String(candidate.clone())));
        let exists_private = private.storage_order.iter().any(|id| id == &candidate);
        if !exists_in_config && !exists_private {
            return candidate;
        }
    }
    format!("game-folder-{}", &digest[..24])
}

fn set_storage_record(
    document: &mut Mapping,
    storage_id: &str,
    root: &Path,
) -> Result<Mapping, DiscoveryError> {
    let storage = mapping_at(document, "storage")?;
    let mut record = Mapping::new();
    record.insert(
        Value::String("root".into()),
        Value::String(root.to_string_lossy().into_owned()),
    );
    storage.insert(
        Value::String(storage_id.into()),
        Value::Mapping(record.clone()),
    );
    Ok(record)
}

fn remove_storage_record(document: &mut Mapping, storage_id: &str) -> Result<(), DiscoveryError> {
    if let Some(storage) = document
        .get_mut(Value::String("storage".into()))
        .and_then(Value::as_mapping_mut)
    {
        storage.remove(Value::String(storage_id.into()));
    }
    Ok(())
}

fn canonical_directory(path: &Path) -> Result<PathBuf, DiscoveryError> {
    let canonical = path
        .canonicalize()
        .map_err(|_| DiscoveryError::Invalid("selected folder is unavailable".into()))?;
    if !canonical.is_dir() {
        return Err(DiscoveryError::Invalid(
            "selected folder is not a directory".into(),
        ));
    }
    Ok(canonical)
}

fn ensure_fixed_files(root: &Path) -> Result<(), DiscoveryError> {
    fs::create_dir_all(root).map_err(|error| DiscoveryError::Storage(error.to_string()))?;
    for name in [CONFIG_FILE_NAME, LIBRARY_FILE_NAME] {
        let path = root.join(name);
        if !path.exists() {
            fs::write(path, b"{}\n").map_err(|error| DiscoveryError::Storage(error.to_string()))?;
        }
    }
    Ok(())
}

fn validate_pair(
    config_yaml: &str,
    library_yaml: &str,
) -> Result<config::ConfigSnapshot, DiscoveryError> {
    config::decode_config_pair(config_yaml, library_yaml)
        .map_err(|error| DiscoveryError::Candidate(error.to_string()))
}

fn parse_mapping(content: &str) -> Result<Mapping, DiscoveryError> {
    match serde_yaml::from_str::<Value>(content)
        .map_err(|error| DiscoveryError::Candidate(error.to_string()))?
    {
        Value::Null => Ok(Mapping::new()),
        Value::Mapping(mapping) => Ok(mapping),
        _ => Err(DiscoveryError::Invalid(
            "YAML document must contain a record".into(),
        )),
    }
}

fn serialize_mapping(document: Mapping) -> Result<String, DiscoveryError> {
    serde_yaml::to_string(&Value::Mapping(document))
        .map_err(|error| DiscoveryError::Candidate(error.to_string()))
}

fn mapping_at<'a>(parent: &'a mut Mapping, key: &str) -> Result<&'a mut Mapping, DiscoveryError> {
    let key = Value::String(key.into());
    if !parent.contains_key(&key) {
        parent.insert(key.clone(), Value::Mapping(Mapping::new()));
    }
    parent
        .get_mut(&key)
        .and_then(Value::as_mapping_mut)
        .ok_or_else(|| DiscoveryError::Invalid(format!("{key:?} must be a record")))
}

fn read_fixed(root: &Path, name: &str) -> Result<String, DiscoveryError> {
    fs::read_to_string(root.join(name)).map_err(|error| DiscoveryError::Storage(error.to_string()))
}

fn apply_pending_ownership(
    library_yaml: &str,
    private: &mut PrivateState,
) -> Result<bool, DiscoveryError> {
    if private.repair.pending_ownership.is_empty() {
        return Ok(false);
    }
    let library_doc = parse_mapping(library_yaml)?;
    let library = library_doc
        .get(Value::String("library".into()))
        .and_then(Value::as_mapping);
    let mut changed = false;
    let pending: Vec<(String, OwnedRelease)> = private
        .repair
        .pending_ownership
        .iter()
        .map(|(key, ownership)| (key.clone(), ownership.clone()))
        .collect();
    for (key, ownership) in pending {
        let matches = library
            .and_then(|library| library.get(Value::String(ownership.playable_id.clone())))
            .and_then(Value::as_mapping)
            .is_some_and(|item| fingerprint_item(item) == ownership.fingerprint);
        if matches {
            private.ownership.releases.insert(key.clone(), ownership);
        }
        private.repair.pending_ownership.remove(&key);
        changed = true;
    }
    Ok(changed)
}

fn release_canonical_path(
    snapshot: &config::ConfigSnapshot,
    storage_id: &str,
    relative_path: &str,
) -> Option<PathBuf> {
    let storage = snapshot.storage.get(storage_id)?;
    Path::new(&storage.root.0)
        .join(relative_path)
        .canonicalize()
        .ok()
}

fn library_references_storage(
    library_yaml: &str,
    storage_id: &str,
) -> Result<bool, DiscoveryError> {
    let library_doc = parse_mapping(library_yaml)?;
    Ok(library_doc
        .get(Value::String("library".into()))
        .and_then(Value::as_mapping)
        .into_iter()
        .flat_map(|library| library.values())
        .filter_map(Value::as_mapping)
        .flat_map(item_releases)
        .any(|release| {
            release
                .get(Value::String("target".into()))
                .and_then(Value::as_mapping)
                .and_then(|target| target.get(Value::String("storage".into())))
                .and_then(Value::as_str)
                == Some(storage_id)
        }))
}

fn storage_record(document: &Mapping, storage_id: &str) -> Option<Mapping> {
    document
        .get(Value::String("storage".into()))
        .and_then(Value::as_mapping)
        .and_then(|storage| storage.get(Value::String(storage_id.into())))
        .and_then(Value::as_mapping)
        .cloned()
}

fn commit_library_atomically(
    root: &Path,
    config_yaml: &str,
    library_yaml: &str,
    candidate_library: &str,
) -> Result<(), DiscoveryError> {
    let current_config = read_fixed(root, CONFIG_FILE_NAME)?;
    let current_library = read_fixed(root, LIBRARY_FILE_NAME)?;
    if revision(&current_config) != revision(config_yaml)
        || revision(&current_library) != revision(library_yaml)
    {
        return Err(DiscoveryError::Conflict);
    }
    validate_pair(&current_config, candidate_library)?;
    write_atomically(
        &root.join(LIBRARY_FILE_NAME),
        candidate_library.as_bytes(),
        &revision(&current_library),
    )
}

fn write_atomically(
    path: &Path,
    content: &[u8],
    expected_revision: &str,
) -> Result<(), DiscoveryError> {
    let parent = path
        .parent()
        .ok_or_else(|| DiscoveryError::Storage("config file has no parent".into()))?;
    let temporary = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("config"),
        hex::encode(rand::random::<[u8; 8]>())
    ));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| DiscoveryError::Storage(error.to_string()))?;
        file.write_all(content)
            .map_err(|error| DiscoveryError::Storage(error.to_string()))?;
        file.sync_all()
            .map_err(|error| DiscoveryError::Storage(error.to_string()))?;
        let current =
            fs::read_to_string(path).map_err(|error| DiscoveryError::Storage(error.to_string()))?;
        if revision(&current) != expected_revision {
            return Err(DiscoveryError::Conflict);
        }
        fs::rename(&temporary, path).map_err(|error| DiscoveryError::Storage(error.to_string()))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn revision(content: &str) -> String {
    hex::encode(Sha256::digest(content.as_bytes()))
}

fn state_dir(root: &Path) -> PathBuf {
    root.join(PRIVATE_STATE_DIR)
}

fn state_file(root: &Path, name: &str) -> PathBuf {
    state_dir(root).join(name)
}

fn read_json<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> Result<T, DiscoveryError> {
    if !path.exists() {
        return Ok(T::default());
    }
    let content =
        fs::read_to_string(path).map_err(|error| DiscoveryError::Storage(error.to_string()))?;
    serde_json::from_str(&content).map_err(|error| DiscoveryError::Candidate(error.to_string()))
}

fn write_json_atomically<T: Serialize>(path: &Path, value: &T) -> Result<(), DiscoveryError> {
    let parent = path
        .parent()
        .ok_or_else(|| DiscoveryError::Storage("private state file has no parent".into()))?;
    fs::create_dir_all(parent).map_err(|error| DiscoveryError::Storage(error.to_string()))?;
    let content =
        serde_json::to_vec(value).map_err(|error| DiscoveryError::Candidate(error.to_string()))?;
    let temporary = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("state"),
        hex::encode(rand::random::<[u8; 8]>())
    ));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| DiscoveryError::Storage(error.to_string()))?;
        file.write_all(&content)
            .map_err(|error| DiscoveryError::Storage(error.to_string()))?;
        file.sync_all()
            .map_err(|error| DiscoveryError::Storage(error.to_string()))?;
        fs::rename(&temporary, path).map_err(|error| DiscoveryError::Storage(error.to_string()))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn item_releases(item: &Mapping) -> Vec<Mapping> {
    item.get(Value::String("releases".into()))
        .and_then(Value::as_sequence)
        .into_iter()
        .flat_map(|sequence| sequence.iter())
        .filter_map(Value::as_mapping)
        .cloned()
        .collect()
}

fn item_releases_mut(item: &mut Mapping) -> Vec<&mut Mapping> {
    item.get_mut(Value::String("releases".into()))
        .and_then(Value::as_sequence_mut)
        .into_iter()
        .flat_map(|sequence| sequence.iter_mut())
        .filter_map(Value::as_mapping_mut)
        .collect()
}

fn mapping_string(mapping: &Mapping, key: &str) -> Option<String> {
    mapping
        .get(Value::String(key.into()))
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn fingerprint_item(item: &Mapping) -> String {
    fingerprint_mapping(item)
}

fn fingerprint_mapping(mapping: &Mapping) -> String {
    let bytes = serde_yaml::to_string(&Value::Mapping(mapping.clone())).unwrap_or_default();
    format!("sha256:{}", hex::encode(Sha256::digest(bytes.as_bytes())))
}

fn ownership_key(playable_id: &str, release_id: &str) -> String {
    format!("{playable_id}\n{release_id}")
}

#[allow(dead_code)]
fn route_is_resolvable(snapshot: &config::ConfigSnapshot, playable_id: &str) -> bool {
    plugin_policy::registry_for_snapshot(snapshot)
        .ok()
        .and_then(|registry| resolver::resolve_route(snapshot, &registry, [], playable_id).ok())
        .and_then(|route| {
            route.file_target.map(|target| ResolvedFileTarget {
                storage_id: target.storage_id,
                path: target.path,
            })
        })
        .is_some()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::snapshot::ConfigSnapshotCoordinator;
    use std::{
        thread,
        time::{Duration, Instant},
    };

    fn options() -> DiscoveryOptions {
        DiscoveryOptions {
            first_seen_at: "2026-08-05T00:00:00Z".into(),
            max_diagnostics: 100,
            max_candidates: 100,
            ..DiscoveryOptions::default()
        }
    }

    fn coordinator(readable: &Path, private: &Path) -> DiscoveryCoordinator {
        DiscoveryCoordinator::new(readable, private)
    }

    fn read_library(root: &Path) -> String {
        fs::read_to_string(root.join(LIBRARY_FILE_NAME)).unwrap()
    }

    #[test]
    fn pending_ownership_repairs_crash_after_library_commit_before_final_private_write() {
        let readable = tempfile::tempdir().unwrap();
        let private = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("wl4.gba"), b"rom").unwrap();
        let discovery = coordinator(readable.path(), private.path());
        let storage_id = discovery
            .add_location(root.path(), &options())
            .unwrap()
            .storage_id
            .unwrap();

        let mut private_state = PrivateState::read(private.path()).unwrap();
        private_state.repair.pending_ownership = private_state.ownership.releases.clone();
        private_state.ownership.releases.clear();
        private_state.write(private.path()).unwrap();

        discovery.remove_location(&storage_id, &options()).unwrap();

        let state = ConfigSnapshotCoordinator::new(readable.path()).reload();
        assert!(state.snapshot.library.is_empty());
        let private_state = PrivateState::read(private.path()).unwrap();
        assert!(private_state.repair.pending_ownership.is_empty());
    }

    #[test]
    fn stale_config_revision_rejects_library_commit() {
        let readable = tempfile::tempdir().unwrap();
        let private = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("one.gba"), b"one").unwrap();
        fs::write(root.path().join("two.gba"), b"two").unwrap();
        let discovery = coordinator(readable.path(), private.path());
        let added = discovery.add_location(root.path(), &options()).unwrap();
        let storage_id = added.storage_id.unwrap();
        let config_yaml = read_fixed(readable.path(), CONFIG_FILE_NAME).unwrap();
        let library_yaml = read_fixed(readable.path(), LIBRARY_FILE_NAME).unwrap();
        fs::write(root.path().join("three.gba"), b"tri").unwrap();
        fs::write(
            readable.path().join(CONFIG_FILE_NAME),
            format!("{config_yaml}\n# external edit during scan\n"),
        )
        .unwrap();
        let candidate = ScanCandidate {
            storage_rank: 0,
            storage_id,
            storage_root: root.path().canonicalize().unwrap(),
            canonical_path: root.path().join("three.gba").canonicalize().unwrap(),
            relative_path: "three.gba".into(),
            file_name: "three.gba".into(),
            extension: "gba".into(),
            title: "two".into(),
            hash: "sha256:cddd67830982a78cc83998c15c13e49e1cb6bea286c4507cb5510d9c6aba4ec3".into(),
            size: 3,
            claim_id: "@korri:mgba/gba".into(),
            system: "gba".into(),
            launcher: "@korri:retroarch/retroarch".into(),
            runtime: Some("@korri:mgba/mgba".into()),
        };
        let mut private_state = PrivateState::read(private.path()).unwrap();

        let result = reconcile_candidates(
            readable.path(),
            private.path(),
            &config_yaml,
            &library_yaml,
            &mut private_state,
            &[candidate],
            &options(),
        );

        assert!(
            matches!(result, Err(DiscoveryError::Conflict)),
            "{result:?}"
        );
    }

    #[test]
    fn scan_does_not_hold_yaml_write_lock_while_hashing() {
        let readable = tempfile::tempdir().unwrap();
        let private = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let rom = root.path().join("big.gba");
        fs::write(&rom, vec![7u8; 32 * 1024 * 1024]).unwrap();
        let lock = Arc::new(Mutex::new(()));
        let discovery =
            DiscoveryCoordinator::with_write_lock(readable.path(), private.path(), lock.clone());
        discovery.add_location(root.path(), &options()).unwrap();
        fs::write(&rom, vec![8u8; 32 * 1024 * 1024]).unwrap();
        let worker = {
            let discovery = discovery.clone();
            thread::spawn(move || discovery.rescan(&options()))
        };

        let deadline = Instant::now() + Duration::from_secs(5);
        let mut observed_unlocked = false;
        while Instant::now() < deadline {
            if let Ok(_guard) = lock.try_lock() {
                if !worker.is_finished() {
                    observed_unlocked = true;
                    break;
                }
            }
            thread::sleep(Duration::from_millis(10));
        }
        assert!(
            observed_unlocked,
            "write lock stayed held for the whole scan"
        );
        let report = worker.join().unwrap().unwrap();
        assert!(report.scan.hashed_bytes > 0);
    }

    #[test]
    fn adds_two_folders_as_launchable_schema_valid_games_and_reuses_hashes() {
        let readable = tempfile::tempdir().unwrap();
        let private = tempfile::tempdir().unwrap();
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        fs::write(first.path().join("Wario_Land_4 (USA).GBA"), b"wario").unwrap();
        fs::write(second.path().join("Pokémon - Emerald.gba"), b"emerald").unwrap();
        let discovery = coordinator(readable.path(), private.path());

        let one = discovery.add_location(first.path(), &options()).unwrap();
        assert_eq!(one.scan.candidates.len(), 1);
        let two = discovery.add_location(second.path(), &options()).unwrap();
        assert_eq!(two.scan.candidates.len(), 2);
        assert!(read_library(readable.path()).contains("Wario Land 4"));
        assert!(read_library(readable.path()).contains("Pokémon Emerald"));

        let state = ConfigSnapshotCoordinator::new(readable.path()).reload();
        assert!(state.diagnostic.is_none(), "{:?}", state.diagnostic);
        assert_eq!(state.snapshot.library.len(), 2);
        let registry = plugin_policy::registry_for_snapshot(&state.snapshot).unwrap();
        for id in state.snapshot.library.keys() {
            resolver::resolve_route(&state.snapshot, &registry, [], id).unwrap();
        }

        let repeated = discovery.rescan(&options()).unwrap();
        assert_eq!(repeated.scan.hashed_bytes, 0);
        assert_eq!(
            ConfigSnapshotCoordinator::new(readable.path())
                .reload()
                .snapshot
                .library
                .len(),
            2
        );
    }

    #[test]
    fn preserves_authored_entries_and_backfills_missing_identity_for_same_path() {
        let readable = tempfile::tempdir().unwrap();
        let private = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("wl4.gba"), b"rom").unwrap();
        fs::write(
            readable.path().join(CONFIG_FILE_NAME),
            format!(
                "storage:\n  selected:\n    root: {}\n",
                root.path().display()
            ),
        )
        .unwrap();
        fs::write(readable.path().join(LIBRARY_FILE_NAME), "library:\n  curated:\n    title: Curated Title\n    releases:\n      - id: gba\n        system: gba\n        target:\n          kind: file\n          storage: selected\n          path: wl4.gba\n        launch:\n          use: \"@korri:retroarch/retroarch\"\n          runtime: \"@korri:mgba/mgba\"\n").unwrap();

        coordinator(readable.path(), private.path())
            .add_location(root.path(), &options())
            .unwrap();
        let library = read_library(readable.path());
        assert!(library.contains("Curated Title"));
        assert!(library.contains("identity:"));
        assert_eq!(
            ConfigSnapshotCoordinator::new(readable.path())
                .reload()
                .snapshot
                .library
                .len(),
            1
        );
    }

    #[test]
    fn removes_only_fingerprint_matching_generated_records() {
        let readable = tempfile::tempdir().unwrap();
        let private = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("wl4.gba"), b"rom").unwrap();
        let discovery = coordinator(readable.path(), private.path());
        let add = discovery.add_location(root.path(), &options()).unwrap();
        let storage_id = add.storage_id.unwrap();
        let edited = read_library(readable.path()).replace("title: wl4", "title: Hand Edited");
        fs::write(readable.path().join(LIBRARY_FILE_NAME), edited).unwrap();

        discovery.remove_location(&storage_id, &options()).unwrap();
        let state = ConfigSnapshotCoordinator::new(readable.path()).reload();
        assert_eq!(
            state.snapshot.library.len(),
            1,
            "edited generated record survives as user-owned"
        );
        assert!(read_library(readable.path()).contains("Hand Edited"));
    }

    #[test]
    fn removes_unedited_generated_records_and_sweeps_remaining_roots() {
        let readable = tempfile::tempdir().unwrap();
        let private = tempfile::tempdir().unwrap();
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        fs::write(first.path().join("same.gba"), b"same-rom").unwrap();
        fs::write(second.path().join("same.gba"), b"same-rom").unwrap();
        let discovery = coordinator(readable.path(), private.path());
        let first_report = discovery.add_location(first.path(), &options()).unwrap();
        discovery.add_location(second.path(), &options()).unwrap();
        assert_eq!(
            ConfigSnapshotCoordinator::new(readable.path())
                .reload()
                .snapshot
                .library
                .len(),
            1
        );

        discovery
            .remove_location(&first_report.storage_id.unwrap(), &options())
            .unwrap();
        let state = ConfigSnapshotCoordinator::new(readable.path()).reload();
        assert_eq!(state.snapshot.library.len(), 1);
        let route = state.snapshot.library.values().next().unwrap().releases.0[0]
            .target
            .as_ref()
            .unwrap();
        assert!(matches!(route, Target::File { storage, .. } if storage.0 != ""));
    }

    #[test]
    fn non_ascii_and_colliding_titles_produce_stable_schema_safe_ids() {
        let readable = tempfile::tempdir().unwrap();
        let private = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("Pokémon.gba"), b"one").unwrap();
        fs::write(root.path().join("Pok mon.gba"), b"two").unwrap();

        coordinator(readable.path(), private.path())
            .add_location(root.path(), &options())
            .unwrap();
        let state = ConfigSnapshotCoordinator::new(readable.path()).reload();
        assert!(state.snapshot.library.contains_key("pok-mon"));
        assert!(state.snapshot.library.contains_key("pok-mon-2"));
        assert!(read_library(readable.path()).contains("Pokémon"));
    }

    #[test]
    fn ordinary_rescan_reports_missing_files_but_does_not_delete_generated_records() {
        let readable = tempfile::tempdir().unwrap();
        let private = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let rom = root.path().join("wl4.gba");
        fs::write(&rom, b"rom").unwrap();
        let discovery = coordinator(readable.path(), private.path());
        discovery.add_location(root.path(), &options()).unwrap();
        fs::remove_file(rom).unwrap();

        let report = discovery.rescan(&options()).unwrap();
        assert!(report.scan.candidates.is_empty());
        assert_eq!(
            ConfigSnapshotCoordinator::new(readable.path())
                .reload()
                .snapshot
                .library
                .len(),
            1
        );
    }

    #[test]
    fn duplicate_content_reports_a_bounded_diagnostic() {
        let readable = tempfile::tempdir().unwrap();
        let private = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("one.gba"), b"same").unwrap();
        fs::write(root.path().join("two.gba"), b"same").unwrap();

        let report = coordinator(readable.path(), private.path())
            .add_location(root.path(), &options())
            .unwrap();
        assert_eq!(
            ConfigSnapshotCoordinator::new(readable.path())
                .reload()
                .snapshot
                .library
                .len(),
            1
        );
        assert!(report
            .scan
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("duplicates an earlier")));
    }

    #[test]
    fn preserves_raw_decodable_fields_on_scanner_mutation() {
        let readable = tempfile::tempdir().unwrap();
        let private = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("wl4.gba"), b"rom").unwrap();
        fs::write(readable.path().join(CONFIG_FILE_NAME), format!("providers:\n  \"@local:source\":\n    title: Source\nstorage:\n  selected:\n    root: {}\n", root.path().display())).unwrap();
        fs::write(
            readable.path().join(LIBRARY_FILE_NAME),
            "collections:\n  favorites:\n    title: Favorites\nlibrary: {}\n",
        )
        .unwrap();

        coordinator(readable.path(), private.path())
            .rescan(&options())
            .unwrap();
        assert!(fs::read_to_string(readable.path().join(CONFIG_FILE_NAME))
            .unwrap()
            .contains("@local:source"));
        assert!(read_library(readable.path()).contains("favorites"));
    }

    #[test]
    fn cleanup_repairs_pending_location_removal_after_config_commit() {
        let readable = tempfile::tempdir().unwrap();
        let private = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("wl4.gba"), b"rom").unwrap();
        let discovery = coordinator(readable.path(), private.path());
        let add = discovery.add_location(root.path(), &options()).unwrap();
        let storage_id = add.storage_id.unwrap();
        let mut private_state = PrivateState::read(private.path()).unwrap();
        private_state
            .repair
            .pending_removals
            .insert(storage_id.clone());
        private_state.write(private.path()).unwrap();
        let config = fs::read_to_string(readable.path().join(CONFIG_FILE_NAME))
            .unwrap()
            .replace(
                &format!(
                    "  {storage_id}:\n    root: {}\n",
                    root.path().canonicalize().unwrap().display()
                ),
                "",
            );
        fs::write(readable.path().join(CONFIG_FILE_NAME), config).unwrap();

        let report = discovery.rescan(&options()).unwrap();
        assert!(report.repaired);
        assert!(ConfigSnapshotCoordinator::new(readable.path())
            .reload()
            .snapshot
            .library
            .is_empty());
    }

    #[test]
    fn final_rename_gate_rejects_external_library_edit() {
        let readable = tempfile::tempdir().unwrap();
        let path = readable.path().join(LIBRARY_FILE_NAME);
        fs::create_dir_all(readable.path()).unwrap();
        fs::write(&path, "library: {}\n").unwrap();
        let expected = revision("library: {}\n");
        fs::write(&path, "library:\n  outside:\n    title: Outside\n    releases:\n      - id: gba\n        system: gba\n").unwrap();

        let error = write_atomically(&path, b"library: {}\n", &expected).unwrap_err();
        assert!(matches!(error, DiscoveryError::Conflict));
        assert!(fs::read_to_string(path).unwrap().contains("outside"));
    }
}
