---
id: task-009
title: Expose sessiond foreground control as RPC
status: To Do
priority: high
labels:
  - sessiond
  - rpc
  - input
  - foreground-lifecycle
created: 2026-06-10
source: user
---

# Expose sessiond foreground control as RPC

## Why it matters

Input actions like kill-current-game should call a typed product/control API instead of shelling out to `swaymsg` or hand-rolling HTTP endpoint calls. A pure RPC-shaped sessiond control surface would align foreground lifecycle control with the rest of Korri, make active-launch termination discoverable, and avoid leaking launch ids or compositor details into inputd.

## Acceptance Criteria

- [ ] Sessiond exposes typed RPC methods for foreground lifecycle/status, including terminate-active foreground launch with graceful/force options.
- [ ] Inputd kill-current-game action calls the RPC method instead of `swaymsg kill` or raw endpoint glue.
- [ ] Existing Unix-socket transport remains usable for same-user local control; any legacy HTTP/SSE endpoints needed by boot hooks remain compatibility wrappers or are explicitly migrated.
- [ ] RPC contract includes status/capability fields so clients can detect active launch, game/home mode, and termination support without knowing launch ids.
- [ ] Tests cover inputd -> sessiond RPC terminate-active flow and sessiond restoring the GUI/home state after termination.

## Related

- `product/services/device/sessiond.ts`
- `product/services/device/korri-inputd.ts`
- `product/platform/library/sessiond-managed-launch-protocol.ts`
- `product/systems/nixos/images/kiosk.nix`

## Notes

Requested after Bandai kill chord failure. Current action reaches `kill-current-game` but shells to `swaymsg`, which failed because inputd PATH lacked swaymsg. Preferred direction: use sessiond as foreground owner, but expose that as pure RPC rather than ad-hoc endpoint/shell wiring.
