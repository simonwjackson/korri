---
id: 01KYTCYSEFV28GZ1W6MRAZ32E8
slug: carry-proseql-on-android-polling-findings-into-the-rust-conv
title: Carry proseQL-on-Android polling findings into the Rust conversion
origin: parked
status: To Do
priority: high
labels:
  - proseql
  - android
  - performance
  - storage
  - cross-repo
created: 2026-07-30
source: se-work
---

# Carry proseQL-on-Android polling findings into the Rust conversion

## Why it matters

The proseQL Rust conversion is mid-flight, and two design inputs are far cheaper to act on now than after it lands. Measured on device (SM-F966U1, Android 16): proseQL cross-compiles to arm64 with zero friction and its PollWatcher works correctly on FUSE-backed shared storage — but a recursive watch over 2,000 files at the 250ms interval burns ~6.9% of one core continuously with no changes occurring. Cost scales as files ÷ interval. A 2,000-file library is an ordinary retro collection, and that is a battery drain on a handheld, not just a CPU cost. Separately, every platform currently pays the polling price because PollWatcher is unconditional, so Linux peers like zao burn CPU where inotify would be free. If the conversion finishes without these considered, Korri either ships a battery regression or has to work around the storage layer from outside.

## Acceptance Criteria

- [ ] proseQL exposes per-source poll intervals as a deliberate caller choice (documented tradeoff: 250ms vs 5s is ~10x idle draw)
- [ ] A decision is recorded on native-watcher-where-free vs polling-everywhere (inotify on Linux hosts, polling on Android/FUSE)
- [ ] Korri's eventual library indexing does not point a default-interval recursive watch at the game library — watch on resume, seconds-scale interval, or explicit refresh
- [ ] Findings filed into the proseQL repo's work item for the Rust engine conversion (01KYR2GFF49SRGMH4Q9MV1F2TS), which was not written to during the spike because its worktree had uncommitted work

## Related

- `docs/research/proseql-on-android.md`
- `services/korrid/SCRIPTING.md`

## Notes

Full measurements and reproduction steps in docs/research/proseql-on-android.md (committed 36eeecc1). Probe sources are throwaway at /tmp/proseql-android-spike/proseql-android-probe and will not survive a reboot — they use only FsStorageHost + the StorageHost trait, so they are quick to recreate. Time-sensitive: value drops sharply once the conversion lands. Unmeasured and still open: size delta of embedding proseQL into libkorrid.so, behaviour under Android doze (a polling thread in a backgrounded app is exactly what Android throttles), and FUSE write/fsync throughput.
