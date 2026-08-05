use std::fs;

use korrid::{
    config::{resolver, snapshot::ConfigSnapshotCoordinator, Target},
    discovery::{DiscoveryCoordinator, DiscoveryDiagnosticCode, DiscoveryOptions},
    plugin_policy,
};

fn options() -> DiscoveryOptions {
    DiscoveryOptions {
        first_seen_at: "2026-08-05T00:00:00Z".into(),
        max_diagnostics: 100,
        max_candidates: 100,
    }
}

#[test]
fn selected_locations_scan_into_launch_resolvable_library_records() {
    let readable = tempfile::tempdir().unwrap();
    let private = tempfile::tempdir().unwrap();
    let first = tempfile::tempdir().unwrap();
    let second = tempfile::tempdir().unwrap();
    fs::write(first.path().join("Wario_Land_4 (USA).GBA"), b"wario").unwrap();
    fs::write(second.path().join("Pokémon - Emerald.gba"), b"emerald").unwrap();
    let discovery = DiscoveryCoordinator::new(readable.path(), private.path());

    discovery.add_location(first.path(), &options()).unwrap();
    let report = discovery.add_location(second.path(), &options()).unwrap();
    assert_eq!(report.scan.candidates.len(), 2);

    let state = ConfigSnapshotCoordinator::new(readable.path()).reload();
    assert!(state.diagnostic.is_none(), "{:?}", state.diagnostic);
    assert_eq!(state.snapshot.library.len(), 2);
    let registry = plugin_policy::registry_for_snapshot(&state.snapshot).unwrap();
    for id in state.snapshot.library.keys() {
        resolver::resolve_route(&state.snapshot, &registry, [], id).unwrap();
    }
}

#[test]
fn repeated_rescan_is_additive_and_uses_private_hash_cache() {
    let readable = tempfile::tempdir().unwrap();
    let private = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let rom = root.path().join("wl4.gba");
    fs::write(&rom, b"rom").unwrap();
    let discovery = DiscoveryCoordinator::new(readable.path(), private.path());

    discovery.add_location(root.path(), &options()).unwrap();
    let repeated = discovery.rescan(&options()).unwrap();
    assert_eq!(repeated.scan.hashed_bytes, 0);
    fs::remove_file(rom).unwrap();
    discovery.rescan(&options()).unwrap();

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
fn removing_location_deletes_only_owned_matching_payload_and_sweeps_remaining_roots() {
    let readable = tempfile::tempdir().unwrap();
    let private = tempfile::tempdir().unwrap();
    let first = tempfile::tempdir().unwrap();
    let second = tempfile::tempdir().unwrap();
    fs::write(first.path().join("same.gba"), b"same").unwrap();
    fs::write(second.path().join("same.gba"), b"same").unwrap();
    let discovery = DiscoveryCoordinator::new(readable.path(), private.path());

    let first_report = discovery.add_location(first.path(), &options()).unwrap();
    let duplicate_report = discovery.add_location(second.path(), &options()).unwrap();
    assert!(duplicate_report
        .scan
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == DiscoveryDiagnosticCode::ClaimConflict));

    discovery
        .remove_location(&first_report.storage_id.unwrap(), &options())
        .unwrap();
    let state = ConfigSnapshotCoordinator::new(readable.path()).reload();
    assert_eq!(state.snapshot.library.len(), 1);
    let release = &state.snapshot.library.values().next().unwrap().releases.0[0];
    assert!(matches!(
        release.target.as_ref().unwrap(),
        Target::File { storage, .. } if storage.0 != ""
    ));
}

#[test]
fn edited_generated_record_survives_location_removal() {
    let readable = tempfile::tempdir().unwrap();
    let private = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("wl4.gba"), b"rom").unwrap();
    let discovery = DiscoveryCoordinator::new(readable.path(), private.path());
    let added = discovery.add_location(root.path(), &options()).unwrap();
    let library = fs::read_to_string(readable.path().join("library.yaml"))
        .unwrap()
        .replace("title: wl4", "title: Hand Edited");
    fs::write(readable.path().join("library.yaml"), library).unwrap();

    discovery
        .remove_location(&added.storage_id.unwrap(), &options())
        .unwrap();

    let state = ConfigSnapshotCoordinator::new(readable.path()).reload();
    assert_eq!(state.snapshot.library.len(), 1);
    assert!(fs::read_to_string(readable.path().join("library.yaml"))
        .unwrap()
        .contains("Hand Edited"));
}
