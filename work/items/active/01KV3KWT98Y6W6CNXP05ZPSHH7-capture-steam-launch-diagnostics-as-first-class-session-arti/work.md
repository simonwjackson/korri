---
id: 01KV3KWT98Y6W6CNXP05ZPSHH7
slug: capture-steam-launch-diagnostics-as-first-class-session-arti
title: Build first-class Steam launch observability
status: active
priority: high
labels:
  - steam
  - observability
  - sessiond
created: 2026-06-14
promoted: 2026-06-14
source: parking-lot
item: work/items/active/01KV3KWT98Y6W6CNXP05ZPSHH7-capture-steam-launch-diagnostics-as-first-class-session-arti/item.md
briefing: docs/briefs/2026-06-14-steam-observability-brief.md
handoff: docs/handoffs/steam-observability-implementation-handoff-2026-06-14.md
research: docs/research/steam-observability/bandai-2026-06-14/
---

# Build first-class Steam launch observability

Promoted from the parking lot for implementation planning.

## Implementation summary

Implemented in `edd9377 feat(steam): expose first-class launch observability`:

- Synthesized Bandai research notes and committed sanitized, source-specific parser fixtures.
- Added Steam log signal parsing for content, gameprocess, console, shader, and auxiliary/raw evidence streams.
- Added a tail-by-name Steam log tailer that starts at EOF and handles creation, truncation, and recreation/rotation by stat state.
- Added Steam launch state reduction with active/latest snapshots, bounded evidence, source-priority replay ordering, and clock-injected `Stuck` projection.
- Added a long-lived Steam log observer and wired it into `korrid` startup/shutdown through an owner-token status seam.
- Added read-only `app.steam.status` RPC and registered it on app/headless RPC groups.

## Verification

Focused Steam observability verification passed:

```text
bun test product/services/device/korrid.test.ts \
  product/apps/portal/api/steam/status.rpc-handler.test.ts \
  product/apps/portal/api/server/rpc-server.test.ts \
  product/services/device/steam-log-signals.test.ts \
  product/services/device/steam-log-tailer.test.ts \
  product/services/device/steam-launch-state.test.ts \
  product/services/device/steam-log-observer.test.ts \
  product/services/device/steam-evidence-sanitizer.test.ts

42 pass / 0 fail
```

Full repository gates were attempted on 2026-06-15:

- `just typecheck` failed on pre-existing/unrelated sessiond observer, Bun unix serve typing, and screenshot nullability errors.
- `just test-unit` failed on 6 unrelated/non-Steam tests while Steam observability tests passed.
- `just lint` failed on unrelated lint/format issues outside the Steam observability slice.

## Curation

Untracked raw Bandai log tails, process dumps, and old mixed parser fixtures were removed from the worktree after confirming sanitized committed parser fixtures are present. The committed research directory now contains the synthesized README/notes plus sanitized source-specific fixture files.

## Live smoke

Bandai was switched from a clean detached worktree at `edd9377`:

```text
/nix/store/j1akjp7rwpp0hq3apx0yd5cbhj3lp7gs-nixos-system-bandai-25.11pre-git
```

After rebooting Bandai over SSH port 22, `app.steam.status` responded from `korrid` with observer health `running`, logDir `/var/lib/korri/steam/logs`, all default watched files active, and bounded recent evidence.

Clean Sonic Mania `584400` smoke:

- `app.library.launch` returned `Accepted`.
- `app.steam.status` observed `Preparing` with `lastTask=ProcessingInstallScript`.
- `app.steam.status` then observed confirmed `Running` with `running=true`, `lastTask=Completed`, and tracked Steam PIDs.
- `app.session.stop` returned `Stopped`, but the Sonic Gamescope/SteamLaunch tree remained alive; after targeted wrapper termination, `app.steam.status` observed `latest.status=Stopped`, `running=false`, `trackedPids=[]`, and bounded removed-PID evidence including root exit `0` plus child `-1` exits.

Follow-up captured for the stop mismatch:

```text
01KV4HDP6RXMJYSYQY1DFHTW5W Verify Steam wrapper termination before session stop reports Stopped
```
