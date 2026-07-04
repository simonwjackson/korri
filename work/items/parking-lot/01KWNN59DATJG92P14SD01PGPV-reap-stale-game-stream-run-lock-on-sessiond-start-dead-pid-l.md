---
id: 01KWNN59DATJG92P14SD01PGPV
slug: reap-stale-game-stream-run-lock-on-sessiond-start-dead-pid-l
title: Reap stale game-stream run.lock on sessiond start (dead-pid lock blocks all remote launches)
origin: parked
status: To Do
priority: high
labels:
  - korri-sessiond
  - stream
  - remote-source
  - reliability
  - device-evidence
  - crash-recovery
created: 2026-07-04
source: user
---

# Reap stale game-stream run.lock on sessiond start (dead-pid lock blocks all remote launches)

## Why it matters

On aka (headless PS3/RPCS3 + Sunshine stream host) a remote Skate 3 (ps3-disc) launch from bandai failed with peer prepare failed for every attempt, while aka was idle. Root cause: the gamescope/Wayland compositor died mid-session (11:42 "The Wayland connection broke"), leaving /run/user/1000/korri-game-stream/run.lock (pid 657729) and an orphaned next-launch.json.claimed.657729.* behind. korri-sessiond then restarted (19:08) but did NOT reap the stale lock, so the single-flight prepare guard kept treating the idle host as busy and rejected every new stream prepare. Successful launches were all before the restart; all failures after. A plain sessiond restart does not fix it because the lock survives restarts; only removing the lock does. This strands every remote-source (streamed) game on that host until someone manually deletes the lock.

## Acceptance Criteria

- [ ] On korri-sessiond start, a run.lock whose recorded pid is not alive is treated as stale and reaped (lock + orphaned .claimed.<pid>.* files).
- [ ] The prepare/claim path treats a lock held by a dead pid as free instead of returning prepare-failed.
- [ ] A compositor death or unclean session exit does not leave the launch slot permanently wedged across a sessiond restart.
- [ ] Regression: a remote-source launch succeeds after a simulated stale lock (dead pid) is present.
- [ ] peer prepare failed surfaces a concrete reason (e.g. slot-busy vs stale-lock) in korrid logs so this is diagnosable without inferring from run.lock mtime.
