---
title: Remote input event source spike
status: accepted
date: 2026-07-06
related: work/items/active/01KWTZ3DDBRFV3GAJFFDRR7Z57-sessiond-remote-input-seats/plan.md
---

# Remote input event source spike

## Decision

Use a **Sunshine-side input packet mirror** as the first remote input source for Korri input seats.

The mirror should run on the source host inside the Korri Sunshine build and publish sanitized gamepad packet events to a launch-scoped local IPC endpoint owned by sessiond/input-seat. sessiond still owns emulator-visible Korri uinput seats; Sunshine is only the source of remote controller events.

## Why this path

Sunshine already receives decoded Moonlight controller packets before it allocates or updates its own virtual gamepad. Upstream `src/input.cpp` has these source-host seams:

- `passthrough(std::shared_ptr<input_t> &input, PSS_CONTROLLER_ARRIVAL_PACKET packet)` handles controller arrival and calls `platf::alloc_gamepad(...)`.
- `passthrough(std::shared_ptr<input_t> &input, PNV_MULTI_CONTROLLER_PACKET packet)` handles controller state, lazily allocates on first active packet for legacy clients, calls `platf::gamepad_update(...)`, and releases when the active mask clears.
- `passthrough(... PSS_CONTROLLER_TOUCH_PACKET)`, `passthrough(... PSS_CONTROLLER_MOTION_PACKET)`, and `passthrough(... PSS_CONTROLLER_BATTERY_PACKET)` already validate controller number and allocation state before platform dispatch.

Mirroring sanitized controller packets at those seams gives Korri a source-host event stream before or alongside Sunshine's own platform backend, without using Sunshine's virtual pad as the emulator-visible controller.

## Alternatives checked

### A. Extend Moonlight local-control to send raw events

Rejected for the first production path. The existing Korri Moonlight patches add client-local IPC for lifecycle, runtime settings, stream health, and touch-bound commands (`product/plugins/moonlight/packages/moonlight-embedded-korri/patches/0006-*` through `0019-*`). They do not currently expose raw gamepad event frames. Making Moonlight the source would also require a new client-to-source transport or a second control channel into the source host.

Moonlight-local work may still be useful later for richer client identity, but it is not the shortest source-host path for sessiond-owned seats.

### B. Read Sunshine-created evdev/uinput pads on the source host

Rejected for the first production path. It depends on the same lazy Sunshine virtual pad creation that caused the boot race, requires read access to `/dev/input/event*`, and risks event feedback/duplication if Korri reads Sunshine's synthetic pad while also writing Korri seats.

### C. Patch Sunshine input processing to mirror controller packets

Accepted. It observes remote controller packets before platform device allocation/update and can be gated by launch-scoped environment variables. It avoids broad evdev reads and keeps Sunshine out of emulator-visible device ownership.

## Production targets

Expected source-host patch and TypeScript targets:

- Add a new Sunshine downstream patch after `product/vendor/sunshine-korri/patches/0014-skip-runtime-vaapi-destructor-flush.patch`, for example `product/vendor/sunshine-korri/patches/0015-add-korri-input-seat-event-mirror.patch`.
- Update `product/vendor/sunshine-korri/package.nix` to include that patch.
- Patch Sunshine `src/input.cpp` / `src/input.h` to mirror only controller-domain events from the passthrough seams named above.
- Add a small Sunshine-side local IPC helper, following the runtime-settings control-plane safety pattern: absolute runtime-dir socket path, launch-scoped session id/source id, `0600` socket, bounded frames, non-blocking or bounded queue behavior, and local-only diagnostics.
- Add the TypeScript source adapter later under `product/platform/input-seat/sunshine-remote-input-source.ts` and protocol helpers under `product/platform/input-seat/`.

## Event contract sketch

The Sunshine mirror should emit only gamepad-domain events:

- `source-connected` from `PSS_CONTROLLER_ARRIVAL_PACKET` or the first active `PNV_MULTI_CONTROLLER_PACKET` for legacy clients.
- `source-state` from `PNV_MULTI_CONTROLLER_PACKET`, carrying controller number, active mask bit, button flags, triggers, and stick axes.
- `source-touch`, `source-motion`, and `source-battery` from the corresponding controller packet types if the capability profile supports them.
- `source-disconnected` when the active gamepad mask clears for a controller or stream teardown occurs.

The mirror must not emit keyboard, mouse, touch-screen, pen, or text input for this slice.

## Safety requirements for implementation

- **No emulator-visible ownership:** Sunshine packets feed Korri seats; Sunshine-created pads remain non-authoritative and should not be referenced by emulator configs.
- **No broad evdev read:** the source adapter consumes the Sunshine mirror socket, not `/dev/input/event*`.
- **No feedback loop:** the mirror is before/alongside Sunshine platform dispatch and never reads Korri uinput seats.
- **Foreground gate:** the TypeScript adapter forwards mirrored events only while sessiond confirms the same launch owns the foreground child/input lease.
- **Bounded rate:** event frames are bounded and adapter-side rate limiting remains required by U7.
- **Launch-scoped identity:** every frame carries the launch/session id and a source id derived from the Sunshine session/controller number so stale frames cannot claim a newer launch's seat.
- **Disconnect semantics:** active-mask clear and stream teardown become disconnect/reserved signals, not virtual-seat destruction.

## Validation status

Static source proof is complete: Sunshine has source-host controller packet seams before its virtual-pad allocation/update path, so a packet mirror is buildable without reading Sunshine's lazy evdev pad.

Hardware validation is still required before U7 is complete:

1. Launch Korri Sunshine with the mirror enabled and a launch-scoped socket path.
2. Connect Moonlight and press a controller button.
3. Observe a `source-connected`/`source-state` frame on the source host before relying on emulator visibility.
4. Disconnect the stream and observe `source-disconnected` separately from explicit leave.
5. Confirm no frames are produced from keyboard/mouse events and no event loop appears when Korri seats are later enabled.

## Outcome

U0 unblocks U3/U4/U7 design on a concrete event-source choice: implement a Sunshine-side controller packet mirror and consume it through the input-seat source adapter. Do not implement the rejected evdev-reader path unless the Sunshine packet mirror fails hardware validation.
