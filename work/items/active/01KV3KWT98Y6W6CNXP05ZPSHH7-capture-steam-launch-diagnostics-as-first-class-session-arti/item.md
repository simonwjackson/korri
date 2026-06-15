---
id: 01KV3KWT98Y6W6CNXP05ZPSHH7
slug: capture-steam-launch-diagnostics-as-first-class-session-arti
title: Build first-class Steam launch observability
origin: parked
status: To Do
priority: high
labels:
  - steam
  - observability
  - sessiond
created: 2026-06-14
source: user
briefing: docs/briefs/2026-06-14-steam-observability-brief.md
---

# Build first-class Steam launch observability

## Why it matters

Steam/AppID launch currently feels too much like sending a request into a black box: Korri can ask Steam to launch something and can observe downstream process/session behavior, but it does not yet have a first-class model of what Steam itself is doing. Operators and UI need to know whether Steam accepted the launch, is preparing content, is running the AppID, is tracking child PIDs, is stuck on shader/content/runtime work, or stopped the game.

This item is intentionally **Steam-focused**. Gamescope, MangoHud, screenshots, compositor geometry, and broader visual validation are separate adapters/work items. The goal here is Steam-native signal capture and a normalized event/snapshot surface that preserves Steam-specific detail rather than hiding it.

## Acceptance Criteria

- [ ] Add a Steam observer service that resolves Korri-managed Steam logs, starting with `/var/lib/korri/steam/logs`, and can support standard Steam user roots later.
- [ ] Implement tail-by-name semantics for Steam logs, handling file creation, truncation, and rotation/recreation (`tail -F`/inotify style rather than one fixed inode).
- [ ] Parse `content_log.txt` into first-class Steam launch signals for AppID tracked PID added, AppID running state entered, tracked PID removed with exit code, and AppID running state left/stopped.
- [ ] Treat additional Steam logs as evidence streams, at minimum `console_log.txt`, `compat_log.txt`, `appinfo_log.txt`, and `shader_log.txt`, without depending on them as the sole lifecycle authority.
- [ ] Preserve raw evidence provenance for each parsed signal: log file, timestamp when known, offset/sequence when available, raw line excerpt, parser version, and confidence.
- [ ] Emit normalized runtime observation events with `runtime: "steam"`, a UI-friendly state projection, and a Steam-specific facet containing AppID, Steam app state, tracked PID, tracked PID exit code, and related log paths.
- [ ] Expose active/latest Steam observation snapshot through a Korri status/RPC surface so UI can show that Steam is doing work instead of appearing idle or hung.
- [ ] Support optional bounded Proton logging for supervised Steam launches by setting `PROTON_LOG=1` and `PROTON_LOG_DIR=<launch artifact dir>` when enabled, then tailing/linking `steam-<appid>.log` if it appears.
- [ ] Optionally detect Steam Linux Runtime / pressure-vessel logs when enabled (`STEAM_LINUX_RUNTIME_LOG=1`, `PRESSURE_VESSEL_VERBOSE=1`) and attach discovered `slr-app<appid>-*.log` paths as Steam runtime evidence.
- [ ] Degrade gracefully when Steam log formats change: keep raw log tails/evidence visible, mark parser confidence low/unknown, and avoid reporting false lifecycle certainty.
- [ ] Tests cover fixture `content_log.txt` lines for launch, running, multi-PID tracking, PID exit, stopped, log truncation, log rotation, and no-progress/stuck projection.

## Non-Goals

- Gamescope observability.
- MangoHud observability.
- Screenshot or visual validation.
- DISPLAY/xrandr/xwininfo geometry proof.
- Full generic runtime observer implementation for RetroArch/other emulators.
- Replacing sessiond foreground lifecycle; this item should feed Steam observations into the existing/future lifecycle surfaces.

## Related

- `docs/briefs/2026-06-14-steam-observability-brief.md`
- `docs/handoffs/bandai-steam-observability-spike-2026-06-14.md`
- `docs/handoffs/steam-observability-implementation-handoff-2026-06-14.md`
- `docs/research/steam-observability/bandai-2026-06-14/`
- `work/items/active/01KV3E8VXKVYD86C5YTDQ1GKMF-productize-steam-ts-planner-handoff`
- `work/items/parking-lot/01KV3A5RNCMMGR8FY5Y8MKPWGD-normalize-all-foreground-launches-under-one-lifecycle-superv.md`
- `product/services/device/steam/steam-gamescope-launch-plan.ts`
- `product/services/device/steam/steam-gamescope-launch-planner-cli.ts`
- `product/services/device/nix/steam-gamescope-launcher.nix`
- `product/services/device/sessiond.ts`
- `product/platform/library/sessiond-managed-launch-protocol.ts`

## Briefing

See `docs/briefs/2026-06-14-steam-observability-brief.md` for the multi-agent web research synthesis, Steam log sources, proposed Steam observer architecture, event shape, state projection, and first implementation slice.

See `docs/handoffs/bandai-steam-observability-spike-2026-06-14.md` for the original live Bandai spike procedure.

See `docs/handoffs/steam-observability-implementation-handoff-2026-06-14.md` for the revised implementation handoff based on captured Bandai evidence. It corrects the source split: `content_log.txt` for AppID state, `gameprocess_log.txt` for tracked PID lifecycle, and `console_log.txt` for launch task progress.

## Notes

User clarified that for this item they care specifically about first-class Steam observability: knowing exactly what Steam is doing so Korri can respond or at least show progress in UI. Normalization must not hide Steam-specific information. The model should be as linear as possible for status/UI while preserving raw Steam evidence and Steam-only facets for diagnostics.
