# Evier Architecture Deepening Handoff

Date: 2026-06-03
Status: handoff
Scope: Evier architecture opportunities 1–5 from the post-control-surface review

## Context

Evier started as a Moonlight/GameScope test surface and is becoming a long-term developer/operator theme for exercising runtime stream, presentation, and device controls. Recent work introduced `EvierControlSurface` so the React page no longer parses raw `state.get` payloads directly.

Current important files:

- `korri/shared/themes/evier/pages/evier-control-surface.ts`
- `korri/shared/themes/evier/pages/EvierStreamControlPage.tsx`
- `korri/products/app/features/evier/stream-control-rpc-client.ts`
- `korri/products/app/api/stream-control/service.ts`
- `korri/products/app/api/stream-control/rpc-schemas.ts`
- `korri/shared/stream/moonlight-control-protocol.ts`
- `korri/shared/gamescope-control/gamescope-control-protocol.ts`

Existing constraints and decisions:

- Evier displayed values must come from authoritative readback only.
- Command ACK is not applied state.
- Moonlight `command.accepted` must be treated as pending.
- GameScope command success requires readback match.
- Stream/session controls and device controls remain separate concepts.
- Unsupported controls must be capability-gated, not presented as working.
- Sessiond remains foreground lifecycle truth.

Relevant docs:

- `docs/plans/2026-06-03-001-feat-evier-full-control-surface-plan.md`
- `docs/solutions/architecture-patterns/gamescope-runtime-control-contract-2026-06-02.md`
- `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md`
- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`

## Current State

`EvierControlSurface` is now the first meaningful seam:

- Converts raw `state.get` into Evier domain readbacks.
- Distinguishes `known`, `unknown`, `unavailable`, `mixed`, and `diverged`.
- Compares linked FPS by actual frame rate, not per-control slider index.
- Exposes separate Moonlight, GameScope, linked, brightness, and battery surface state.

Remaining architectural friction:

- `state.get` still uses `Schema.Unknown` for subsystem responses.
- The UI still owns linked command orchestration.
- The page still owns polling, stale-response guards, debouncing, and post-command refresh.
- Control definitions are still hardcoded in `EvierStreamControlPage.tsx`.
- `StreamControlService` is accumulating both stream/session and device sysfs responsibilities.

## 1. Type the Stream-Control State Contract at the RPC Seam

### Files

- `korri/products/app/api/stream-control/rpc-schemas.ts`
- `korri/products/app/api/stream-control/service.ts`
- `korri/shared/themes/evier/pages/evier-control-surface.ts`
- `korri/shared/themes/evier/pages/evier-control-surface.test.ts`

### Problem

`EvierControlSurface` still accepts `unknown` and understands raw Moonlight/GameScope/sysfs response shapes. The React page no longer parses raw state, but the UI-side domain module still depends on backend payload details.

### Proposed Change

Make `state.get` return a typed stream-control snapshot instead of generic subsystem `response: Schema.Unknown` values.

The typed snapshot should represent:

- subsystem status: `ok | disabled | error`
- Moonlight readbacks
- GameScope readbacks
- device readbacks
- capability/unsupported metadata where available
- pending/command metadata later

Then `EvierControlSurface` adapts a typed contract, not arbitrary `unknown`.

### Benefits

- Stronger public-contract tests at the RPC boundary.
- Less coupling between Evier and raw Moonlight/GameScope protocol payloads.
- Future agents can inspect `rpc-schemas.ts` to understand Evier renderable state.
- Readback truth moves closer to the service that owns the sources.

### Notes for Implementation

- Start with characterization tests for today’s `state.get` response shape.
- Add typed schemas incrementally; do not try to model every future capability in one pass.
- Preserve subsystem-local error states so one failed socket does not fail the whole state call.
- Keep raw diagnostic payloads only as diagnostic subfields if still needed.

## 2. Move Linked Command Orchestration out of React

### Files

- `korri/shared/themes/evier/pages/EvierStreamControlPage.tsx`
- `korri/products/app/features/evier/stream-control-rpc-client.ts`
- `korri/products/app/api/stream-control/service.ts`
- likely new:
  - `korri/products/app/api/stream-control/set-linked-fps.rpc.ts`
  - `korri/products/app/api/stream-control/set-linked-fps.rpc-handler.ts`
  - `korri/products/app/api/stream-control/set-linked-resolution.rpc.ts`
  - `korri/products/app/api/stream-control/set-linked-resolution.rpc-handler.ts`

### Problem

The page still owns linked mutation behavior:

- `setLinkedFps` calls Moonlight FPS and GameScope FPS.
- `setLinkedResolution` calls GameScope mode and Moonlight resolution.

Linked outcomes need to understand partial success, Moonlight pending state, GameScope readback mismatch, and divergence. React can render those states, but should not define the operation semantics.

### Proposed Change

Add service-level linked commands. Evier asks for linked FPS/resolution as a single operation, and the service returns a linked outcome such as:

- `applied`
- `pending`
- `partial`
- `failed`
- `diverged`
- `unsupported`

### Benefits

- React stops being an orchestration engine.
- Linked control semantics become testable through service/RPC contracts.
- CLI/agent/dev tooling can reuse the same linked operation semantics later.
- Partial failure handling becomes explicit instead of emergent from two UI calls.

### Notes for Implementation

- Keep Moonlight `accepted` distinct from terminal `applied`.
- GameScope can report terminal success only after readback match.
- Linked FPS should continue using the intersection ladder: `[30, 45, 60, 75, 90, 120]`.
- Avoid storing linked pending truth in local React state.

## 3. Replace Page-Local Polling with an Effect Atom / Control-State Resource

### Files

- `korri/shared/themes/evier/pages/EvierStreamControlPage.tsx`
- likely new:
  - `korri/products/app/features/evier/stream-control-page-state.ts`
  - or `korri/shared/themes/evier/pages/evier-control-state.ts`

### Problem

The page still owns refresh lifecycle details:

- `setInterval`
- serial guards
- mounted refs
- post-command refresh
- debounce timers
- status JSON

A stale-refresh race was already found and fixed once. That is a signal that the state lifecycle behavior deserves a deeper seam.

### Proposed Change

Create one state resource/atom/controller that owns:

- polling cadence
- refresh invalidation
- stale response suppression
- command-in-flight state
- last diagnostic/status payload
- conversion to `EvierControlSurface`

The page should consume a stable Evier state object and action functions.

### Benefits

- Removes async orchestration noise from JSX.
- Gives one public test surface for races and refresh behavior.
- Prepares for event/push subscription later without rewriting page callers.
- Aligns with the repo’s Effect Atom guidance.

### Notes for Implementation

- Keep normal polling and command-triggered refresh under one owner.
- Preserve the current external-change behavior: polling surfaces external changes after the next state read.
- Do not claim event-driven reactivity until a real event subscription exists.
- Test stale refresh, command refresh, initial load, subsystem error, and unmount cleanup through the new seam.

## 4. Turn Evier Controls into a Catalog Generated from Surface State and Capabilities

### Files

- `korri/shared/themes/evier/pages/EvierStreamControlPage.tsx`
- `korri/shared/themes/evier/pages/evier-control-surface.ts`
- likely new:
  - `korri/shared/themes/evier/pages/evier-control-catalog.ts`

### Problem

Control definitions are still hardcoded in the page:

- slider specs
- step ladders
- labels
- payload builders
- readback-to-slider-index conversion
- linked vs split variants

As Evier grows, the page will accumulate declarations for every Moonlight, GameScope, and device feature.

### Proposed Change

Create a control catalog that maps `EvierControlSurfaceState` plus capabilities into renderable control descriptors. The page renders descriptors; it does not know every control’s ladder, payload, enabled reason, or unsupported state.

### Benefits

- Adding a new control becomes catalog work, not page surgery.
- Capability gating becomes consistent.
- Tests can assert “given this surface, Evier exposes these controls.”
- Better developer-theme extensibility.

### Notes for Implementation

- Do not invent a plugin framework yet; keep this as a plain module until multiple adapters exist.
- Start with existing controls only.
- Preserve current UI grouping: unified stream controls, split Moonlight/GameScope controls, device controls.
- Model unsupported/unavailable/mixed states in descriptors instead of making individual components rediscover them.

## 5. Split Device State/Control out of `StreamControlService`

### Files

- `korri/products/app/api/stream-control/service.ts`
- `korri/products/app/api/stream-control/stream-control.rpc-handler.test.ts`
- likely new:
  - `korri/products/app/api/stream-control/device-control-service.ts`
  - `korri/products/app/api/stream-control/device-control-sysfs.ts`

### Problem

`StreamControlService` now owns multiple unrelated implementation domains:

- Moonlight socket control
- GameScope socket control
- artifact recording
- backlight sysfs reads/writes
- battery sysfs reads
- future power source / thermal / governor readbacks

This makes the service a hub for both stream/session and device implementation knowledge.

### Proposed Change

Introduce a `DeviceControlService` module behind the stream-control service seam. StreamControl composes device state and device mutations, but it does not know sysfs parsing/writing details.

### Benefits

- Better locality for sysfs parsing/writing.
- Easier hardware-oriented tests for brightness, battery, power, and thermals.
- Keeps stream/session controls separate from device controls, matching the product model.
- Prevents every new device feature from bloating `service.ts`.

### Notes for Implementation

- Keep the public RPC tags unchanged initially.
- Start by moving existing backlight/battery behavior without changing response shapes.
- Use existing dependency injection style for filesystem operations.
- Defer writable thermal/performance controls until hardware paths and semantics are confirmed.

## Suggested Order

1. **Typed `state.get` contract** — establishes a stable public snapshot.
2. **Linked command RPC/service operations** — removes command semantics from React.
3. **Effect Atom/control-state resource** — removes lifecycle/race handling from React.
4. **Control catalog** — makes future feature additions local and consistent.
5. **DeviceControlService extraction** — keeps hardware/sysfs growth from bloating stream-control service.

## Current Best Next Step

If continuing immediately, start with opportunity 1. It makes all later work safer because the stream-control state contract becomes typed before more controls and capabilities are layered on top.
