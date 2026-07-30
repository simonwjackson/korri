---
id: 01KYTEC4TM49J1PR0QP25QE2P7
slug: spike-korrid-under-android-lifecycle-doze-memory-pressure-fo
title: "Spike korrid under Android lifecycle: doze, memory pressure, force-stop"
origin: parked
status: To Do
priority: medium
labels:
  - korrid
  - android
  - lifecycle
  - spike
created: 2026-07-30
source: se-work
---

# Spike korrid under Android lifecycle: doze, memory pressure, force-stop

## Why it matters

The embedded brain's behaviour under Android's process management is entirely untested. Nobody knows what happens to korrid under doze, low-memory kills, or a force-stop mid-session — which means any 'now playing' claim the portal makes on the tablet is unverified, and session unification would be built on an assumption. This gained a second reason on 2026-07-30: the proseQL Android spike found its file watcher is a polling thread, and a polling thread in a backgrounded app is precisely what Android throttles. So this spike now also determines whether proseQL's reactivity survives backgrounding at all.

## Acceptance Criteria

- [ ] Observed behaviour of the embedded korrid under: app backgrounded, doze, am kill (low-memory simulation), and explicit force-stop
- [ ] Known whether the localhost RPC port survives or must be re-established after each, and whether the portal recovers without user action
- [ ] Known whether a polling file watcher continues to fire while backgrounded and under doze
- [ ] Recommendation recorded on whether a foreground service is required, and for which capabilities specifically

## Related

- `docs/research/proseql-on-android.md`
- `services/korrid/src/android.rs`

## Notes

Gates session unification (local play and peer sessions joining now-playing) and any honest now-playing claim. Cheap to run: adb am kill, force-stop, and a long background soak. Interacts with the proseQL polling finding in backlog item 01KYTCYSEFV28GZ1W6MRAZ32E8.
