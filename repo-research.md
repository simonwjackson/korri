# Repository Research Summary — Stream Quality Product Follow-Up

**Focus:** Extend `floor..ceiling` adaptive range grammar to `floor..startup..ceiling`; wire startup into the launch/Moonlight policy while keeping floor/ceiling boundaries; preflight launch-quality selection; health-driven and handoff-aware early downshift.

---

## Technology & Infrastructure

- **Languages:** TypeScript (68 %), TSX (16 %), Nix (9 %), CSS (4 %), Shell (0.7 %)
- **Runtime:** Bun (unit tests via `bun test`, scripts via `tsx`/`bun`)
- **Build:** Vite + `@tailwindcss/vite` for web; Bun for API; Nix flakes for reproducible toolchain
- **Formatter/Linter:** Biome (`just lint`, `just format`)
- **Type checking:** strict TypeScript, whole-repo only (`just typecheck`) because of path aliases
- **Test runner:** `bun test` for unit tests; Playwright for E2E/component; `just test-nix` for Nix checks
- **Web framework:** TanStack Router + React + Effect v4 atoms (`@effect/atom-react`)
- **API server:** Hono (`@hono/node-server`)
- **Effect runtime:** `effect` library — services, layers, schemas, RPC used throughout
- **Verification commands:** `just typecheck && just test-unit && just lint && just format`

### Module Organisation

| Alias | Location | Role |
|---|---|---|
| `@platform/*` | `product/platform/` | Contracts, pure logic, streamer-agnostic interfaces |
| `@product/apps/portal/*` | `product/apps/portal/` | Hono API, React surfaces, RPC handlers |
| `@product/plugins/moonlight/*` | `product/plugins/moonlight/` | Moonlight-specific implementation (removable) |
| `@product/surfaces/terminal/korri-cli/*` | `product/surfaces/terminal/korri-cli/` | CLI commands |
| `@product/plugin-host/*` | `product/plugin-host/` | Plugin composition root |

---

## Architecture & Structure

### Strict Platform/Plugin Layering

The governing architectural constraint is **removability**: no shipped code imports the Moonlight plugin. The platform owns contracts; the plugin implements them through a registry. This is enforced via a removability gate (see `work/items/active/01KWN49HEG9X0HFJBMK2KRJ8CM-moonlight-streaming-plugin/plan.md`).

```
CLI / Portal RPC Handlers
  └─ platform contracts (streamer-agnostic seams)
       └─ plugin registry dispatch
            └─ @korri:moonlight plugin (implements: stream.launch, stream-control.connect/apply/describe)
```

### Stream Quality Subsystem — Layer Map

The stream quality work is layered in explicit numbered "layers" with Layer 5 (adaptive controller) currently the newest landed layer:

| Layer | Description | Status |
|---|---|---|
| L2 | Accept-and-adapt (Moonlight coerces requests to achievable values) | Complete |
| L3 | Safety net (recovery supervisor, decode-stall watchdog) | Complete |
| L4 | Senses: numeric health telemetry via `quality.sample` native events | Active (`01KWNSXR8H87GJ720M51K1HH31`) |
| L5 | Adaptive controller (brain + runner) | Landed (`01KWPW23JPV3F01BAJC3NJYKE8`) |
| L6 | GUI/slider surfacing | Deferred |

---

## Implementation Patterns

### Stream Boundary Grammar — Current Design

**File:** `product/platform/stream/stream-adaptive-boundaries.ts`

The grammar is a flat `key=value` expression set, passed as `string[]` and parsed by `parseStreamBoundaryArgs(args)`. Each lever uses `..` as the range separator:

```
bitrate=5000..20000    → floor 5000, ceiling 20000
bitrate=8000           → pinned (floor=ceiling=pinned=8000)
bitrate=5000..         → floor only
bitrate=..20000        → ceiling only
bitrate=auto           → free (no constraint)
bitrate=..             → free (no constraint)
```

**Key interface:**
```ts
// product/platform/stream/stream-adaptive-boundaries.ts
export interface NumericLeverBoundary {
  readonly floor?: number
  readonly ceiling?: number
  readonly pinned?: number
  readonly free?: boolean
  // NOTE: no `startup` field yet — this is the extension point
}

export interface StreamAdaptiveLeverBoundaries {
  readonly bitrate?: NumericLeverBoundary
  readonly fps?: NumericLeverBoundary
  readonly resolution?: ResolutionLeverBoundary
}

export interface StreamBoundaries {
  readonly levers: StreamAdaptiveLeverBoundaries
  readonly outcomes: StreamAdaptiveOutcomeBoundaries
  readonly lean?: number  // 0=responsiveness, 1=picture
  readonly auto?: "on" | "off"
}
```

**Current parser** (`parseNumericLever`):
```ts
// Splits on ".." — more than 2 parts currently throws "invalid range"
const parts = value.split("..")
if (parts.length > 2) throw new Error(`invalid range for ${key}: ${value}`)
```

**Extension point for `floor..startup..ceiling`:** `parts.length === 3` is currently an error. Handling it as startup requires:
1. Adding `startup?: number` to `NumericLeverBoundary`
2. Recognising 3-part as `[floor, startup, ceiling]` in `parseNumericLever`
3. Updating `serializeNumericLever` to emit the middle segment when `startup` is set
4. Updating `definedNumericLever` to pass through `startup`

**Serialisation** (current — would need startup in the middle):
```ts
// Current: "floor..ceiling"
// With startup: "floor..startup..ceiling"
function serializeNumericLever(lever: NumericLeverBoundary): string {
  if (lever.free) return "auto"
  if (lever.pinned !== undefined) return formatNumber(lever.pinned)
  return `${floor}..${ceiling}`  // startup would go between the two dots
}
```

### Adaptive Controller — Current Cold-Start / Establish Phase

**File:** `product/platform/stream/stream-adaptive-controller.ts`

The controller has two phases (`StreamAdaptiveControllerPhase = "steady" | "establishing"`) and three modes (`"establish" | "fine-tune" | "shed"`). During `establish` mode, it uses a baked-in `coldStartBitrateKbps` param (default 8 000 kbps) as the conservative opening target:

```ts
// Current establish logic — uses params.coldStartBitrateKbps
if (mode === "establish") {
  const conservative = Math.min(
    bitrateCeiling(boundaries, params),
    params.coldStartBitrateKbps,   // ← this is the extension point for startup
  )
  if (summary.sampleCount < params.coldStartSampleCount) {
    maybeSetBitrate(target, current, conservative, boundaries, params, true)
  } else if (healthyEnoughForGrowth(pressure)) {
    maybeSetBitrate(
      target, current,
      Math.round(current.bitrateKbps * (1 + params.coldStartIncreaseFraction)),
      boundaries, params,
    )
  }
}
```

**Default params (code constants, not user-configurable today):**
```ts
const DEFAULTS = {
  coldStartSampleCount: 3,
  coldStartBitrateKbps: 8_000,   // ← startup boundary would override this
  coldStartIncreaseFraction: 0.28,
  playableBitrateKbps: 1_500,    // ← floor (soft rescue target)
  panicBitrateKbps: 500,          // ← severe shed target
  playableFps: 30,
  playableResolutionWidth: 640,
}
```

**Boundary helper functions to extend:**
```ts
// Current boundary helpers in stream-adaptive-controller.ts
function bitrateFloor(boundaries, params): number {
  return boundaries?.levers.bitrate?.floor ?? params.minBitrateKbps
}
function bitrateCeiling(boundaries, params): number {
  return boundaries?.levers.bitrate?.ceiling ?? params.maxBitrateKbps
}
// NEW: bitrateStartup would follow the same pattern
function bitrateStartup(boundaries, params): number {
  return boundaries?.levers.bitrate?.startup ?? params.coldStartBitrateKbps
}
```

### Runner — Effective Boundaries and Moonlight Envelope

**File:** `product/platform/stream/stream-adaptive-runner.ts`

The runner calls `effectiveBoundaries()` before passing to the controller. This function **caps ceilings at the Moonlight launch settings** if no explicit ceiling was provided:

```ts
function effectiveBoundaries(
  boundaries: StreamBoundaries | undefined,
  initial: StreamAdaptiveSettings,  // ← set from Moonlight launch bitrate/fps/resolution
): StreamBoundaries {
  return {
    ...boundaries,
    levers: {
      ...(boundaries?.levers ?? {}),
      bitrate: {
        ...(boundaries?.levers.bitrate ?? {}),
        ceiling: boundaries?.levers.bitrate?.ceiling ?? initial.bitrateKbps,
      },
      fps: {
        ...(boundaries?.levers.fps ?? {}),
        ceiling: boundaries?.levers.fps?.ceiling ?? initial.fps,
      },
      resolution: {
        ...(boundaries?.levers.resolution ?? {}),
        ceiling: boundaries?.levers.resolution?.ceiling ?? initial.baselineResolution,
      },
    },
    outcomes: boundaries?.outcomes ?? {},
  }
}
```

**Key insight:** Moonlight's launch FPS/resolution already acts as the adaptive ceiling/envelope automatically — no duplicate configuration needed. The startup bitrate can be conservative, and the runtime will ramp toward the ceiling as health permits.

### CLI Flag Wiring — Stream Boundaries

**File:** `product/surfaces/terminal/korri-cli/korri-cli.ts`

```ts
// Individual flags for each lever
const streamBoundaryFlags = {
  bitrate: Flag.string("bitrate").pipe(Flag.optional),
  fps:     Flag.string("fps").pipe(Flag.optional),
  resolution: Flag.string("resolution").pipe(Flag.optional),
  lean:    Flag.string("lean").pipe(Flag.optional),
  minFps:  Flag.string("min-fps").pipe(Flag.optional),
}

// Converts flags to key=value args array
function streamAdaptiveArgs(flags) {
  return [
    optionArg("bitrate", flags.bitrate),
    optionArg("fps",     flags.fps),
    optionArg("resolution", flags.resolution),
    optionArg("lean",    flags.lean),
    optionArg("min-fps", flags.minFps),
  ].filter(Boolean)
}
```

**Data flow:** `--bitrate=3000..8000..30000` (after extension) → `streamAdaptiveArgs()` → `["bitrate=3000..8000..30000"]` → `parseStreamBoundaryArgs(args)` → `StreamBoundaries` → `launchMoonlight({ adaptiveBoundaries })` → `runtimeSessionAdaptiveOptions(boundaries)` → `StreamAdaptiveRunner`.

**File:** `product/surfaces/terminal/korri-cli/launch-command.ts`
```ts
// Line 297-303: boundary parsing and pass-through in the launch command
const adaptiveBoundaries = options.streamBoundaryArgs
  ? parseStreamBoundaryArgs(options.streamBoundaryArgs)
  : undefined
// ...passed to launchMoonlight({ adaptiveBoundaries })
```

### Adaptive Runner — Phase Tracking (Missing Piece)

The runner (`stream-adaptive-runner.ts`) currently does **not** pass a `phase` argument to `computeStreamAdaptiveDecision`. The controller's `phase` input is optional; when absent it defaults to `"steady"` (fine-tune mode). To activate the `establish` phase, the runner needs to track whether the stream is in its startup window and pass `phase: "establishing"` during that window.

### Handoff Trigger — Existing Foundation

**File:** `product/platform/stream/stream-handoff-trigger.ts`

The handoff trigger module already exists but is not yet wired into the runner:

```ts
export interface StreamHandoffSignal {
  readonly signalPercent?: number   // Wi-Fi signal strength %
  readonly handoffInProgress?: boolean
}

export function normalizeHandoffTrigger(signal?: StreamHandoffSignal): StreamHandoffHint | undefined
export function handoffHintPressure(hint: StreamHandoffHint): StreamAdaptivePressure
// { bandwidth: 0..1, latency: 0..1, decode: 0 }
```

The runner would accept a `handoff?: () => StreamHandoffSignal` option and use `handoffHintPressure()` to inject artificial pressure that bypasses the normal health-window latency and immediately drives a floor downshift.

---

## Issue Conventions

No `.github/ISSUE_TEMPLATE/` directory found — issues are tracked as markdown files in `work/items/`.

**Work item format** (`work/items/parking-lot/*.md`):
```yaml
---
id: 01KWX9Q78A1BQ5AAAANNM4SCRJ
slug: add-preflight-probe-for-stream-launch-quality-selection
title: Add preflight probe for stream launch quality selection
origin: parked
status: To Do
priority: medium
labels:
  - stream-control
  - adaptive
  - preflight
created: 2026-07-07
source: user
---
```

**Active plan format** (`work/items/active/<id>-<slug>/plan.md`):
YAML frontmatter with `title`, `type`, `status`, `date`, `verify_command`. Body uses `##` for sections: Summary, Problem Frame, Requirements (R1…), Scope Boundaries, Context & Research, Key Technical Decisions, Open Questions, High-Level Technical Design (Mermaid), Implementation Units (U1…), System-Wide Impact, Risks & Dependencies, Documentation / Operational Notes.

---

## Documentation Insights

### Coding Standards
- Biome formatting (2-space indent, double quotes, semicolons as needed)
- Strict TypeScript at all module boundaries
- No `any`, no barrel exports except documented entrypoints
- `@shared/logger` not `console.log` in runtime code (platform uses `@platform/logger/logger`)
- Test files colocated with source: `stream-adaptive-controller.test.ts` beside `stream-adaptive-controller.ts`

### Test Posture
- Unit tests via `bun test` — pure functions, no mocks, real implementations with injected config
- No `Mock*`/`Stub*`/`Fake*` — test doubles are real implementations with `behavior`/`config` args
- Nix checks for Nix-owned contracts only; TS tests for runtime/domain behavior

### Platform Boundary Rules
- `product/platform/*` MUST NOT import from `product/plugins/*` or any product-layer code
- Plugin-specific types are redeclared locally in platform modules (see `stream-health.ts`, `runtime-recovery.ts`)
- The plugin provides implementations via registry dispatch only

### Key Solution Docs (durable reference)
- `docs/acceptance/runtime-settings-protocol-contract.md` — accept-and-adapt, scale-only geometry, applied truth, recovery ownership
- `docs/solutions/architecture-patterns/stream-control-command-outcome-contract-2026-06-03.md` — `command.accepted` ≠ applied; recovery trusts readback
- `docs/korri-stream-layer3-safety-net-scope.md` — no external watcher, decode truth in Moonlight, recovery policy in Korri

---

## Templates Found

No formal GitHub templates. The project uses its own planning document schema:

- **Parking-lot item:** `work/items/parking-lot/<id>-<slug>.md` — YAML frontmatter + `# Title`, `## Why it matters`, `## Acceptance Criteria`, `## Related`, `## Notes`
- **Active plan:** `work/items/active/<id>-<slug>/plan.md` — full plan format with sections
- **Work log:** `work/items/active/<id>-<slug>/work.md` — execution journal

---

## Active Plans Relevant to This Work

### Currently Active (must not conflict)

| Plan | ID | Status | Relevance |
|---|---|---|---|
| Moonlight streaming plugin refactor | `01KWN49HEG9X0HFJBMK2KRJ8CM` | completed | Established removable plugin architecture; CLI consumers now use platform `StreamControlSession` interface |
| Senses: stream health telemetry | `01KWNSXR8H87GJ720M51K1HH31` | active | Defines `StreamHealthSample` protocol, `quality.sample` native events, `StreamHealthMonitor` — inputs to the adaptive controller |
| Adaptive stream brain/watchdog | `01KWPW23JPV3F01BAJC3NJYKE8` | landed | Built the complete controller stack: `stream-adaptive-controller.ts`, `stream-adaptive-runner.ts`, `runtime-recovery-supervisor.ts`, `stream-health.ts` |
| CLI interface unification | `01KWMVFMNJJ0TYPBF2H9Q1QPGD` | completed | Unified `launch` verb, established canonical exit-code table; `stream` retains live-tuning verbs only |
| Stream game lifecycle chord | `01KWMNX6R2N1BNCY124TWH94XF` | active | Chord-hold supervisor; shares inputd/overlay infra; independent of stream quality |

### Parked Items Directly in Scope for This Plan

| Item | ID | Labels |
|---|---|---|
| Add preflight probe for stream launch quality selection | `01KWX9Q78A1BQ5AAAANNM4SCRJ` | stream-control, adaptive, preflight |
| Add handoff-aware preemptive stream downshift | `01KWX9Q78CY3QNQ5BXV1BJ47ER` | stream-control, adaptive, handoff |
| Explore replacing explicit stream emergency mode with unified controller | `01KWX6X2C5RZ08BTG9FSXYBHNY` | stream-control, adaptive, design-debt |

### Other Parked Items Composing Well (awareness)

| Item | ID | Notes |
|---|---|---|
| Boundary persistence: named presets and per-game memory | `01KWTQJS39SZGCWQRKH3Z8QE0W` | Deferred persistence; same flat key=value schema |
| Adapt streaming to handheld device state (battery, thermal) | `01KWTQ750V3HJZ9AMQKH6H5W13` | Composes with same lever/outcome machinery |
| Reconsider 'stream' as first-class CLI noun | `01KWTMPE4MJXVR940R4X9GB0PR` | CLI noun model decision; currently `stream` is retained for live-tuning |

---

## Recommendations

### Grammar Extension (`floor..startup..ceiling`)

**Files to touch:**
1. `product/platform/stream/stream-adaptive-boundaries.ts` — sole parser/serializer; extend `NumericLeverBoundary`, `parseNumericLever`, `serializeNumericLever`, `definedNumericLever`, `mergeStreamBoundaries`
2. `product/platform/stream/stream-adaptive-boundaries.test.ts` — add: 3-part parse, invalid 4-part rejection, startup-only omit, serialise round-trip with startup

**Interface extension:**
```ts
export interface NumericLeverBoundary {
  readonly floor?: number
  readonly startup?: number   // ← new: conservative opening target
  readonly ceiling?: number
  readonly pinned?: number
  readonly free?: boolean
}
```

**Parser extension in `parseNumericLever`:** Handle `parts.length === 3` as `[floor, startup, ceiling]`. Validate `floor ≤ startup ≤ ceiling`. Empty middle segment (`5000..…..20000` with blank middle) should be treated as no startup (not an error — keep backward compatibility).

**Serialiser extension in `serializeNumericLever`:** Emit `floor..startup..ceiling` when `startup` is defined (and neither `free` nor `pinned`).

**Open grammar questions to resolve in plan:**
- Is `..startup..` (startup-only, no floor or ceiling) a valid form? Probably yes — it just sets the opening target with floor/ceiling defaulting to params.
- Is `startup..ceiling` (no floor) valid? Probably yes — startup is conservative opener, floor is rescue floor.

### Controller Integration

**File:** `product/platform/stream/stream-adaptive-controller.ts`

Add `bitrateStartup()` helper alongside `bitrateFloor` / `bitrateCeiling`:
```ts
function bitrateStartup(
  boundaries: StreamBoundaries | undefined,
  params: Required<StreamAdaptiveControllerParams>,
): number {
  return boundaries?.levers.bitrate?.startup ?? params.coldStartBitrateKbps
}
```

Replace the `conservative` calculation in the `establish` branch:
```ts
// Before:
const conservative = Math.min(bitrateCeiling(boundaries, params), params.coldStartBitrateKbps)
// After:
const conservative = Math.min(bitrateCeiling(boundaries, params), bitrateStartup(boundaries, params))
```

**Tests to add in `stream-adaptive-controller.test.ts`:**
- `bitrate=3000..8000..30000` → startup 8000 used during establish phase, not params.coldStartBitrateKbps
- `bitrate=..8000..30000` → floor defaults, startup 8000, ceiling 30000
- Startup is clamped by ceiling (e.g. startup 40000 with ceiling 30000 → min = 30000)
- After cold-start sample count passes, ramps from startup toward ceiling
- Floor still applies for shed/rescue regardless of startup

### Runner — Phase Tracking

**File:** `product/platform/stream/stream-adaptive-runner.ts`

The runner currently does not pass `phase` to the controller. To activate the `establish` phase during stream startup, the runner needs to track:
- Whether the stream just started (e.g. sample count below `coldStartSampleCount`)
- Or an explicit startup window (e.g. first N seconds)

A `startedAtMs?: number` could be seeded in `createStreamAdaptiveRunner` options and compared in `tick()` to gate the `phase: "establishing"` argument. This keeps the phase determination in the runner (closer to session lifecycle) rather than the controller (which should remain pure/stateless).

### Moonlight Launch Policy — Startup as Conservative Opening Move

**File:** `product/apps/portal/stream/moonlight-launcher.ts`

The Moonlight **launch** FPS and resolution (set from the policy/config, e.g. 1080p60) act as the runtime envelope via `effectiveBoundaries()`. No changes needed there. The startup bitrate is the conservative opening bitrate within that envelope. The user's mental model:

```
korri launch <game> --host <host> --bitrate=3000..8000..30000 --fps=..60 --resolution=..1920x1080
```

- Moonlight launches at 1920×1080@60fps (the ceiling/envelope)
- Adaptive controller opens at 8000 kbps (startup)
- Ramps toward 30000 kbps ceiling as health permits
- Falls back to 3000 kbps floor if health deteriorates
- Never exceeds 60fps or 1920×1080 (enforced by `effectiveBoundaries`)

**No changes needed in `moonlight-launcher.ts`** — the boundaries flow through as `adaptiveBoundaries` already. Startup is purely a controller-layer concern.

### Preflight Launch Quality Selection

**Parking-lot item:** `01KWX9Q78A1BQ5AAAANNM4SCRJ`

**Files:**
- `product/apps/portal/api/library/launch.rpc-handler.ts` — RPC handler call site; preflight probe would run before `composeMoonlightLaunchSpec()`
- `product/apps/portal/api/library/remote-stream-prepare.ts` — remote prepare seam
- `product/apps/portal/stream/moonlight-launcher.ts` — `launchMoonlight()` receives `adaptiveBoundaries`; the preflight result could adjust this

**Design approach:**
- A `probeStreamQuality(host)` function runs a lightweight measurement (RTT/loss probe; possibly iperf3 vs product-owned approach to be decided per the parking-lot item)
- Maps probe results to an explicit launch profile (`{ bitrateKbps: number, fps: number, resolution: StreamAdaptiveResolution }`) — not a named tier enum, but derived values
- The profile contributes to `adaptiveBoundaries` (e.g. sets startup, maybe ceiling) and Moonlight launch FPS/resolution policy
- The probe runs at the CLI launch command level or RPC handler level (before `composeMoonlightLaunchSpec`)
- Keep preflight opt-in (not automatic); bad preflight condition avoids launching into an unrecoverable high-bitrate choke

### Handoff-Aware Preemptive Downshift

**Parking-lot item:** `01KWX9Q78CY3QNQ5BXV1BJ47ER`

**Files:**
- `product/platform/stream/stream-handoff-trigger.ts` — existing `normalizeHandoffTrigger()`, `handoffHintPressure()`; the machinery exists, it just needs wiring into the runner
- `product/platform/stream/stream-adaptive-runner.ts` — accept a `handoff?: () => StreamHandoffSignal` option

**Integration in the runner:**
```ts
// In tick(), before normal decision path:
const handoffHint = options.handoff
  ? normalizeHandoffTrigger(options.handoff())
  : undefined
if (handoffHint) {
  // Bypass health windows: immediately target floor
  const floorBitrate = bitrateFloor(currentBoundaries(options.boundaries), DEFAULTS)
  await dispatchTarget({ bitrateKbps: floorBitrate, fps: DEFAULTS.playableFps }, "shed")
  return
}
```

The severity field on `StreamHandoffHint` allows graduated response: a mild handoff hint could inject artificial pressure via `handoffHintPressure(hint)` rather than immediately shedding to floor (only `severity === 1` / `handoffInProgress: true` triggers the preemptive shed).

**Signal sources to decide (per parking-lot item):**
- Wi-Fi signal strength (existing `signalPercent` field in `StreamHandoffSignal`)
- Network interface change detection (route/interface events)
- Abrupt RTT/loss spike exceeding a threshold (could be derived from the existing health monitor)

### Unified Controller Investigation

**Parking-lot item:** `01KWX6X2C5RZ08BTG9FSXYBHNY`

The current `shed` mode is the explicit emergency path. The parking-lot item asks whether it can be replaced by the continuous controller naturally reaching floor under sufficient pressure. This is a **design exploration**, not an immediate implementation. The `bitrateFloor`, startup, and ceiling boundaries are the building blocks. Key question: can `panicBitrateKbps` (500 kbps) emerge from the controller math under severe pressure without a separate shed branch? The `applyPlayabilityShed` function is the unit to evaluate.

**Recommendation:** Defer this exploration to after startup/preflight/handoff land. The shed path is a safety invariant; changing it carries risk and needs the device validation gate from L5 to be proven first.

---

## Key Files for This Plan (All Repo-Relative)

### Grammar Extension
- `product/platform/stream/stream-adaptive-boundaries.ts` — extend `NumericLeverBoundary` + parser + serialiser
- `product/platform/stream/stream-adaptive-boundaries.test.ts` — add startup round-trip tests

### Controller Integration
- `product/platform/stream/stream-adaptive-controller.ts` — add `bitrateStartup()`, wire into establish branch
- `product/platform/stream/stream-adaptive-controller.test.ts` — startup boundary test cases

### Runner Phase Tracking
- `product/platform/stream/stream-adaptive-runner.ts` — add startup-window tracking, pass `phase: "establishing"`
- `product/platform/stream/stream-adaptive-runner.test.ts` — phase-handoff test cases

### Handoff Wiring
- `product/platform/stream/stream-handoff-trigger.ts` — existing; use as-is
- `product/platform/stream/stream-adaptive-runner.ts` — add `handoff?` option

### Preflight
- `product/apps/portal/api/library/launch.rpc-handler.ts` — RPC handler call site
- `product/apps/portal/api/library/remote-stream-prepare.ts` — remote prepare seam
- `product/apps/portal/stream/moonlight-launcher.ts` — `adaptiveBoundaries` injection point

### CLI Surface
- `product/surfaces/terminal/korri-cli/korri-cli.ts` — `streamBoundaryFlags` (all boundary flags already present; startup rides on `--bitrate` grammar extension, no new flags needed)
- `product/surfaces/terminal/korri-cli/launch-command.ts` — `streamBoundaryArgs` passed through; no new wiring needed
- `product/surfaces/terminal/korri-cli/stream-quality.ts` — adaptive set/show/watch commands

### Live Telemetry (already landed, consumed by controller)
- `product/platform/stream/stream-health.ts`
- `product/platform/stream/stream-health-monitor.ts`
- `product/platform/stream/stream-health-session.ts`
- `product/platform/stream/runtime-recovery.ts`
- `product/platform/stream/runtime-recovery-supervisor.ts`

### Plan Docs to Update or Reference
- `work/items/parking-lot/01KWX9Q78A1BQ5AAAANNM4SCRJ-add-preflight-probe-for-stream-launch-quality-selection.md`
- `work/items/parking-lot/01KWX9Q78CY3QNQ5BXV1BJ47ER-add-handoff-aware-preemptive-stream-downshift.md`
- `work/items/parking-lot/01KWX6X2C5RZ08BTG9FSXYBHNY-explore-replacing-explicit-stream-emergency-mode-with-unifie.md`

---

## Constraint Summary for the Plan

| Constraint | Evidence |
|---|---|
| CLI first, no GUI | `01KWPW23JPV3F01BAJC3NJYKE8` scope boundaries explicitly state "No GUI, portal slider, or in-session overlay controls" for the controller; GUI is Layer 6 |
| No autodetect ceiling | Per user requirement; ceiling must be explicit; `effectiveBoundaries()` already caps at Moonlight launch settings |
| Explicit ceiling input | User provides `--bitrate=floor..startup..ceiling` on launch; no inference |
| Moonlight launch resolution/FPS as envelope | `effectiveBoundaries()` in runner uses launch `initial.fps`/`initial.bitrateKbps`/`initial.baselineResolution` as ceiling when not explicitly overridden |
| Startup can be conservative | Maps to `boundaries.levers.bitrate.startup` overriding `params.coldStartBitrateKbps` |
| Floor = playable-first rescue | `bitrateFloor()`, `playableBitrateKbps=1500`, `panicBitrateKbps=500` in controller |
| Platform must stay streamer-agnostic | No Moonlight imports in `product/platform/stream/*` |
| Test with `bun test` | `just test-unit` covers the pure platform layer; Nix tests cover package/module wiring |
| Whole-repo typecheck | `just typecheck` is the only valid TS type gate |
