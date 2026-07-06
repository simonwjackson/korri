---
id: 01KWTZ3DDBRFV3GAJFFDRR7Z57
slug: sessiond-remote-input-seats
title: Build sessiond remote input-seat service for stream-safe emulator launches
status: active
origin: parking-lot
created: 2026-07-06
source: user
---

# Build sessiond remote input-seat service for stream-safe emulator launches

Active work graduated from the parking lot to plan a generic sessiond-owned input-seat service for remote emulator launches.

## Progress — 2026-07-06

Implemented and committed the first stream-safe input-seat slices on `feat/sessiond-remote-input-seats`:

- `97e986af docs(work-item): graduate remote input seats plan`
- `4d8cec5a feat(input-seat): add pure seat policy domain`
- `f9ab02c1 docs(input-seat): choose sunshine event source`
- `f542b9a2 feat(input-seat): add runtime port contracts`
- `90ca4004 test(input-seat): cover launch companion cascade`
- `76d5726a style(input-seat): format touched files`
- `ffc321c2 feat(sessiond): add pre-spawn readiness gates`
- `1eb4d1cd feat(sessiond): add input seat pre-spawn gate`
- `c0f83be9 feat(rpcs3): derive input profile from input seats`
- `c0acd723 feat(protocol): add input seat status events`
- `88fe56bc feat(sessiond): expose input seat status`
- `dbd8b0fc feat(input-seat): add sunshine source adapter`
- `f1b35c44 feat(sessiond): add input seat leave endpoint`

Verification run in the feature worktree:

- `bun test ./product/platform/input-seat/*.test.ts` → 27 pass
- `bun test ./product/plugins/rpcs3/src/input-seat-policy.test.ts ./product/plugins/rpcs3/src/materializer.test.ts ./product/platform/input-seat/*.test.ts` → 39 pass
- `bun test ./product/platform/library/sessiond-managed-launch-protocol.test.ts ./product/services/device/sessiond.test.ts ./product/services/device/sessiond-input-seat.test.ts` → 112 pass
- `just typecheck` still fails on pre-existing repo-wide errors, but repeated touched-path filters showed no errors under the input-seat/sessiond/RPCS3/protocol files touched by this work.

Remaining major follow-ups:

- Add the Sunshine C++ packet-mirror patch and package it into `product/vendor/sunshine-korri/package.nix`.
- Wire the TypeScript Sunshine source adapter into the live packet-mirror IPC/socket path and virtual-seat writer.
- Add portal/API-level leave-seat wrapper if required by clients beyond the direct sessiond managed endpoint.
- Add NixOS/uinput access and hardware validation for Skate 3/RPCS3 plus a second runtime.
