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

## Progress — U9 NixOS/device access

Implemented and committed `717f530a feat(nixos): add input seat uinput access`.

What changed:

- Added `services.korri.input.inputSeat` NixOS options for sessiond-owned remote input-seat `/dev/uinput` access.
- Defaulted input-seat access to a dedicated `uinput` group instead of the broad `input` group.
- Added assertions that reject `group = "input"` unless `allowBroadInputGroup = true` explicitly acknowledges the security downgrade.
- Wired enabled input-seat support to create the group, add the configured service user to it, load `uinput`, and emit a `0660` udev rule for `/dev/uinput`.
- Exported `KORRI_INPUT_SEAT_RUNTIME_DIR` from `korri-sessiond` when input-seat support is enabled.
- Enabled the input-seat device-access contract on SM8550 with `group = "uinput"` and `%t/korri/input-seat` runtime dir.
- Added a focused Nix check for dedicated-vs-broad uinput group behavior and extended the SM8550 config check to assert the device-access contract.

Verification:

- `nix build .#checks.x86_64-linux.korri-input-seat-device-access --no-link`
- `nix build .#checks.x86_64-linux.korri-sm8550-kiosk-config --no-link`

## Progress — quick socket seam

Added and committed `97e4aa19 feat(input-seat): add sunshine mirror socket seam`.

What landed:

- `product/platform/input-seat/sunshine-input-seat-mirror-socket.ts`
  - newline-delimited JSON frame sink for Sunshine mirror packets
  - strict decode through existing `decodeSunshineInputSeatFrame`
  - launch-scoped feeding into `createSunshineRemoteInputSourceAdapter`
  - bounded frame-size handling
  - diagnostics for accepted, stale/drop results, malformed JSON, schema failures, oversized frames, and socket errors
  - Unix socket server wrapper with absolute-path requirement, stale unlink, `0600` mode, and cleanup
- `product/platform/input-seat/sunshine-input-seat-mirror-socket.test.ts`
  - chunked frame handling
  - stale-launch drop
  - malformed/non-gamepad/oversized frame rejection
  - adapter rate-limit propagation
  - real Unix socket smoke check
  - absolute socket path requirement

Verification:

- `bun test ./product/platform/input-seat/*.test.ts` → 33 pass
- `just typecheck` still fails on the known pre-existing repo-wide errors; touched-path filter showed no input-seat/sessiond/RPCS3/protocol errors.

Next quickest remaining non-hardware slice: add the Sunshine C++ packet mirror patch that writes these NDJSON frames to the socket path.
