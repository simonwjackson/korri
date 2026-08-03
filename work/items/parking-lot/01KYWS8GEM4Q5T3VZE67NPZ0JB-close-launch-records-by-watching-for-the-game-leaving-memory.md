---
id: 01KYWS8GEM4Q5T3VZE67NPZ0JB
slug: close-launch-records-by-watching-for-the-game-leaving-memory
title: Close launch records by watching for the game leaving memory
origin: parked
status: To Do
priority: medium
labels:
  - android
  - session-lifecycle
  - korrid
  - launcher
created: 2026-07-31
source: se-work
---

# Close launch records by watching for the game leaving memory

## Why it matters

Android announces what comes forward and says nothing about what goes away, so korrid has to decide for itself when a launch is over. Measured on usu with TMNT: when the game genuinely quits, its process disappears from memory immediately, so polling for its absence is enough and needs no cleverness. The overlay's foreground stream already covers the weaker question of whether the player is looking at it right now. Without this, korrid cannot honestly show now-playing state or close a session, and the portal keeps guessing.

## Acceptance Criteria

- [ ] korrid owns a launch record carrying id, package, and launch time
- [ ] A launch is closed when its process is observed gone, and korrid stops claiming the game is running
- [ ] The portal shows last-played rather than now-playing when there is no positive evidence the game is running
- [ ] Polling interval and its battery cost are measured on device rather than assumed

## Related

- `docs/research/knowing-when-a-launch-ended.md`
- `services/korrid/launch-liveness-check.sh`
- `services/korrid/multi-game-observability.sh`

## Notes

Two corrections worth carrying, both cases of believing a bad measurement.

An earlier run appeared to show the process surviving 20s after Back, which suggested pid-based liveness was dangerous. The likelier reading is that the game never quit in that run — the Back presses moved around inside its menus — and the step was mislabelled "game closed". The re-run with a real quit showed the process gone immediately.

Two other candidate signals are junk and should not be used: an ActivityRecord count reported 1 while nothing was running at all, and the recents count sat at 8 throughout. oom_score_adj and dumpsys curProcState also failed to discriminate between playing, backgrounded and quit, and are recorded as unresolved probes rather than findings about Android.

Residual uncertainty: Android may keep a finished app parked in memory when it is not short on space. Absence therefore proves an ending; presence is slightly weaker evidence. Any record should also carry package name and launch time, since pid_max is 32768 and a recycled number could otherwise resurrect a finished launch.
