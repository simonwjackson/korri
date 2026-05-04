---
date: 2026-05-03
topic: native-input-bridge
---

# Native Input Bridge for Korri

## Problem Frame

Korri runs on the AYN Odin 2 Portal under ROCKNIX. ROCKNIX deliberately disables the `joydev` kernel module (commit `75e6dd0` on the ROCKNIX `next` branch, 2026-05-03 — `# CONFIG_INPUT_JOYDEV is not set`), routing all controller input through InputPlumber instead. Consequence: Chromium's web Gamepad API cannot see any controller on the Odin, because there is no `/dev/input/js*` device for it to enumerate.

Today the Korri renderer's only controller-input path is the web Gamepad API. On the Odin that path is permanently broken. The personal MVP (`docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md`) cannot ship without controller input — there is no other input device available on the device in normal use.

The eventual deployment target is Electrobun: a Bun-hosted native process with an embedded WebView. That deployment owns the device-side filesystem, including `/dev/input/event*`, so the right architectural answer is a native bridge — the device-side process reads raw input events, ships them over a typed transport, and a new adapter on the renderer side feeds the existing input bus. The Odin Chromium kiosk validation surface is the same shape as Electrobun in miniature: WebView consumer, in-process API server, loopback transport.

## Architecture Overview

```text
┌──────────────── device (Odin today, Electrobun host tomorrow) ─────────────┐
│                                                                            │
│  /dev/input/event*  ─►  native input reader (Bun)                          │
│                            │                                               │
│                            │  parsed events tagged with device class       │
│                            ▼                                               │
│                         typed event stream  ─►  WS  ─┐                     │
│                                                       │                    │
└───────────────────────────────────────────────────────┼────────────────────┘
                                                        │ (loopback in kiosk
                                                        │  / Tailscale in dev
                                                        │  loop, same wire)
                                                        ▼
                                       new renderer-side InputAdapter
                                          (semantic mapping per class)
                                                        │
                                                        ▼
                                                existing InputBus
                                          (focus engine, useInputAction)
```

## Requirements

**Wire shape and device coverage**

- R1. The bridge surfaces raw input events as `(type, code, value)` tuples — the kernel's evdev representation — not pre-mapped semantic actions. Semantic mapping is the renderer's responsibility.
- R2. Each event on the wire carries a device-class tag (gamepad / keyboard / mouse / touch / unknown) so the renderer can apply per-class semantics, and so future device classes are reachable without re-architecting the bridge.
- R3. Each event on the wire carries a stable device identifier so a future multi-device consumer can disambiguate. MVP is single-device; the field is reserved, not arbitrated over.
- R4. The wire format is schema-typed end-to-end. The same schema is the source of truth for the device-side producer and the renderer-side consumer.

**Device-side reader**

- R5. The reader discovers input devices automatically and identifies each device's class without per-device manual configuration. The class taxonomy from R2 is the output.
- R6. The reader survives device hot-plug cycles. When InputPlumber's virtual controller disappears (e.g. during a launched game) and reappears (e.g. on game exit), the reader resumes without manual intervention.
- R6a. The renderer adapter survives transport drops. When the WebSocket disconnects (API server restart, network hiccup in the Level 2 path) and the device-side reader is still alive, the adapter reconnects and resumes consuming events without losing focus state.
- R7. For MVP, only gamepad-class events are emitted onto the wire. Other classes are recognized by the discovery layer and reserved in the schema, but emission is gated until a renderer consumer exists for them.

**Renderer adapter**

- R8. A new adapter conforms to the existing `InputAdapter` contract documented in `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`. It does not change that contract. Components remain native HTML; `useInputAction` does not change shape; the rule against reaching into `window.__korriSpatialNav` from product code stands.
- R9. Events from the bridge carry the existing source discriminator pattern from `docs/solutions/best-practices/pointer-aware-spatial-navigation-2026-05-01.md`. The new source value is `"native"`. Existing input-mode rules treat `"native"` as a directional source (cursor hides, `:focus` ring shows), identical to how `keyboard` and `gamepad` are treated.
- R10. The web `gamepad-adapter.ts` and the new native adapter coexist. On the Odin the web adapter sees no devices and never fires; on a dev laptop with a USB controller the web adapter remains primary. No runtime arbitration logic is required; the architecture's existing peer-adapter model already permits this.

**Validation surface**

- R11. The bridge is proven against the Odin Chromium kiosk loop, not the Level 2 dev loop. Renderer in Chromium kiosk on the Odin's screen, transport over loopback, controller input on the same device.
- R12. The minimum observable behavior that closes this work: the developer presses L3+R3+Start, Korri opens in kiosk, the d-pad and left stick move focus around the home grid, A launches a game, the game runs, the game exits, focus returns to Korri.

## Success Criteria

- The personal-MVP "open Korri → navigate → launch → exit → back to Korri" round-trip works on the Odin under controller input alone, with no keyboard plugged in.
- Chromium DevTools network tab shows the bridge transport active at boot. No fallback path is exercised on the Odin.
- A future Korri-during-gameplay overlay (in-game menu, screenshot, save-state UI) requires zero changes to the bridge — only a new renderer-side consumer of the existing wire schema.
- A future input device class (USB keyboard plugged into the Odin, touch overlay on a different device, custom HID gadget) requires only a new device-class entry and a renderer-side mapper, not a re-architecture.

## Scope Boundaries

- **Toggle daemon migration is out.** The existing `korri-toggle-daemon` keeps running under its own `evtest` parser. Migrating its chord detection to a thin subscriber on the new event stream is a follow-up. Two `/dev/input/event*` readers coexist on the Odin briefly; reads are idempotent so this is safe.
- **Removal of the web `gamepad-adapter.ts` is out.** It stays for laptop-with-USB-controller dev and Storybook ergonomics. On the Odin it is harmless because no `/dev/input/js*` device exists for it to enumerate.
- **Multi-controller arbitration is out.** The wire schema reserves a device-id field, but MVP is single-controller, single-player.
- **Per-game controller passthrough during gameplay is out.** Once a game launches, ROCKNIX and the running emulator own `/dev/input/*`. The bridge is dormant until Korri is foreground again.
- **Electrobun-specific IPC transport is out.** Loopback WebSocket carries both today's kiosk validation and tomorrow's Electrobun deployment unchanged. A switch to Electrobun's native bridge IPC is a transport-level swap that does not affect the wire schema or the adapter contract.
- **Renderer-side semantic mapping for non-gamepad classes is out.** Other classes are tagged on the wire (R2) but the renderer adapter only consumes gamepad-class events for MVP.
- **Level 2 dev loop validation is out as a success criterion.** The transport works there because it's the same WS endpoint, but proving it is not part of MVP scope per R11.

## Key Decisions

- **Raw events on the wire, semantic mapping in the renderer.** Centralizes the mapping table where the consuming code lives. Future overlays composing different mappings (e.g., L1/R1 paginate during a game-list view but seek during a screenshot UI) don't require a device-side change.
- **Device-class agnostic schema from day one.** Same parser, same transport, same adapter shape — `/dev/input/event*` is already device-agnostic in the kernel. Reserving the class tag now is nearly free now and prevents a future re-architecture when a non-gamepad device first matters.
- **Loopback WebSocket as the transport.** Works for the kiosk validation case (loopback on the Odin) and for the eventual Electrobun deployment (loopback to the in-process API server). Single mental model.
- **Kiosk validation, not Level 2 dev loop.** Kiosk + loopback WS is the closest faithful preview of Electrobun deployment available today; the Level 2 loop is a moving target that Electrobun will eventually replace.
- **No replacement of existing input adapters.** The native bridge slots in as a peer alongside keyboard, web gamepad, pointer, and wheel adapters. No special arbitration logic; the existing architecture already permits coexistence.

## Dependencies / Assumptions

- ROCKNIX continues to expose InputPlumber's virtual controller as a standard evdev device under `/dev/input/event*`. Confirmed by the toggle daemon's working `evtest` parse path on the device.
- The device-side process has read access to `/dev/input/event*`. On the Odin under ROCKNIX, the API server runs as root; on Electrobun production, the host process likewise runs as root. No additional capability or udev rule is assumed.
- The API server can host a WebSocket route on the same process that already serves `/api/rpc`. Hono is the current server framework; whether Hono's WebSocket support is the right primitive is a planning question, not a brainstorm one.
- Effect Schema is the project's wire-format vocabulary post-v4 migration (commit `1594cbe`, 2026-05-03). The bridge's wire format is expected to follow the same patterns established by RPC contracts in `korri/shared/api/rpc/`.

## Outstanding Questions

### Deferred to Planning

- [Affects R4][Technical] Exact wire schema shape — flat discriminated union by device class versus a single common shape with a `class` field. Existing RPC schema patterns under `korri/shared/api/rpc/` should guide the choice.
- [Affects R5][Needs research] Reliable device-class detection from `/sys/class/input/eventN/device/`. The kernel exposes capability bitmasks (`EV_KEY`, `EV_ABS`, `EV_REL`); planning should verify the actual `/sys` layout on the Odin and decide whether to read raw bitmasks or rely on InputPlumber's exposed names.
- [Affects R3][Needs research] Stable device-id source. `/sys/class/input/eventN/device/uniq` or `phys` versus the event-node path; the latter is unstable across reboots if hot-plug ordering changes.
- [Affects R6][Technical] Reconnect/backoff policy for the device-side reader and the renderer-side adapter. Likely a watch-and-retry loop; the existing toggle daemon's pattern is a viable starting shape.
- [Affects R8][Technical] Mapping table from raw events to semantic `InputAction`s for the gamepad class — including the hold/repeat state machine. Likely ports from `korri/shared/input/gamepad-adapter.ts`.
- [Affects R11][Technical] Boot-time ordering between the renderer and the bridge in kiosk mode. The bridge presumably starts with the API server and is up before the renderer connects, but the adapter should tolerate a missed first-second window without losing input.
- [Affects all] Where device-side code lives in the repo — `korri/products/app/api/input/` (production tier alongside other API routes) versus a separate `tools/odin/` location (dev tier, like the toggle). Planning decides based on the prevailing layering rules.
- [Affects R12][Technical] Storybook / Playwright story-driven coverage shape. The existing `Tilegrid.gamepad.story.e2e.ts` pattern (`addInitScript` installing a fake driver) is the likely template, swapped for a fake WS server in init.

## Next Steps

`-> /ce:plan` for structured implementation planning
