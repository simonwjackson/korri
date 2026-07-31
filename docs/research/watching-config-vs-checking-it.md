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
