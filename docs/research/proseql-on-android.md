# proseQL (Rust) on Android — spike findings, 2026-07-30

Run while the TypeScript→Rust conversion is still in flight, so the findings can
shape it rather than require rework. Tested against
`proseql` branch `refactor-rust-engine-conversion` at `807bd87`, copied out of
the worktree (read-only — that tree has uncommitted work).

Device: SM-F966U1, Android 16, aarch64.

## Verdict

proseQL's storage layer works on Android, on both filesystems, with no NDK
friction at all. The concern worth carrying forward is **not** correctness —
it is the **idle CPU cost of polling** a library-sized tree.

## 1. Cross-compilation: clean

`cargo ndk -t arm64-v8a` built `proseql-engine`, `proseql-formats`, and
`proseql-storage` first try, no patches, no bindgen, no sysroot fiddling. Every
dependency is pure Rust (serde, indexmap, globset, json5, jsonc-parser,
serde_yaml, toml, walkdir, notify), which is why. Contrast QuickJS, which
needed three separate build fixes to cross the same boundary.

Static probe binary including engine + storage + Rust std: 1,287,232 bytes.
proseQL's own contribution is a fraction of that. Embedding it in `libkorrid.so`
was not measured directly.

## 2. File watching works on shared storage — because it polls

I expected trouble here and was wrong in an interesting way. Android's shared
storage (`/sdcard`, `/storage/emulated/0`) is FUSE-backed, where inotify events
are unreliable or absent — and that is exactly where Korri's ROM library lives.

proseQL sidesteps this by using `notify::PollWatcher` **exclusively**
(`proseql-storage/src/fs.rs`). There is no `RecommendedWatcher` anywhere in the
tree. Polling is stat-based, so it works identically on FUSE.

Measured, both passing:

| Location | read/write/list | watch event |
|---|---|---|
| `/data/local/tmp` (native fs, like app-private) | OK | 50ms |
| `/sdcard` (FUSE, like the ROM library) | OK | 51ms |

## 3. The real cost: polling a library-sized tree

`watch_dir` is recursive, so watching a library re-stats every file every tick.
Idle cost (no changes happening at all), measured from `/proc/self/stat`:

| files | poll interval | CPU while idle |
|---|---|---|
| 500 | 250ms | 2.5% of one core |
| 2,000 | 250ms | **6.9% of one core** |
| 2,000 | 1s | 2.6% |
| 2,000 | 5s | 0.7% |

Cost scales roughly as `files ÷ interval`. Zero spurious events in every run,
so the watcher is accurate — just not free.

7% of a core burning forever on a handheld is a battery problem, not a
performance one. A 2,000-file library is a normal retro collection.

## Implications

**For Korri.** Do not point a default-interval recursive watch at the game
library. Options, in rough order of preference: watch on demand (foreground /
resume) rather than continuously; use a generous interval (seconds, not
milliseconds) for library trees; or keep library indexing on explicit refresh
and reserve watching for small config files where latency matters.

**For proseQL, while the conversion is open.** Two things worth considering
now rather than later:

1. **Per-source poll intervals as a first-class concern.** The interval is
   already a constructor argument, but callers need to be nudged toward
   choosing it deliberately — the difference between 250ms and 5s is 10× the
   idle battery draw.
2. **Native watcher where it is free, polling where it is required.** Polling
   is the correct default for Android shared storage, but on Linux hosts (zao)
   inotify would deliver the same events at ~zero idle cost. A
   "recommended-with-poll-fallback" strategy would make desktop peers cheaper
   without giving up Android correctness. Today every platform pays the polling
   price because `PollWatcher` is unconditional.

Neither is a defect. Both are cheaper to decide now than after the conversion
lands.

## Not established

- Size delta of embedding proseQL into `libkorrid.so` (probe was a standalone
  binary).
- Behaviour under Android doze / process suspension — a polling thread in a
  backgrounded app is exactly the thing Android throttles, and that interacts
  with the separate "korrid under Android lifecycle" question.
- Write throughput and fsync behaviour on FUSE, which is historically slow.
- Anything above the storage layer: query pipeline, subscriptions, and
  transactions were compiled but not exercised on device.

## Reproducing

Probe sources are throwaway and live outside both repos
(`/tmp/proseql-android-spike/proseql-android-probe`). They add a fifth member
to the workspace and use only `FsStorageHost` + the `StorageHost` trait, so
they will keep working as long as that trait is stable.
