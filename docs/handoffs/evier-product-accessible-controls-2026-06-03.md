# Evier Product-Accessible Controls Handoff

Date: 2026-06-03
Status: handoff
Scope: Architecture opportunities for making stream/device controls product-accessible from the API/domain layer, not bounded to the Evier theme

## Context

Evier is currently the primary operator surface for runtime stream, presentation, and device controls. Recent work deepened the stream-control architecture by adding typed `state.get` readbacks, service-owned linked FPS/resolution commands, a dedicated device-control service, and Evier-local control-surface/catalog/state modules.

The important follow-up concern is that **control semantics must not be constrained to the Evier theme**. This is not a UI concern. The product API/domain layer should expose what controls exist, what values are valid, what their authoritative readbacks are, and what command outcomes mean. Evier should be one consumer of that product-accessible contract.

Current important files:

- `korri/products/app/api/stream-control/rpc-schemas.ts`
- `korri/products/app/api/stream-control/service.ts`
- `korri/products/app/api/stream-control/*.rpc.ts`
- `korri/products/app/features/evier/stream-control-rpc-client.ts`
- `korri/shared/stream-control/stream-control-api-routes.ts`
- `korri/shared/themes/evier/pages/evier-control-surface.ts`
- `korri/shared/themes/evier/pages/evier-control-catalog.ts`
- `korri/shared/themes/evier/pages/evier-control-state.ts`
- `korri/shared/themes/evier/pages/EvierStreamControlPage.tsx`

Relevant docs:

- `docs/plans/2026-06-03-001-feat-evier-full-control-surface-plan.md`
- `docs/handoffs/evier-architecture-deepening-2026-06-03.md`
- `docs/solutions/architecture-patterns/gamescope-runtime-control-contract-2026-06-02.md`
- `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md`
- `AGENTS.md`

Existing decisions to preserve:

- Displayed values must come from authoritative readback only.
- Command ACK is not applied state.
- Moonlight `command.accepted` means pending.
- GameScope success requires readback match.
- Stream/session controls and device controls remain separate concepts.
- Unsupported/unavailable controls must be explicit.
- Evier is a theme/operator surface, not the owner of product API semantics.

## Current Friction

After the recent refactor, mutations are product-accessible through `app.stream-control.*` RPCs. However, several control semantics still live in Evier theme modules:

- control step ladders
- linked-vs-split control meaning
- readback ADTs such as `known`, `unknown`, `mixed`, and `diverged`
- slider payload builders
- valid option/range presentation
- the controller interface name and shape
- “which controls exist” knowledge

This means non-Evier product clients can call RPCs, but they cannot easily ask the product API: what controls exist, what values are valid, what is the current authoritative readback, and what command outcome should I expect?

The next architecture improvement should move those semantics toward a product-accessible stream-control contract.

## 1. Add a Product-Level Stream-Control Capability/Control Contract

### Files

- `korri/products/app/api/stream-control/rpc-schemas.ts`
- `korri/products/app/api/stream-control/service.ts`
- `korri/products/app/api/stream-control/get-config.rpc.ts`
- `korri/products/app/api/stream-control/get-state.rpc.ts`
- likely new RPC or expansion:
  - `korri/products/app/api/stream-control/get-controls.rpc.ts`
  - `korri/products/app/api/stream-control/get-controls.rpc-handler.ts`
  - or expanded `config.get` / `state.get`
- Current theme-bound source to migrate from:
  - `korri/shared/themes/evier/pages/evier-control-catalog.ts`

### Problem

`evier-control-catalog.ts` currently knows product-level control facts:

- Moonlight FPS steps
- GameScope FPS cap steps
- linked FPS intersection
- resolution ladder
- brightness targeting
- linked command availability
- option labels and payload construction

Those are not inherently theme facts. A product API consumer or agent should not need to import a theme module to discover valid controls.

### Proposed Change

Expose a product-level stream-control contract that answers:

- Which controls exist?
- Which subsystem owns each control?
- Is the control supported, unsupported, unavailable, or unknown?
- What values are valid: range, enum, step ladder, or target list?
- What readback source authorizes the displayed value?
- What mutation RPC/action applies to the control?
- For linked controls, what constraints make the linked value valid?

This could be a new `controls.get` RPC, or a structured capability section in `state.get`. The important point is that Evier should consume this contract rather than being the source of it.

### Benefits

- Product-accessible control discovery.
- Agents and tools can operate controls without scraping Evier theme code.
- Evier becomes one rendering of the product control surface.
- Public-contract tests can verify the product exposes controls correctly.
- Capability gating lives before UI rendering and before mutation attempts.

### Notes for Implementation

- Start by moving only existing known controls: Moonlight bitrate/FPS/resolution, GameScope mode/FPS/filter/sharpness, linked FPS/resolution, brightness, and battery readback.
- Do not invent a plugin framework yet.
- Keep theme-specific labels/layout hints separate from product semantics when possible.
- Preserve the linked FPS constraint: linked FPS uses the Moonlight-compatible intersection, not the full GameScope `0..240` limiter range.

### Documentation Need

Yes. Add a feature brief or architecture note explaining that controls are product API concepts and Evier is only a theme consumer.

Likely location:

- `korri/products/app/features/evier/brief.md` if the rationale is Evier-specific.
- `docs/solutions/architecture-patterns/` if this becomes the broader stream-control product contract.

## 2. Move `EvierControlSurface` into a Product/Shared Stream-Control Domain Module

### Files

- Current:
  - `korri/shared/themes/evier/pages/evier-control-surface.ts`
  - `korri/shared/themes/evier/pages/evier-control-surface.test.ts`
- Likely new home:
  - `korri/shared/stream-control/control-surface.ts`
  - `korri/shared/stream-control/control-surface.test.ts`
  - or `korri/products/app/features/stream-control/control-surface.ts`

### Problem

`EvierControlSurface` now interprets typed stream-control state into domain readbacks:

- `known`
- `unknown`
- `unavailable`
- `mixed`
- `diverged`

That interpretation is product behavior. Any product surface, CLI, test harness, or agent operating stream controls needs the same truth model. Keeping it under `shared/themes/evier/pages` makes it look theme-owned and discourages reuse.

### Proposed Change

Promote and rename it around the product/domain concept, for example:

- `StreamControlSurface`
- `StreamControlReadbacks`
- `RuntimeControlSurface`

The new module should accept typed stream-control state and return product-level readback state. Evier imports this module and renders it.

### Benefits

- Readback truth becomes product-accessible.
- Reduces duplication of divergence/mixed/unavailable logic.
- Makes tests target a public product/domain seam instead of a theme page helper.
- Makes Evier visibly a consumer, not the owner, of stream-control truth.

### Notes for Implementation

- Keep the existing ADT semantics initially; do not redesign the states during the move.
- Move tests with the module.
- Update imports in `EvierStreamControlPage.tsx`, `evier-control-state.ts`, and `evier-control-catalog.ts`.
- Consider replacing `EvierControlSurfaceState` naming with product names once the module is moved.

### Documentation Need

Light. A module-level comment may be enough if the naming and location are clear. If new terminology is introduced, document it in the Evier brief or stream-control architecture note.

## 3. Move `EvierStreamControlController` out of the Theme Boundary

### Files

- Current:
  - `korri/shared/themes/evier/pages/evier-control-state.ts`
  - `korri/shared/themes/evier/pages/EvierStreamControlPage.tsx`
  - `korri/products/app/features/evier/stream-control-rpc-client.ts`
  - `korri/products/app/routes/+evier.tsx`
- Likely new home:
  - `korri/products/app/features/stream-control/stream-control-client.ts`
  - or `korri/shared/stream-control/stream-control-client.ts`

### Problem

The product RPC client currently implements a theme-named interface:

```ts
EvierStreamControlController
```

That is an inversion. The product/API layer should define the command client contract. Evier should accept a product stream-control client and add view-specific scheduling/debounce behavior around it.

### Proposed Change

Create a product/shared interface for the stream-control command client. Evier should import that interface instead of defining it.

The product client should own:

- `getState`
- individual Moonlight mutations
- individual GameScope mutations
- linked mutations
- brightness mutations

The Evier hook can continue owning view lifecycle concerns:

- polling cadence
- debounce timers
- stale refresh guard
- recover button sequence
- status JSON display

### Benefits

- Product API semantics no longer depend on a theme type.
- Other product surfaces can reuse the same client contract.
- The route composition becomes clearer: product route provides a product client to an Evier renderer.
- Better agent navigability: agents look under stream-control for control APIs.

### Notes for Implementation

- Rename carefully to avoid implying that the interface is UI-only.
- Keep Evier’s local scheduling API separate; the product client should expose operations, not slider concepts.
- Update `stream-control-rpc-client.ts` to return the product client interface.
- Update page tests to import product client types where appropriate.

### Documentation Need

Maybe. If this rename changes the conceptual ownership, update the handoff or feature brief so future agents stop treating Evier as the API owner.

## 4. Unify Effect RPC and Hono Bench State Normalization Behind One Contract Module

### Files

- `korri/products/app/api/stream-control/service.ts`
- `korri/shared/stream-control/stream-control-api-routes.ts`
- `tools/cli/stream-control-bench.test.ts`
- likely new:
  - `korri/shared/stream-control/state-normalizer.ts`
  - `korri/shared/stream-control/state-normalizer.test.ts`
  - or `korri/products/app/api/stream-control/state-contract.ts`

### Problem

Both the Effect RPC service and the Hono bench routes now return typed `readback` state, but they build it with duplicated normalization logic. The recent API review already found drift between those surfaces once.

This is a shallow seam: the contract exists, but its implementation is repeated across API paths.

### Proposed Change

Extract typed state normalization into one stream-control contract module used by both:

- Effect RPC service
- Hono bench route
- tests

The module should normalize raw Moonlight/GameScope state snapshots into the typed readback shape used by the product API.

### Benefits

- Prevents `response` vs `readback` drift.
- Keeps bench routes a real mirror of the product contract.
- Gives one public-contract test surface for state normalization.
- Reduces duplicated protocol parsing.

### Notes for Implementation

- Start with Moonlight and GameScope normalization only.
- Keep sysfs device state in `device-control-service.ts`; do not mix filesystem reads into the normalizer.
- Avoid importing product app internals into `korri/shared/*` if using a shared location.
- If placed in `products/app/api/stream-control`, the Hono shared route may not be able to import it due shared-layer dependency rules; choose the location accordingly.

### Documentation Need

Probably no durable doc needed. Clear module location and tests should be sufficient.

## 5. Type Command Outcomes as Product API Data Instead of `response: unknown`

### Files

- `korri/products/app/api/stream-control/rpc-schemas.ts`
- `korri/products/app/api/stream-control/service.ts`
- `korri/products/app/api/stream-control/set-linked-fps.rpc.ts`
- `korri/products/app/api/stream-control/set-linked-resolution.rpc.ts`
- individual Moonlight/GameScope command RPCs
- `korri/products/app/api/stream-control/stream-control.rpc-handler.test.ts`

### Problem

State is now typed, but command responses still expose:

```ts
response: Schema.Unknown
```

That leaves API consumers without stable product semantics for:

- pending
- applied
- partial
- failed
- unsupported
- readback mismatch
- per-target linked results

Evier currently treats command responses mostly as diagnostic context, but product/agent consumers need typed outcome semantics. The recent linked-command review bug showed why this matters: GameScope failure statuses were initially classified incorrectly until service logic mapped them deliberately.

### Proposed Change

Introduce typed product command outcome schemas. Raw protocol payloads can remain as diagnostic detail, but the primary response should be stable product data.

For linked operations, the product outcome should describe:

- overall status
- Moonlight target status
- GameScope target status
- error/reason when failed
- pending vs applied distinction

For individual operations, the outcome should describe:

- applied
- pending
- failed
- unsupported
- readback mismatch / readback failed where applicable

### Benefits

- Product API consumers can reason about command lifecycle without knowing raw Moonlight/GameScope protocol details.
- ACK-as-success mistakes become harder to reintroduce.
- Linked partial failures become first-class product semantics.
- Public-contract tests can assert command outcome behavior directly.

### Notes for Implementation

- Start with linked command outcomes because they already synthesize multiple subsystem responses.
- Then type GameScope readback-backed command outcomes.
- Moonlight commands should preserve `pending` until terminal command-result/readback support exists.
- Do not remove diagnostic raw payloads until all current debugging needs are covered.

### Documentation Need

Yes if this becomes the canonical command lifecycle contract.

Likely location:

- `docs/solutions/architecture-patterns/stream-control-command-outcome-contract-<date>.md`
- or a section in `korri/products/app/features/evier/brief.md` / a stream-control feature brief.

## Suggested Order

1. **Move/readback domain out of Evier** — candidate 2 gives product code a reusable truth model.
2. **Move the command client interface out of Evier** — candidate 3 removes theme ownership from product operations.
3. **Add product-level control discovery/capability contract** — candidate 1 makes controls API-discoverable.
4. **Unify RPC/Hono normalization** — candidate 4 prevents contract drift across API paths.
5. **Type command outcomes** — candidate 5 deepens mutation semantics after the state/control model is stable.

## Current Best Next Step

Start with candidates 2 and 3 as one small vertical slice:

- Rename/move `EvierControlSurface` to a stream-control domain module.
- Move `EvierStreamControlController` to a product/shared stream-control client module.
- Keep Evier behavior unchanged.
- Preserve existing tests while changing import ownership.

That immediately addresses the theme-bound ownership concern without designing a full controls-discovery API yet.
