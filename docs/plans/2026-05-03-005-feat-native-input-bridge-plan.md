---
title: "feat: Native input bridge for Korri"
type: feat
status: active
date: 2026-05-03
origin: docs/brainstorms/2026-05-03-native-input-bridge-requirements.md
---

# feat: Native input bridge for Korri

## Overview

Build a native input bridge so Korri can consume controller input on the AYN Odin 2 Portal — and, by the same path, on the eventual Electrobun deployment. ROCKNIX disables the `joydev` kernel module, which permanently prevents Chromium's web Gamepad API from seeing any controller on the device. The fix is architectural: a small Bun process on the device reads `/dev/input/event*`, ships schema-typed raw events over WebSocket, and a new renderer-side adapter feeds them onto Korri's existing input bus as semantic actions.

The bridge is device-class agnostic from day one (gamepad / keyboard / mouse / touch / unknown) but only emits gamepad-class events for MVP. Raw `(type, code, value)` tuples on the wire reserve the architectural option for future Korri-during-gameplay overlays without re-shaping the transport.

## Problem Frame

Korri runs on the Odin under ROCKNIX. ROCKNIX deliberately disables `joydev` (commit `75e6dd0` on the ROCKNIX `next` branch, 2026-05-03 — `# CONFIG_INPUT_JOYDEV is not set`), routing all controller input through InputPlumber. Consequence: Chromium has no `/dev/input/js*` device to enumerate via the web Gamepad API. The personal MVP defined in `docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md` cannot ship without controller input on the device — the Odin has no built-in keyboard or mouse in normal use.

The brainstorm (`docs/brainstorms/2026-05-03-native-input-bridge-requirements.md`) selected:
- Raw `(type, code, value)` tuples on the wire; semantic mapping in the renderer.
- Device-class agnostic schema from day one; gamepad-class emitted for MVP.
- Validation surface: Odin Chromium kiosk, not the Level 2 dev loop.
- Toggle daemon stays parallel; migration is a follow-up.
- Web `gamepad-adapter.ts` keeps coexisting; on the Odin it sees no devices and never fires.

This plan implements those decisions.

## Requirements Trace

**Wire shape and device coverage** *(from brainstorm)*

- R1. Raw `(type, code, value)` tuples on the wire — Units 1, 3, 4
- R2. Device-class tag on every event — Units 2, 3
- R3. Stable device-id on every event — Units 2, 3
- R4. Schema-typed end-to-end via Effect Schema — Unit 3

**Device-side reader**

- R5. Automatic device discovery and class identification — Unit 2
- R6. Reader survives device hot-plug — Unit 4
- R6a. Renderer adapter survives transport drops — Unit 6
- R7. MVP emits only gamepad-class on the wire; other classes recognized but gated — Units 2, 4

**Renderer adapter**

- R8. Conforms to the existing `InputAdapter` contract; no component-level API changes — Unit 6
- R9. Source discriminator value is `"native"`; treated as a directional source by input-mode — Units 6, 7
- R10. Coexists with `gamepad-adapter.ts` without arbitration logic — Unit 7

**Validation surface**

- R11. Proven against the Odin Chromium kiosk loop — Unit 8 (on-device smoke), Unit 5 (kiosk launch path)
- R12. Round-trip: chord opens Korri → d-pad/stick navigates → A launches → game runs → exit returns — Unit 8

## Scope Boundaries

- **Toggle daemon migration is out.** The existing `korri-toggle-daemon` keeps its own `evtest` parser. Two `/dev/input/event*` readers coexist on the Odin briefly; reads are idempotent.
- **Removal of the web `gamepad-adapter.ts` is out.** It stays for laptop-with-USB-controller dev/Storybook; harmless on the Odin.
- **Multi-controller arbitration is out.** Wire schema reserves a device-id field; MVP is single-controller.
- **Per-game controller passthrough during gameplay is out.** Once a game launches, ROCKNIX/the emulator owns `/dev/input/*`. The bridge is dormant until Korri is foreground again.
- **Electrobun-specific IPC transport is out.** Loopback WebSocket carries today and tomorrow; an IPC swap is a transport-level change that does not touch the schema or adapter contract.
- **Renderer-side semantic mapping for non-gamepad classes is out.** Other classes are tagged on the wire but the adapter only consumes gamepad-class events for MVP.
- **Level 2 dev loop validation is out as a success criterion** (R11 explicitly chose kiosk).

### Deferred to Separate Tasks

- Toggle daemon migration to a thin subscriber on the same event stream — separate PR after this lands.
- Renderer-side semantic mapping for keyboard/mouse/touch classes — when a real consumer (e.g., Bluetooth keyboard on the Odin) appears.
- Replacement of WebSocket transport with Electrobun bridge IPC — when latency on loopback WS shows up in a flame graph (it likely won't).
- "Quit to ES" affordance inside Korri — eventually retires the chord; see brainstorm option C, deferred.

## Context & Research

### Relevant Code and Patterns

- `korri/shared/input/types.ts` — `InputAction` discriminated union; `InputAdapter` contract; `InputSource` tag. Source of truth for what adapters emit.
- `korri/shared/input/bus.ts` — `createInputBus()` pub/sub. New adapters attach via `bus.use(adapter)`; adapters are pure.
- `korri/shared/input/gamepad-adapter.ts` — closest reference for the renderer adapter's hold/repeat state machine (`tickHold`, `repeatDelayMs`, `repeatIntervalMs`, dominant-axis stick selection). The native adapter ports the same shape, replacing rAF-driven polling with WS-driven events.
- `korri/shared/input/keyboard-adapter.ts` — reference for adapter naming, options-object shape, default keymap pattern.
- `korri/shared/input/pointer-adapter.ts` and `wheel-adapter.ts` — reference for non-poll-driven event sourcing and the source discriminator pattern.
- `korri/shared/navigation/start.ts` — central wiring point; new `native?: false | NativeAdapterOptions` flag follows the existing `keyboard | gamepad | pointer | wheel` opt-out shape. The input-mode dispatch matrix lives here.
- `korri/shared/navigation/input-mode.ts` and `input-mode.test.ts` — directional-vs-pointer mode store; `"native"` joins keyboard and gamepad as a directional source.
- `korri/shared/primitives/components/Tilegrid/Tilegrid.gamepad.story.e2e.ts` — canonical fake-driver pattern for adapter E2E (`addInitScript` install + `window.__fake*` driver). Native E2E follows the same shape with a fake WS server.
- `korri/products/app/api/library/list.rpc.ts` and `list.rpc-handler.ts` — reference for Effect Schema class-based wire payloads (`Schema.Class<T>("Name")(...)`) and `Rpc.make` pattern. The bridge wire schema follows the same conventions.
- `korri/shared/api/rpc/errors.ts` — `Schema.TaggedErrorClass`, discriminated `_tag` errors. Bridge transport-level errors follow the same pattern.
- `tools/scripts/odin-install-korri-toggle.sh` — reference for the device-side `/dev/input/event*` discovery pattern (name match via `/sys/class/input/${dev##*/}/device/name`), `setsid` daemon supervision, `/storage/bin/` install location, log file conventions.
- `tools/scripts/odin-run-api.sh` — reference for the device-side Bun runner shape (env loading from `/storage/korri/.env`, `exec /storage/bin/bun run …`). The bridge runner is a sibling.
- `tools/scripts/odin-dev.sh` — reference for the Odin iteration loop's reverse-SSH tunnel and remote-process supervision via `setsid`.
- `tools/http/server.ts` — current API server entry; uses `@hono/node-server`. Note: not modified by this plan; the bridge is a separate process.
- `vite.config.mjs` — `KORRI_API_PROXY_TARGET` env var precedent for Tailscale-aware dev URLs. The bridge URL follows the same env-driven shape.
- `korri/deploy/portal/main.tsx` — composition root that calls `startSpatialNavigation`. Native adapter enabled here when bridge URL is set.

### Institutional Learnings

- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — components stay native HTML; new adapters are one new file conforming to `InputAdapter`; do not reach into `window.__korriSpatialNav` from product code. The native bridge is the canonical example of this extension point.
- `docs/solutions/best-practices/pointer-aware-spatial-navigation-2026-05-01.md` — established the `source: InputSource` discriminator and the input-mode dispatch matrix. The native adapter adds `"native"` to the directional set.
- `docs/solutions/integration-issues/reverse-ssh-tunnel-for-odin-chromium-vite-2026-05-03.md` — the kiosk validation path used by Unit 8. Confirms loopback URLs work reliably; LAN URLs from ROCKNIX do not.
- `docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md` — the kiosk lifecycle gotchas (essway respawn) that the toggle daemon already handles. Bridge does not interact with this; the existing toggle still owns ES↔Korri swap.
- `docs/development/standards.md` — Effect Schema is the wire-format vocabulary; tests use real implementations with configurable knobs (no Mock/Stub/Fake type names); shared layers cannot import product-specific code.

### External References

- Linux kernel `linux/input.h` — `struct input_event` definition (24 bytes on aarch64: 16-byte timeval + `__u16 type` + `__u16 code` + `__s32 value`).
- Linux kernel `Documentation/input/event-codes.rst` — `EV_KEY`, `EV_ABS`, `EV_REL` semantics; `KEY_*` / `BTN_*` / `ABS_*` code constants used by the renderer-side mapping table.
- `/proc/bus/input/devices` format reference — line prefixes `I:`/`N:`/`P:`/`S:`/`H:`/`B:` and the bitmask encoding under `B:` lines used by Unit 2's class detection.
- Bun WebSocket server reference (`Bun.serve({ websocket })`) — the device-side WS host primitive for Unit 4. Bun-native, no `@hono/node-server` involvement.

## Key Technical Decisions

- **Separate Bun process for the bridge, on its own port.** The API server (`tools/http/server.ts`) stays Node-server-based and unchanged. The bridge lives in `tools/odin/input-bridge.ts`, runs under Bun on the Odin, hosts its own WebSocket server. Rationale: (1) the bridge is Odin/Electrobun-only and should not entangle the cross-environment API server contract; (2) `@hono/node-server` does not natively support WS upgrades while Bun's native WebSocket server does; (3) different lifecycle — input bridge restarts should not restart RPC; (4) different permission profile — bridge needs `/dev/input/event*` read access (root on the Odin) but does not need to host the RPC surface.
- **Single common wire shape with a `class` field, not a discriminated union per class.** Kernel evdev events are uniform `(type, code, value, deviceId, timestamp)` regardless of device class. The `class` field is metadata for the renderer's mapping strategy, not a payload-shape discriminator. Keeps the schema a single readable record.
- **Three event kinds on the wire: `device-added`, `device-removed`, `input`.** Input events are the bulk of traffic; device events frame them so the renderer adapter knows which devices exist and what classes they are without re-querying. Same Schema.Union pattern as `ApiError` in `korri/shared/api/rpc/errors.ts`.
- **Class detection from `/proc/bus/input/devices`, not per-device `/sys` walks.** `/proc/bus/input/devices` is one parse for all devices, with `B:` lines exposing capability bitmasks (`EV`, `KEY`, `ABS`, `REL`). Class is derived from the bitmasks: `BTN_GAMEPAD` or `BTN_JOYSTICK` → gamepad; `KEY_A..Z` range → keyboard; `REL_X` + `REL_Y` → mouse; `BTN_TOUCH` or `ABS_MT_*` → touch. Anything else → unknown.
- **Stable device-id from `/sys/class/input/eventN/device/uniq` (or `phys` fallback), not the event-node path.** Event-node ordering can shift across reboots if hot-plug ordering changes. The kernel-exposed `uniq` (USB serial) or `phys` (port path) is stable.
- **Renderer adapter ports the gamepad hold/repeat state machine.** The existing `gamepad-adapter.ts` `tickHold` logic (initial press → `repeatDelayMs` → `repeatIntervalMs`) is the right semantic for the native adapter too. Extracting it to a shared module is tempting but adds a coupling seam; the duplication is small and the two adapters may diverge subtly. Decision: copy the pattern in Unit 6, do not extract until a third consumer appears.
- **Renderer connects via env-driven URL.** `VITE_KORRI_NATIVE_BRIDGE_URL` (e.g., `ws://sm8550:3002`, `ws://localhost:3002`, or unset to disable). Unset → native adapter is not started. Set → adapter opens the WS at app boot. Same env-var-driven shape as `KORRI_API_PROXY_TARGET`.
- **Test posture: real WebSocket server in adapter unit tests.** No mocked sockets, no Mock/Stub/Fake type names. Tests stand up a real `WebSocketServer` (or Bun equivalent) on an ephemeral port, the adapter connects, the test pushes typed events. Matches `docs/development/standards.md` and `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md`.
- **No new top-level path alias.** Native bridge code uses existing `@shared/input/native/*` (parser, discovery, schema, renderer adapter) and `tools/odin/*` (device-side runner). One project alias per layer per the standards doc.

## Open Questions

### Resolved During Planning

- **Where does device-side code live?** Three layers: (1) pure parsing + discovery + schema in `korri/shared/input/native/` (shared, laptop-testable); (2) Bun runner + WS server in `tools/odin/input-bridge.ts` (device-side); (3) renderer adapter in `korri/shared/input/native-adapter.ts` (alongside other adapters). Per layering rules in `docs/development/standards.md`.
- **One process or two on the Odin?** Two — the bridge is a separate Bun process per Key Decision above.
- **Which port?** Bridge defaults to `3002` (configurable via `KORRI_INPUT_BRIDGE_PORT`). API stays on `3001`. Renderer connects via `VITE_KORRI_NATIVE_BRIDGE_URL`.
- **Wire schema shape?** Single common record per event with a `class` field; three event kinds (`input`, `device-added`, `device-removed`) under a `Schema.Union`. See High-Level Technical Design.
- **How does the toggle daemon stay alive alongside the bridge?** Untouched. The bridge is a separate `setsid`-detached process supervised by a sibling of `tools/scripts/odin-run-api.sh`. Both readers open their own file descriptors on `/dev/input/event*`; kernel reads are idempotent.

### Deferred to Implementation

- **Exact mapping table from raw events to `InputAction` for the gamepad class.** Implementer ports from `gamepad-adapter.ts` but the table itself is small and codified inside Unit 6. Hold/repeat timings come from the existing defaults (`repeatDelayMs: 400`, `repeatIntervalMs: 100`).
- **Reconnect/backoff timings** for both the device-side reader (when the InputPlumber virtual controller drops) and the renderer adapter (when the WS drops). Likely 250 ms initial, exponential to a 5 s ceiling, but tune at implementation time once observed on the device.
- **Whether to commit captured `/proc/bus/input/devices` and event-stream byte fixtures from the Odin or generate them in the test harness.** Capturing once is simpler; generating reduces fixture drift. Decide when writing Unit 1 and Unit 2 tests.
- **Boot-time race window** between renderer connect and bridge ready. Adapter must tolerate "WS not yet listening" by retrying. Specific retry behavior is implementer's call within the constraints of R6a.
- **Whether the device-side process logs to its own file or stdout.** Mirror `odin-run-api.sh` (`/storage/korri-input-bridge.log` via redirect) unless implementation reveals a reason to differ.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Architecture

```text
┌─────────── device (Odin today, Electrobun host tomorrow) ────────────┐
│                                                                       │
│  /dev/input/event*                                                    │
│       │                                                               │
│       │  raw 24-byte input_event structs                              │
│       ▼                                                               │
│  korri/shared/input/native/parse-evdev.ts          ┐                  │
│       │                                            │ pure, shared     │
│       ▼                                            │ unit-testable    │
│  korri/shared/input/native/discover-devices.ts     │ on a laptop      │
│       │                                            │                  │
│       ▼                                            │                  │
│  korri/shared/input/native/wire-schema.ts          ┘                  │
│       │ schema-typed { input | device-added | device-removed }        │
│       ▼                                                               │
│  tools/odin/input-bridge.ts   (Bun process, port 3002)                │
│       │  Bun.serve({ websocket })                                     │
│       │                                                               │
└───────┼───────────────────────────────────────────────────────────────┘
        │
        │  ws://… (kiosk: loopback;  dev: Tailscale)
        │
        ▼
korri/shared/input/native-adapter.ts   (renderer-side InputAdapter)
        │  decodes wire events, maps gamepad class → InputAction
        │  applies hold/repeat state machine (ported from gamepad-adapter.ts)
        │  source: "native" on every emission
        ▼
existing korri/shared/input/bus.ts (InputBus)
        │
        ▼
existing korri/shared/navigation/focus-engine.ts (LRUD)
        │
        ▼
existing korri/shared/navigation/use-input-action.ts (product code)
```

### Wire Schema Shape (directional sketch)

```text
NativeInputDeviceClass = "gamepad" | "keyboard" | "mouse" | "touch" | "unknown"

NativeInputDeviceInfo {
  deviceId: string                  # stable id from /sys (uniq or phys)
  class: NativeInputDeviceClass
  name: string                      # human-readable, from kernel
  capabilities: readonly string[]   # e.g., ["EV_KEY", "EV_ABS", "BTN_GAMEPAD"]
}

NativeInputEvent =
  | { kind: "input"
      deviceId: string
      class: NativeInputDeviceClass   # carried with each input for renderer convenience
      type: number                    # EV_KEY, EV_ABS, EV_REL, …
      code: number                    # KEY_A, BTN_GAMEPAD, ABS_X, …
      value: number                   # press=1, release=0, axis=-32768..32767, etc.
      timestamp: number               # ms since epoch (or device-monotonic; planning to choose)
    }
  | { kind: "device-added"
      device: NativeInputDeviceInfo
    }
  | { kind: "device-removed"
      deviceId: string
    }

# WS subscription frame (client → server): announce which classes the client wants.
# MVP: { classes: ["gamepad"] }. Future overlays send broader subscriptions.
NativeInputSubscription {
  classes: readonly NativeInputDeviceClass[]
}
```

### Gamepad-Class Mapping Table (directional sketch)

```text
type=EV_KEY, code=BTN_A     (304) → InputAction.confirm
type=EV_KEY, code=BTN_B     (305) → InputAction.back
type=EV_KEY, code=BTN_Y     (308) → InputAction.options
type=EV_KEY, code=BTN_START (315) → InputAction.menu
type=EV_KEY, code=BTN_DPAD_UP    (544) → direction.up   (with hold/repeat)
type=EV_KEY, code=BTN_DPAD_DOWN  (545) → direction.down (with hold/repeat)
type=EV_KEY, code=BTN_DPAD_LEFT  (546) → direction.left (with hold/repeat)
type=EV_KEY, code=BTN_DPAD_RIGHT (547) → direction.right(with hold/repeat)
type=EV_ABS, code=ABS_X          → dominant-axis selection → direction (with hold/repeat)
type=EV_ABS, code=ABS_Y          → dominant-axis selection → direction (with hold/repeat)
type=EV_ABS, code=ABS_HAT0X      → digital direction left/right (with hold/repeat)
type=EV_ABS, code=ABS_HAT0Y      → digital direction up/down    (with hold/repeat)
all other codes → ignored for MVP (carried on the wire, dropped by the adapter)
```

## Implementation Units

### Phase 1: Pure foundations (laptop-testable)

- [x] **Unit 1: evdev parser**

**Goal:** Decode a stream of `/dev/input/event*` bytes into typed event records. Pure, no I/O.

**Requirements:** R1

**Dependencies:** None.

**Files:**
- Create: `korri/shared/input/native/parse-evdev.ts`
- Test: `korri/shared/input/native/parse-evdev.test.ts`
- Create: `tools/testing/fixtures/evdev/xbox-press-a.bin` (committed binary fixture)
- Create: `tools/testing/fixtures/evdev/xbox-dpad-right.bin`
- Create: `tools/testing/fixtures/evdev/xbox-axes.bin`

**Approach:**
- Export `parseEvdevBytes(bytes: Uint8Array): { events: EvdevEvent[]; remainder: Uint8Array }`. Returns parsed events plus any trailing partial buffer for callers to prepend on the next read.
- `EvdevEvent` is `{ tvSec: number, tvUsec: number, type: number, code: number, value: number }` — kernel-shape, not yet wire-shape.
- 24-byte struct on aarch64: `[16-byte timeval][__u16 type][__u16 code][__s32 value]`. Use `DataView` over `bytes.buffer` and read as little-endian.

**Execution note:** Write the parser tests first. Behavior is mechanical and easy to specify; failing tests up front prevent off-by-one byte indexing bugs.

**Patterns to follow:**
- Pure helper module shape used elsewhere under `korri/shared/library/` (no React, no Effect — this is a leaf utility).

**Test scenarios:**
- Happy path: single 24-byte event for `EV_KEY` / `BTN_A` / value=1 decodes to the expected record. Read fixture `xbox-press-a.bin`.
- Happy path: a buffer containing 5 sequential events decodes to 5 records in order. Read fixture `xbox-dpad-right.bin`.
- Edge case: empty `Uint8Array` returns `{ events: [], remainder: Uint8Array(0) }`.
- Edge case: a 30-byte buffer (one full event + 6 partial bytes) returns one event plus a 6-byte remainder.
- Edge case: a 12-byte buffer (no full event) returns no events and a 12-byte remainder.
- Edge case: `value` is a signed 32-bit (test a negative analog axis sample, `ABS_X` value=-2048, decoded as `-2048` not as a large unsigned number).
- Integration scenario: simulate a streaming-read pattern by parsing `[full event][partial]`, then prepending the partial to the next chunk, and asserting all events emerge in order across the boundary.

**Verification:**
- `bun test korri/shared/input/native/parse-evdev.test.ts` reports all scenarios green.
- TypeScript types check via `just typecheck`.

---

- [x] **Unit 2: Device discovery + class detection**

**Goal:** Parse `/proc/bus/input/devices` content into `NativeInputDeviceInfo` records, classifying each device by its kernel capability bitmasks.

**Requirements:** R2, R3, R5, R7

**Dependencies:** None (pure parser; the actual `/proc` read happens in Unit 4).

**Files:**
- Create: `korri/shared/input/native/discover-devices.ts`
- Test: `korri/shared/input/native/discover-devices.test.ts`
- Create: `tools/testing/fixtures/proc/bus-input-devices-odin.txt` (committed text fixture captured from the Odin)
- Create: `tools/testing/fixtures/proc/bus-input-devices-laptop.txt` (a laptop-side capture for breadth)

**Approach:**
- Export `parseProcBusInputDevices(content: string): readonly DiscoveredDevice[]`. Pure.
- `DiscoveredDevice = { deviceId, class, name, eventNode, capabilities }`. `eventNode` is `event9` etc. (extracted from the `H:` line).
- Class detection from the `B: KEY=…` and `B: ABS=…` bitmask lines: decode each space-separated hex word as a bit set, then check for marker bits — `BTN_GAMEPAD` (0x130 = bit 304), `BTN_JOYSTICK` (0x120 = bit 288), `KEY_A` (0x1e = bit 30), `REL_X` (bit 0), `BTN_TOUCH` (0x14a = bit 330), `ABS_MT_*` (bits 47-63). Marker → class mapping per the Key Decisions section.
- `deviceId`: prefer the value from a `U: Uniq=…` line if present; otherwise fall back to the `P: Phys=…` value.
- `capabilities`: include readable summary tags such as `["EV_KEY", "EV_ABS", "BTN_GAMEPAD"]` for diagnostics; not used by the renderer for MVP but exposed on the wire.

**Execution note:** Write the test against the committed Odin fixture first. The fixture is the source of truth for what the parser must classify correctly; deviation from the Odin's actual content is the regression to catch.

**Patterns to follow:**
- Pure helper module shape (same as Unit 1).
- Fixture-driven test pattern from existing parsers under `korri/shared/library/` (e.g., the gamelist parser referenced in the personal MVP plan).

**Test scenarios:**
- Happy path: parse the committed Odin fixture; the InputPlumber virtual Xbox controller is identified with `class: "gamepad"`, the right `eventNode`, and a stable `deviceId`.
- Happy path: parse the laptop fixture; a USB keyboard appears as `class: "keyboard"`, a mouse as `class: "mouse"`.
- Edge case: device with no `U: Uniq=` line falls back to `P: Phys=` for `deviceId`.
- Edge case: device with neither produces a `deviceId` derived from the event-node path with a documented fallback (last-resort, logged as a warning the caller can act on).
- Edge case: a device with `BTN_GAMEPAD` set wins over `KEY_A` set when both are present (some joysticks expose KEY range).
- Edge case: a device with no recognizable class bits classifies as `"unknown"`.
- Edge case: empty input returns `[]`.
- Edge case: malformed `B:` line is skipped without throwing; other devices in the same input still parse.

**Verification:**
- `bun test korri/shared/input/native/discover-devices.test.ts` reports all scenarios green.
- Visual inspection of the committed fixture content matches the device the user actually has plugged in (recorded via `cat /proc/bus/input/devices` on the Odin).

---

- [x] **Unit 3: Wire schema**

**Goal:** Effect Schema definitions for `NativeInputEvent` (union of `input` / `device-added` / `device-removed`), `NativeInputDeviceInfo`, `NativeInputSubscription`. Round-trip tested.

**Requirements:** R1, R2, R3, R4

**Dependencies:** None (the schema is independent of the parser; downstream units consume it).

**Files:**
- Create: `korri/shared/input/native/wire-schema.ts`
- Test: `korri/shared/input/native/wire-schema.test.ts`

**Approach:**
- Use `Schema.Class<T>("Name")(...)` for each variant, matching the pattern in `korri/products/app/api/library/list.rpc.ts`.
- `NativeInputEvent` is a `Schema.Union([NativeInputInput, NativeInputDeviceAdded, NativeInputDeviceRemoved])` with the `kind` field as the `_tag` discriminator (or as an explicit discriminator field — implementer's call based on the v4 Schema idiom).
- `NativeInputDeviceClass` is a `Schema.Literals(["gamepad", "keyboard", "mouse", "touch", "unknown"])`.
- Field shapes per the Key Decisions section.
- `NativeInputSubscription` is the client→server frame: `{ classes: Schema.Array(NativeInputDeviceClass) }`.

**Patterns to follow:**
- `korri/products/app/api/library/list.rpc.ts` for `Schema.Class` declarations.
- `korri/shared/api/rpc/errors.ts` for `Schema.Union` over multiple `Schema.Class` variants.

**Test scenarios:**
- Happy path: encode an `input` variant to JSON via `Schema.encode`, decode via `Schema.decode`, assert structural equality.
- Happy path: encode a `device-added` variant including `capabilities: readonly string[]`, decode, assert.
- Happy path: encode a `device-removed` variant, decode, assert.
- Edge case: decoding an unknown `kind` value fails with a `ParseError`.
- Edge case: decoding an `input` event with `class: "lava-lamp"` (not in the literal set) fails with a `ParseError`.
- Edge case: encoding an `input` with a non-numeric `value` fails at the type level (no test needed) and `Schema.decode` of the same JSON shape fails at runtime.
- Integration scenario: round-trip a buffer of 100 mixed events via `Schema.encode` → JSON → `Schema.decode`, assert all 100 round-trip identically.

**Verification:**
- `bun test korri/shared/input/native/wire-schema.test.ts` reports all scenarios green.
- TypeScript types: `NativeInputEvent` is exhaustively narrowable by `kind` in a `switch` (tested by writing a small exhaustiveness assertion in the test file).

---

### Phase 2: Device-side bridge (on Odin)

- [x] **Unit 4: Device-side bridge process**

**Goal:** A Bun process running on the Odin that opens `/dev/input/event*`, pipes parsed events through, hosts a WebSocket server on port 3002, fans events out to subscribed clients, and survives device hot-plug.

**Requirements:** R1, R5, R6, R7

**Dependencies:** Units 1, 2, 3.

**Files:**
- Create: `tools/odin/input-bridge.ts`
- Test: `tools/odin/input-bridge.test.ts`

**Approach:**
- Entry point: `tools/odin/input-bridge.ts`. Reads env: `KORRI_INPUT_BRIDGE_PORT` (default 3002), `KORRI_INPUT_BRIDGE_LOG` (default `/storage/korri-input-bridge.log`).
- On boot: parse `/proc/bus/input/devices` via Unit 2; emit one `device-added` per discovered device to all connected subscribers (filtered by their subscribed classes).
- Open a Bun read stream on each gamepad-class device's event node. Pipe bytes through Unit 1's parser, transform each `EvdevEvent` into a wire-shape `input` event, fan out to subscribed clients.
- Watch `/proc/bus/input/devices` for changes (poll every 1 s; the file is small and the Odin is single-purpose). On change, diff against the previous snapshot, emit `device-removed` for missing devices, `device-added` for new ones, and open/close streams accordingly.
- WS server: `Bun.serve({ port, websocket: { open, message, close } })`. On open, attach an empty `classes` subscription. On `message`, decode `NativeInputSubscription` via the schema; update the subscription set. On close, detach.
- Logging: project logger pattern from `korri/shared/logger/` if importable from Bun, otherwise a small `pino` direct call (the module already ships with the API server's deps).
- Process lifecycle: on `SIGTERM` / `SIGINT`, close all event-node streams, close the WS server, exit 0.

**Execution note:** The unit test exercises the bridge end-to-end with a fake `/dev/input/event*` source — pipe a fixture buffer into the parser path and assert subscribers receive the expected wire events. No mocks of `Bun.serve` or `WebSocket`; use the real ones on an ephemeral port.

**Patterns to follow:**
- `tools/scripts/odin-install-korri-toggle.sh`'s daemon shape — `find_gamepad_event` device-discovery loop, `evtest`-streaming loop, `setsid`-friendly process posture.
- `tools/http/server.ts` for the lifecycle (signal handling, structured shutdown).

**Test scenarios:**
- Happy path: a connected client subscribes to `["gamepad"]`; the bridge feeds in a fixture event stream; the client receives the parsed events in order, schema-decoded.
- Happy path: a client connecting after a `device-added` has already fired receives a synthetic `device-added` for each currently-known device on subscription confirmation (so the client always knows the device set).
- Edge case: a client subscribes to `[]` (no classes); the bridge opens connections but emits nothing.
- Edge case: a client subscribes to `["keyboard"]`; the bridge emits no events for MVP (no keyboard streams opened) but does emit a `device-added` for any discovered keyboard.
- Error path: the WS server cannot bind to the configured port; the process logs the error and exits non-zero. (Tested by binding a sentinel server on the port first.)
- Error path: a malformed subscription frame is rejected; the WS connection stays open; no events flow until a valid subscription arrives.
- Integration scenario: simulate device hot-plug by modifying the fixture-backed `/proc` snapshot mid-test; the bridge emits `device-removed` then `device-added`; the client receives both in order.
- Integration scenario: kill and respawn a fixture-backed device-stream mid-flight; the bridge reconnects the stream and event flow resumes (proves R6 — survives hot-plug). Reconnect must not duplicate or skip events compared to a single uninterrupted stream.

**Verification:**
- `bun test tools/odin/input-bridge.test.ts` reports all scenarios green on a laptop (uses fixture-backed `/proc` content and fixture-backed event byte streams).
- On the Odin, `/storage/bin/bun run /storage/korri/tools/odin/input-bridge.ts` starts cleanly, logs `bridge listening on :3002`, lists at least the InputPlumber virtual controller.
- A manual `wscat -c ws://sm8550:3002 -x '{"classes":["gamepad"]}'` (or curl-equivalent) followed by pressing buttons on the controller produces decoded JSON events.

---

- [ ] **Unit 5: Device supervision and bootstrap integration**

**Goal:** Install scripts and `just` recipes that start, stop, log, and restart the bridge on the Odin alongside the existing API server.

**Requirements:** R6, R11

**Dependencies:** Unit 4.

**Files:**
- Create: `tools/scripts/odin-run-input-bridge.sh`
- Modify: `tools/scripts/odin-bootstrap.sh` (mention bridge in the env/path section if needed)
- Modify: `tools/scripts/odin-dev.sh` (start the bridge process alongside the API; reverse-tunnel its port for Level 2 dev — even though Level 2 is not the success surface, having it work makes manual local sanity-checks easy)
- Modify: `justfile` (add `dev-odin` parameter for bridge port; add `check-odin` smoke for bridge readiness)

**Approach:**
- `odin-run-input-bridge.sh` mirrors `odin-run-api.sh`: load env from `/storage/korri/.env`, set `KORRI_INPUT_BRIDGE_PORT`, `exec /storage/bin/bun run tools/odin/input-bridge.ts`.
- `odin-dev.sh` starts the bridge as a second `setsid`-detached background process via SSH after starting the API; logs to `/storage/korri-input-bridge.log`. The reverse-SSH tunnel adds `-R 3002:127.0.0.1:3002` (or equivalent forward) so the laptop can also hit the bridge for local diagnostics.
- The `just check-odin` recipe gains a bridge-readiness check: open a WS to the bridge, send `{"classes":["gamepad"]}`, expect at least one `device-added` event within 2 s, exit non-zero if not. Lives next to the existing health/RPC checks.
- `justfile` `dev-odin` recipe: existing parameters plus `bridge_port="${ODIN_INPUT_BRIDGE_PORT:-3002}"`.

**Patterns to follow:**
- `tools/scripts/odin-run-api.sh` for runner shape.
- `tools/scripts/odin-dev.sh` for `setsid` + reverse-tunnel patterns.
- `tools/scripts/odin-smoke.sh` and `tools/scripts/odin-smoke-rpc.ts` for the smoke-check shape.

**Test scenarios:**
- Test expectation: none for shell scripts in the unit-test layer; verification is operational (per `Verification` below).
- Optional: a `tools/odin/check-bridge.test.ts` that runs the smoke-script equivalent against a local `Bun.serve` stub instance for CI safety. Decide during implementation whether the `check-odin` recipe alone is sufficient.

**Verification:**
- `just dev-odin` brings up the API and the bridge; `ssh sm8550 'pgrep -af input-bridge'` shows one process; `tail /storage/korri-input-bridge.log` shows `bridge listening on :3002`.
- `just check-odin` exits 0 when both API and bridge are healthy; exits non-zero with a clear message when the bridge is down (test by `ssh sm8550 'pkill -f input-bridge.ts'` then re-running `just check-odin`).
- After Ctrl-C of `just dev-odin`, the next invocation cleanly replaces the previous bridge process (matches the existing API behavior).

---

### Phase 3: Renderer integration

- [ ] **Unit 6: Renderer-side native adapter**

**Goal:** A new `InputAdapter` that opens the WS to the bridge, decodes wire events via Unit 3's schema, applies the gamepad hold/repeat state machine, and emits `InputAction`s onto the bus with `source: "native"`. Survives WS drops.

**Requirements:** R6a, R8, R9, R10

**Dependencies:** Unit 3 (schema), Unit 4 (a bridge to test against).

**Files:**
- Create: `korri/shared/input/native-adapter.ts`
- Test: `korri/shared/input/native-adapter.test.ts`

**Approach:**
- Export `createNativeInputAdapter(options: NativeInputAdapterOptions): InputAdapter`.
- `NativeInputAdapterOptions`: `{ url: string; subscribe?: readonly NativeInputDeviceClass[]; reconnect?: { initialDelayMs?, maxDelayMs?, factor? }; axisThreshold?, repeatDelayMs?, repeatIntervalMs? }`. Defaults: subscribe `["gamepad"]`; reconnect `250 → 5000 ms` exponential; gamepad timings copied from `gamepad-adapter.ts` defaults.
- `start(emit)`:
  1. Open `new WebSocket(options.url)`.
  2. On `open`, send the subscription frame encoded via Unit 3's schema.
  3. On `message`, decode via Unit 3's schema; route by `kind`. For `kind: "input"` and `class: "gamepad"`, run through the gamepad mapping table (Key Decisions sketch) and the hold/repeat state machine.
  4. On `close` or `error`, schedule a reconnect with exponential backoff up to the ceiling. Re-emit the subscription on reconnect.
  5. Returns a disposer that closes the WS and cancels any pending reconnect timer.
- The hold/repeat state machine is a near-copy of `gamepad-adapter.ts`'s `tickHold` / `tickButton` logic, but driven by event arrival rather than rAF polling. For analog axes (`ABS_X`/`ABS_Y`), maintain a `lastValue` per axis and re-evaluate the dominant-axis direction on each event; emit on threshold crossings and via repeat timing.
- `name: "native"`. `source: "native"` on every emission.

**Execution note:** Test against a real `Bun.serve({ websocket })` server stood up in the test setup. Send fixture wire events; assert the adapter emits the expected `InputAction`s. No mocking of `WebSocket` constructor.

**Patterns to follow:**
- `korri/shared/input/gamepad-adapter.ts` — adapter shape, hold/repeat state machine, dominant-axis selection. Copy the patterns; do not extract into a shared module yet (per Key Decisions).
- `korri/shared/input/keyboard-adapter.ts` — adapter naming, options-object shape.
- `korri/shared/input/wheel-adapter.ts` — non-poll-driven event sourcing pattern.

**Test scenarios:**
- Happy path: bridge sends `{ kind: "input", class: "gamepad", type: EV_KEY, code: BTN_A, value: 1 }`; adapter emits `{ type: "confirm", source: "native" }`. Same shape across BTN_B/Y/START.
- Happy path: bridge sends a single `BTN_DPAD_RIGHT` press (value=1 then value=0); adapter emits exactly one `direction: "right"` (no repeat).
- Happy path: bridge holds `BTN_DPAD_RIGHT` (value=1, no release); adapter emits one initial `right`, waits `repeatDelayMs`, then emits `right` every `repeatIntervalMs`. Test by feeding events at known timestamps.
- Happy path: bridge sends `ABS_X` value=24000 (above threshold); adapter emits `direction: "right"` once. Subsequent `ABS_X` value=0 stops the hold.
- Happy path: bridge sends `ABS_X=20000, ABS_Y=10000`; dominant-axis selection produces `direction: "right"`, not `"down"`.
- Edge case: bridge sends an `input` event with `class: "keyboard"`; adapter ignores it (MVP does not consume keyboard).
- Edge case: bridge sends a `device-added` event; adapter logs (via project logger) and otherwise ignores. Does not emit any `InputAction`.
- Edge case: bridge sends a malformed JSON message; adapter logs an error; the connection stays open.
- Error path: WS connection refused at boot; adapter retries with exponential backoff; verify the second attempt happens at `initialDelayMs` and the third at `initialDelayMs * factor`.
- Error path: WS opens, then drops mid-stream; adapter reconnects; the next event from the bridge is consumed normally (proves R6a).
- Integration scenario: subscribe to the bridge, receive a `device-added`, then receive 50 input events; all 50 are decoded and mapped correctly without losing any.

**Verification:**
- `bun test korri/shared/input/native-adapter.test.ts` reports all scenarios green.
- TypeScript types check via `just typecheck`.
- The adapter compiles to a small bundle (no Effect runtime needed at adapter boundary; Schema decoding is effect-free at the call site or wrapped in a minimal `Effect.runSync`).

---

- [ ] **Unit 7: Wire-up in start.ts, types, and composition root**

**Goal:** Plug the native adapter into `startSpatialNavigation`, add `"native"` to `InputSource`, update the input-mode dispatch matrix, and enable the adapter in the portal entry when the bridge URL env var is set.

**Requirements:** R8, R9, R10

**Dependencies:** Unit 6.

**Files:**
- Modify: `korri/shared/input/types.ts` (add `"native"` to `InputSource`)
- Modify: `korri/shared/navigation/start.ts` (add `native: false | NativeInputAdapterOptions` option; wire the adapter; update input-mode dispatch matrix)
- Modify: `korri/shared/navigation/start.test.ts` (cover the new flag and dispatch)
- Modify: `korri/shared/navigation/input-mode.ts` (no behavior change required if the dispatch is centralized in `start.ts`; verify by reading)
- Modify: `korri/shared/navigation/input-mode.test.ts` (extend matrix tests if logic is touched)
- Modify: `korri/deploy/portal/main.tsx` (read `import.meta.env.VITE_KORRI_NATIVE_BRIDGE_URL`; pass to `startSpatialNavigation` when set)

**Approach:**
- `InputSource` becomes `"keyboard" | "gamepad" | "pointer" | "wheel" | "native"`. Type-only addition; no runtime consumer change required other than the input-mode dispatch.
- In `start.ts`, the existing dispatch:

  ```text
  source=pointer|wheel              -> setPointerMode
  source=keyboard|gamepad + direction -> setDirectionalMode
  ```

  becomes:

  ```text
  source=pointer|wheel              -> setPointerMode
  source=keyboard|gamepad|native + direction -> setDirectionalMode
  ```

- New option: `native?: false | NativeInputAdapterOptions`. When `false` or undefined → adapter is not started. When an options object → call `bus.use(createNativeInputAdapter(options))`. Mirror the existing `keyboard | gamepad | pointer | wheel` option shape.
- `main.tsx` reads `import.meta.env.VITE_KORRI_NATIVE_BRIDGE_URL`. When set, pass `{ native: { url: env } }` to `startSpatialNavigation`. When unset, omit the `native` option (adapter not started).
- React skill: this touches `main.tsx` (TSX) but introduces no new component. The Provider/component composition rules do not apply to a one-line conditional in a composition root.

**Patterns to follow:**
- Existing `start.ts` shape — `options.keyboard !== false` opt-out form for adapter wiring.
- `vite.config.mjs` `KORRI_API_PROXY_TARGET` env var precedent for env-driven configuration.

**Test scenarios:**
- Happy path: `startSpatialNavigation({ native: { url: "ws://test" } })` (with a real test WS server on that URL) attaches the adapter; the bus receives events when the server sends them.
- Happy path: `startSpatialNavigation({ keyboard: false, gamepad: false, pointer: false, wheel: false, native: { url: "ws://test" } })` returns a handle whose only adapter is the native one. Verify by sending a fixture event and confirming bus emit.
- Happy path: `startSpatialNavigation({})` (no `native` option) does not attach the native adapter; the bus has only the existing four adapters.
- Edge case: `startSpatialNavigation({ native: false })` is equivalent to omitting the option; native adapter is not attached.
- Integration scenario: a `direction` action with `source: "native"` triggers `setDirectionalMode()` on the input-mode store (cursor hides). Test directly via `bus.emit({ type: "direction", direction: "right", source: "native" })` after `startSpatialNavigation`.
- Integration scenario: a `confirm` action with `source: "native"` does NOT trigger `setDirectionalMode()` (only directions do).

**Verification:**
- `bun test korri/shared/navigation/start.test.ts` reports all scenarios green.
- TypeScript types check via `just typecheck` (the addition of `"native"` to `InputSource` propagates through the bus and the input-mode store without errors).
- A manual run of `VITE_KORRI_NATIVE_BRIDGE_URL=ws://sm8550:3002 just dev-web` opens Vite; pressing buttons on the controller plugged into the Odin moves focus around the home grid in the laptop browser. (Optional preview of Level 2 — not the success surface, but cheap to confirm.)

---

- [ ] **Unit 8: Story-driven E2E + on-device kiosk smoke**

**Goal:** Two complementary verification surfaces. (1) A Playwright story-driven spec proves the renderer adapter wires through to focus changes via a fake WS server in the page. (2) An on-device smoke run verifies R11/R12 — the developer's actual kiosk round-trip works with a real controller.

**Requirements:** R11, R12

**Dependencies:** Unit 7, Unit 5.

**Files:**
- Create: `korri/shared/primitives/components/Tilegrid/Tilegrid.native.story.e2e.ts`
- Create: `tools/scripts/odin-input-smoke.sh` (the on-device smoke script)
- Modify: `justfile` (add `check-odin-input` recipe) — or fold into `check-odin` from Unit 5
- Optional: `tools/odin/check-bridge.test.ts` if Unit 5 deferred this to here

**Approach (E2E spec):**
- Mirror `korri/shared/primitives/components/Tilegrid/Tilegrid.gamepad.story.e2e.ts` shape.
- `addInitScript` overrides the global `WebSocket` constructor so any `new WebSocket(url)` inside the page returns a fake socket whose `.send()` is a no-op and whose `.dispatchEvent` is exposed via `window.__fakeNative`.
- Page loads the same Tilegrid Playground story id (`design-system-tilegrid--playground`). Storybook preview's `startSpatialNavigation` is configured to include the native adapter pointed at any URL (the URL doesn't matter; the WS is fake). For Storybook, this means setting an env var or a story-level decorator that calls `window.__korriSpatialNav?.dispose()` and re-starts spatial nav with the native adapter. Choose the lowest-friction path — likely a per-test `evaluate` block.
- Drive: `window.__fakeNative.dispatch({ kind: "input", class: "gamepad", type: 1, code: 547, value: 1 })` for a d-pad right; assert focus moves.
- Tests parallel the existing gamepad spec: d-pad moves focus; confirm fires click; hold repeats.

**Approach (on-device smoke):**
- `odin-input-smoke.sh`: SSH to the Odin, run a small Bun one-liner that opens the bridge WS, subscribes to gamepad, asserts at least one `device-added` arrives within 2 s, exits 0/1.
- This is the executable form of R11's success criterion. The actual R12 round-trip (chord → navigate → launch → exit) remains a manual verification step the developer performs once, recorded in the plan's verification log (this plan), not automated.

**Patterns to follow:**
- `Tilegrid.gamepad.story.e2e.ts` for the fake-driver init pattern, story-id loading, focused-aria-label assertions, and hold/repeat coverage shape.
- `tools/scripts/odin-smoke-rpc.ts` for the Bun one-liner WS-client smoke shape.

**Test scenarios (E2E spec):**
- Happy path: dispatch a fake `BTN_DPAD_RIGHT` press; `aria-label` of the focused tile changes.
- Happy path: dispatch `BTN_A` press; the focused tile receives a click (use the click-spy pattern from the existing gamepad spec).
- Happy path: hold `BTN_DPAD_RIGHT` (dispatch with value=1, do not dispatch value=0); within `repeatDelayMs + repeatIntervalMs`, focus advances a second time.
- Edge case: dispatch a `device-added` event; no focus change; no click.
- Edge case: dispatch an `input` event with `class: "keyboard"`; no focus change (adapter ignores non-gamepad classes).
- Integration scenario: with the input-mode store enabled, dispatching a fake `direction` event hides the cursor (asserts `document.documentElement.dataset.inputMode === "directional"`).

**Test scenarios (on-device smoke):**
- Happy path: bridge running, controller plugged in; smoke script exits 0 with at least one `device-added` for the gamepad.
- Error path: bridge stopped (`pkill -f input-bridge.ts`); smoke script exits non-zero within its 2 s window.

**Manual verification of R12 (record outcomes here):**
- Press L3+R3+Start chord → Korri opens in kiosk.
- Move the d-pad → focus traverses the home grid; lavender halo follows.
- Press A on a tile → game launches; ROCKNIX takes over the screen.
- Exit the game → return to Korri; focus is restored.
- All steps reachable with the controller alone, no keyboard plugged in.

**Verification:**
- `just test-e2e Tilegrid.native.story` reports all scenarios green (or whatever the project's Playwright-by-name selector is — check `tools/playwright/playwright.component.config.ts`).
- `just check-odin-input` (or `just check-odin` if folded) reports green.
- The manual R12 round-trip succeeds and is recorded in the plan's `Verification` section as a checkbox during execution.

---

## System-Wide Impact

- **Interaction graph:** A new bus producer (`native-adapter.ts`) joins keyboard, gamepad (web), pointer, and wheel. Same pub/sub contract, no race conditions because actions are queued through the bus's snapshot-on-emit. The focus engine is idempotent on the same destination — concurrent emits from web `gamepad-adapter.ts` and native adapter on the same physical input would double-fire, but the second is a no-op (already on the target). On the Odin this never happens because the web adapter sees no devices.
- **Error propagation:** Bridge transport errors (WS drop, malformed frame, unknown event kind) are logged via `@shared/logger` and never bubble into the input bus. The renderer adapter's contract is "best-effort emission of valid actions"; the focus engine is unaware of upstream failures. Reconnect is the only recovery path.
- **State lifecycle risks:** The hold/repeat state machine maintains per-(device, control) `HoldState` in the renderer adapter. On WS reconnect, the adapter resets all hold state (a held button mid-disconnect is treated as released). This is the right default; fancier semantics (re-key the held state on reconnect) can come later if a user complains.
- **API surface parity:** The new `"native"` value in `InputSource` is additive. Existing consumers that switch on `source` (only the input-mode dispatch in `start.ts`) get the new branch in Unit 7. Components using `useInputAction` see no change.
- **Integration coverage:** Unit 8's E2E spec proves end-to-end (fake WS → adapter → bus → focus engine → DOM). Unit 5's `check-odin-input` proves end-to-end on real hardware (real bridge → real WS → manual subscriber). Unit 4's bridge tests prove end-to-end on the device-side path (fixture `/proc` + fixture event bytes → real WS → real client).
- **Unchanged invariants:**
  - `useInputAction` API — no shape change.
  - The rule against reaching into `window.__korriSpatialNav` from product code — no change; product still subscribes via `useInputAction`.
  - The `InputAdapter` contract — no change; native adapter conforms.
  - The web `gamepad-adapter.ts` — unchanged code, unchanged behavior on environments where it works.
  - The toggle daemon and its `evtest` parser — unchanged; the bridge does not interact with the toggle.
  - The API server (`tools/http/server.ts`, `korri/products/app/api/hono-app.ts`, `rpc-server.ts`) — unchanged; bridge is a separate process.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `/proc/bus/input/devices` parsing breaks if the kernel format changes between ROCKNIX releases. | Format is stable across decades of Linux. Unit 2's tests are fixture-driven; if a new ROCKNIX release ships a different format, the captured fixture is updated and the parser adjusted. |
| Stable `deviceId` derivation chosen at planning time (`uniq` → `phys` → fallback) is wrong for InputPlumber's virtual controller specifically. | Unit 2's Odin fixture includes the virtual controller's actual lines; if the chosen heuristic produces an unstable id, the test catches it during development. Worst case: the id is unstable across boots, which only matters when MVP grows to multi-device — at which point we revisit. |
| Bun WebSocket server behavior on aarch64 ROCKNIX has not been validated by this codebase. | The Odin already runs Bun for the API server (`tools/scripts/odin-run-api.sh`); WebSocket support is a Bun core feature, not an aarch64-specific concern. Unit 4's on-device verification step catches the failure early if it exists. |
| Reading `/dev/input/event*` requires root; if someone runs the bridge under a non-root user (e.g., a future Electrobun packaging that sandboxes), reads silently fail. | Documented in the brainstorm under Dependencies/Assumptions and reaffirmed in this plan. The bridge logs an explicit "permission denied opening /dev/input/event9" error so the failure mode is debuggable. |
| The hold/repeat state machine in Unit 6 diverges subtly from `gamepad-adapter.ts`, causing different feel between a USB controller on a laptop (web Gamepad API) and the same controller on the Odin (bridge). | Unit 6 ports the timings (`repeatDelayMs: 400`, `repeatIntervalMs: 100`) and the dominant-axis math verbatim. A side-by-side feel test on a laptop with both adapters running (web disabled normally, but enabled for the test) catches divergence. |
| The on-device validation (R12) requires the developer to be physically present with the Odin and a controller; this slows iteration. | Phases 1 and 3 are laptop-validatable. Phase 2 (Unit 4) has thorough fixture-backed unit coverage so the device test is a confirmation, not a discovery. The on-device smoke (Unit 8) is fast (< 2 s) once the developer is at the device. |
| The web `gamepad-adapter.ts` and the native adapter both emit `direction` for the same physical press in some hypothetical environment that runs both, causing double-step focus moves. | On the Odin, the web adapter sees no devices (joydev disabled). On a laptop with a USB controller and the bridge connected to the Odin, the laptop has no relationship to the Odin's controller. The double-emit case requires running the bridge process on the same machine as the laptop browser AND plugging a controller directly into the laptop — not a real scenario. Documented in System-Wide Impact for completeness. |
| Vite's HMR cycle re-instantiates the native adapter, leaking WS connections during dev. | `start.ts` already handles re-init via `currentHandle?.dispose()` at the top of `startSpatialNavigation`. The native adapter's disposer must close the WS — Unit 6's tests cover this explicitly. |
| `import.meta.env.VITE_*` substitution behavior in the kiosk's Chromium build is different from dev. | Standard Vite production build inlines `import.meta.env.*` into the bundle. The kiosk loads the prod build via the existing portal deploy. No special handling needed; if the URL needs to change between dev and kiosk, both builds set `VITE_KORRI_NATIVE_BRIDGE_URL` correctly via their respective env files. |

## Documentation / Operational Notes

- `docs/development/odin-iterative-loop.md` gains a paragraph noting the new bridge process: ports used, log file location, and how to verify it's running. Update during Unit 5 work.
- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` reference list gets the native adapter added as the canonical "new device" example for that doc's "adding a device is one new file" claim. Optional; do as part of cleanup if there's bandwidth.
- A new `docs/solutions/integration-issues/rocknix-disables-joydev-no-web-gamepad-2026-05-03.md` would capture the architectural rationale (why the bridge exists at all). Per the project's convention against creating docs unless explicitly requested, this is not part of the plan's scope; flag for the developer.
- No production observability change for end users — all bridge metrics are local logs on the device.
- Reverting any single phase: each phase is independently revertable. Phase 1 is pure code with no consumers; Phase 2 only runs on the Odin and is gated by the script; Phase 3 is gated by the env var (unset → adapter dormant).

## Sources & References

- **Origin document:** `docs/brainstorms/2026-05-03-native-input-bridge-requirements.md`
- **Personal MVP this unblocks:** `docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md`
- **Architecture this extends:** `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`, `docs/solutions/best-practices/pointer-aware-spatial-navigation-2026-05-01.md`
- **Existing input adapters (reference):** `korri/shared/input/keyboard-adapter.ts`, `korri/shared/input/gamepad-adapter.ts`, `korri/shared/input/pointer-adapter.ts`, `korri/shared/input/wheel-adapter.ts`
- **Wiring and bus:** `korri/shared/input/bus.ts`, `korri/shared/input/types.ts`, `korri/shared/navigation/start.ts`, `korri/shared/navigation/input-mode.ts`
- **E2E pattern source:** `korri/shared/primitives/components/Tilegrid/Tilegrid.gamepad.story.e2e.ts`
- **Effect Schema patterns:** `korri/products/app/api/library/list.rpc.ts`, `korri/shared/api/rpc/errors.ts`
- **Device-side patterns:** `tools/scripts/odin-install-korri-toggle.sh` (toggle daemon), `tools/scripts/odin-run-api.sh`, `tools/scripts/odin-dev.sh`, `tools/scripts/odin-bootstrap.sh`
- **Server context:** `tools/http/server.ts`, `korri/products/app/api/hono-app.ts`
- **Renderer entrypoint:** `korri/deploy/portal/main.tsx`
- **Build config:** `vite.config.mjs`
- **Standards:** `docs/development/standards.md`, `AGENTS.md`
- **Operational context:** `docs/development/odin-iterative-loop.md`, `docs/solutions/integration-issues/reverse-ssh-tunnel-for-odin-chromium-vite-2026-05-03.md`, `docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md`
- **External:** Linux `linux/input.h` (struct input_event); `Documentation/input/event-codes.rst`; Bun WebSocket server reference.
