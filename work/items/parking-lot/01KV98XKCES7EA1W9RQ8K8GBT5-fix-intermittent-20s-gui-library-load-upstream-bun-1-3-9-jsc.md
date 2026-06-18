---
id: 01KV98XKCES7EA1W9RQ8K8GBT5
slug: fix-intermittent-20s-gui-library-load-upstream-bun-1-3-9-jsc
title: "Fix intermittent ~20s GUI library load: upstream Bun 1.3.9 JSC GC segfault in electrobun renderer"
origin: parked
status: To Do
priority: medium
labels:
  - desktop
  - electrobun
  - bun
  - performance
  - crash
  - upstream
created: 2026-06-16
source: se-debug
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  commit: 009a848
  repo: korri
  invoked_by: se-debug
---

# Fix intermittent ~20s GUI library load: upstream Bun 1.3.9 JSC GC segfault in electrobun renderer

## Why it matters

placeholder

## Acceptance Criteria

- [ ] Desktop electrobun host runs a Bun runtime >= 1.3.14 (or a version where the JSC GC segfault is fixed), verified on-device via the renderer log banner
- [ ] No `terminated by signal: 5` JSC-GC crashes observed across repeated korrid restarts / renderer respawns on bandai SM8550
- [ ] Library reliably renders within a few seconds of a korrid restart (no ~20s blank), confirmed on device
- [ ] (if mitigation taken) a single renderer crash recovers in <2s without a multi-respawn storm

## Related

- `product/apps/desktop/main.ts`
- `product/apps/desktop/api-forwarder.ts`
- `product/apps/desktop/forwarder-upstream.ts`
- `product/systems/nixos/images/kiosk.nix`
- `electrobun.config.ts`
- `package.json`

## Notes

Diagnosis (bandai SM8550, trunk @ 009a848):

CONFIRMED ROOT CAUSE: electrobun 1.16.0 bundles Bun v1.3.9 for the desktop host process (Korri-dev/bin/bun running main.js: forwarder + inputd WS + Bun.serve). It segfaults (signal 5) inside JSC concurrent GC. Decoded bun.report stack: `Segmentation fault at 0x10` in JSC::MarkedBlock::aboutToMark -> JSC::SlotVisitor::appendUnbarriered -> MarkingConstraintSolver::runExecutionThread (parallel GC mark thread). bun.report verdict: 'a bug in Bun, not your code'; 'Outdated Version Detected — your 1.3.9, latest 1.3.14, may already be fixed'. Distinct from korrid's system Bun 1.3.3.

EVIDENCE: /home/korri/.local/state/korri/electrobun.log shows 8x `terminated by signal: 5` with JSC-GC stacks (fault addrs 0x10, 0x100A, 0x1000000000005); RSS ~1.11GB at crash. After one korrid restart the renderer crash-looped 2x over ~46s. A clean spawn reaches 'Korri desktop app started' in 0.88s.

RULED OUT: app.catalog.snapshot RPC (0.10s warm / 0.38s cold against korrid; fast through the desktop forwarder too); transport/atom (forwarder loopback probe 200ms, catalogSnapshotAtom self-refresh 1s); WebKit software-rendering (no /dev/dri/renderD128 in renderer namespace) — present on EVERY instance including currently-fast ones, so it's a constant, not the intermittent cause.

CASCADE CONTEXT: korri-sessiond `Wants=korrid.service` + ExecStartPre wait-for-korrid (polls /api/health) + sessiond-owned Electrobun; a korrid restart bounces the whole renderer, widening the window where a GC crash-loop is user-visible.

PRIMARY FIX: move the desktop runtime off Bun 1.3.9 (electrobun upgrade that bundles newer Bun, or pin Bun >=1.3.14 for the electrobun runtime). Dependency/toolchain change — whole desktop-runtime blast radius; needs rebuild + redeploy + on-device smoke.

OPTIONAL MITIGATION: make a renderer GC crash cheap to recover — bounded fast respawn decoupled from the korrid-restart cascade so one crash costs <2s, not ~20s.

OBSERVABILITY GAP: React app logs no navigation->catalog-rendered timing and sessiond doesn't count renderer respawns/crashes; add both to quantify frequency.

Key files: product/apps/desktop/main.ts, product/apps/desktop/forwarder-upstream.ts, product/apps/desktop/api-forwarder.ts, product/systems/nixos/images/kiosk.nix, product/systems/nixos/flake/{default,packages,sources}.nix, electrobun.config.ts, package.json (electrobun 1.16.0).
