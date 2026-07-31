# Does korrid need a persistent config watcher? — 2026-07-30

proseQL is the config substrate, not a library store: legacy keeps twenty
record types in it — `host`, `launcher`, `runtime`, `storage`, `source`,
`preset`, `profile`, `play-log` and the rest — assembled from arbitrarily split
YAML into one logical tree. Korri already has a fragment of that model, spread
across `upstreams.json`, `host.toml` read in four places, and launcher tables
hardcoded in Rust.

Legacy watches those fragments. The question is whether korrid must.

## Why legacy watches

Three reasons, all visible in `product/platform/library/config-graph-controller.ts`:

1. **The user hand-edits YAML while Korri runs.** The config-cascade brief is
   explicit that the owner curates by hand alongside auto-generated entries.
2. **Other components write fragments** — artifact import, acquisition, the app
   materializer.
3. **Storage appears and disappears.** A second watcher covers a signal dir of
   *mountpoints*, because recursive `fs.watch` does not descend into mounts
   reliably on Linux.

Legacy's watcher is already `persistent: false`.

## Cost, measured

x86_64 / ext4, `notify::PollWatcher` — the mode Android forces, since inotify
does not fire on FUSE shared storage. Idle means nothing is changing.

| files | poll | watcher idle | check-on-read |
|---|---|---|---|
| 10 | 1s | 0.000% of a core | 0.008 ms |
| 50 | 1s | 0.000% | 0.028 ms |
| 200 | 1s | 0.067% | 0.101 ms |
| 2000 | 1s | 0.667% | 1.012 ms |
| 2000 | 250ms | 2.933% | — |

The 2000-file 250ms row is the one the Android library spike measured at 6.9%,
so the device costs roughly **2.4×** these numbers. Config scale stays free
even after that multiplier.

**At config scale, cost decides nothing.** Both options are free. The earlier
6.9% figure was a library-scale number and should not have been carried into
this decision.

## What actually decides it

Not performance — simplicity and failure modes.

- **Check-on-read cannot miss anything.** It has no events to drop, no watcher
  to leak, no lifecycle to manage under Doze or background limits. It costs
  nothing while idle by construction rather than by measurement.
- **A watcher is only required for reacting without being asked** — config
  changing while the portal is already open, or a mount appearing mid-session.
  That is a real case, but a narrow one.
- **Scale favours checking.** If every game becomes a fragment, 2000 files
  costs 1 ms per check on a launch path, versus 0.67% of a core burned
  continuously — and korrid now outlives the screen, so a watcher would run
  during gameplay, when config is least likely to change.
- **Deep idle is not in these numbers.** A poller wakes the CPU on a fixed
  interval and prevents deeper sleep states; that costs battery in a way CPU
  time does not show.

## Shape that follows

Check the fragments when config is actually needed — portal opens, a launch
happens — and rebuild only when a generation marker moves. Watch narrowly and
temporarily *if* live reaction is wanted, using the foreground signal the
accessibility service already provides to watch only while the portal is
visible.

Unresolved: mount arrival. Nothing in the check-on-read shape notices an SD
card appearing while the user stares at a stale list. Legacy solved it with the
signal-dir watcher; Android's equivalent is a broadcast receiver, not polling.

## Reproducing

`/tmp/config-watch-bench` (`poll_cost`, `stat_cost`). Not run on-device yet:
these are x86/ext4 numbers, and Android's FUSE layer makes every stat dearer.

## Cost of the chosen route: full refresh on internal trigger

Deferring the persistent scanner means korrid reloads only when it already
knows something changed — a download finished, a setting was changed in the
app. So the question becomes whether a whole-tree rebuild is cheap enough to be
the only reload path.

Read every fragment, parse it, merge into the tree. Warm cache, x86_64:

| fragments | full rebuild | one fragment | ratio |
|---|---|---|---|
| 10 | 0.15 ms | 0.013 ms | 11× |
| 50 | 0.73 ms | 0.013 ms | 55× |
| 200 | 2.84 ms | 0.014 ms | 201× |
| 1000 | 14.1 ms | 0.026 ms | 549× |
| 2000 | 29.9 ms | 0.024 ms | 1263× |

**Full refresh wins, and incremental is not worth building.** At realistic
scale a rebuild is under 3 ms; at two thousand fragments it is 30 ms, spent
immediately after a download or a settings change, when nothing is animating.
Incremental is up to 1263× faster in ratio terms and saves 30 ms in absolute
ones — a thousand-fold speedup on something already invisible.

Phone cores are roughly 3–4× slower for CPU-bound parsing, putting 200
fragments near 10 ms and 2000 near 100 ms on device. Still inside
"just after a download".

Not measured, and both could move these numbers:

- **proseQL's graph build sits on top.** This is read, parse and merge with
  serde_yaml; validation, id derivation, relationships and the cascade are
  extra. The term that scales with file count is the one measured, and it is
  small, but the constant factor is unknown until the import happens.
- **Cold reads on FUSE.** These are warm-cache figures where parsing dominates.
  The first rebuild after boot pays Android's FUSE cost per file, which could
  invert the balance between I/O and parsing.

## On device: FUSE costs about twenty times internal storage

Measured on usu (SM-F966U1, arm64), same binary against both filesystems.

| fragments | internal | shared storage (FUSE) | penalty |
|---|---|---|---|
| 10 | 0.46 ms | 3.7 ms | 8× |
| 50 | 1.01 ms | 19.7 ms | 19× |
| 200 | 3.64 ms | 64 ms | 18× |
| 1000 | 17.4 ms | 365 ms | 21× |
| 2000 | 37 ms | 760 ms | 21× |

Internal storage tracks the x86 figures within 1.2×, so this is not the phone's
CPU — it is FUSE. Every file operation on shared storage crosses a userspace
daemon, and a rebuild is thousands of them.

Watcher idle cost on FUSE held up: 50 files at 1 s costs 0.083% of a core, and
2000 files 1.333%, which scales to roughly 5.3% at the 250 ms rate the library
spike measured at 6.9%. Two separately built harnesses landing in the same
place is worth more than either number alone.

### The tension this exposes

User-visible storage was chosen deliberately: config lives where a file manager
can see it, because config the user cannot find is config the user cannot own.
That same location is the slow one.

- **Config-sized trees stay free.** Tens of fragments rebuild in 4–20 ms. Full
  refresh on an internal trigger remains the right shape, and incremental
  remains not worth building.
- **Library-sized trees do not.** At two thousand fragments a full rebuild from
  shared storage is 760 ms — a visible stall, not a pause between actions.

So the boundary worth drawing is not watcher versus no watcher. It is **what
belongs in FUSE-backed YAML at all**: hand-editable config does, and
library-scale records — thousands of games, play history — need either a
compiled form cached on internal storage or an incremental path after all.

Deciding that is out of scope here; it belongs with whoever imports proseQL
against a real consumer.
