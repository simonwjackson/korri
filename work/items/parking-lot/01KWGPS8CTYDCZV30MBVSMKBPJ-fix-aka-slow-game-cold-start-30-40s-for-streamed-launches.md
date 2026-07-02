---
id: 01KWGPS8CTYDCZV30MBVSMKBPJ
slug: fix-aka-slow-game-cold-start-30-40s-for-streamed-launches
title: Fix aka slow game cold-start (~30-40s) for streamed launches
origin: parked
status: To Do
priority: high
labels:
  - korri
  - aka
  - gamescope
  - performance
  - streaming
  - xdg-portal
created: 2026-07-02
source: se-debug
---

# Fix aka slow game cold-start (~30-40s) for streamed launches

## Why it matters

Streamed launches on aka take ~30-40s to first frame (RetroArch/Anguna) and ~20s (Neverball), while the network/stream handshake is under 1s (prepare -> CLIENT CONNECTED). The delay is aka-side: nested gamescope cold-start (~20s) plus game first-run, and aka's xdg-desktop-portal + xdg-desktop-portal-gtk services are in a failed state (gamescope logs pw_context_connect failed), which likely makes gamescope wait/stall on PipeWire/portal probing. Native RetroArch on Bandai is ~0.5s. This is the biggest UX gap for the aka streaming path.

## Acceptance Criteria

- [ ] aka's xdg-desktop-portal / portal-gtk are healthy (or gamescope no longer stalls on portal/pipewire)
- [ ] Streamed launch time-to-first-frame on aka is comparable to native (seconds, not tens of seconds)
- [ ] Timeline instrumentation identifies whether portal-wait, shader compile, or game init dominates

## Related

- `hosts/aka/default.nix (mountainous)`
- `product/plugins/gamescope`
- `product/services/device/sessiond-source-machine.ts`
