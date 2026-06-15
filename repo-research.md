# Repository Research Summary

> Scoped for: Steam launch observability implementation  
> Feature: `product/services/device/steam/` — parsers, tailer, observer, RPC surface  
> Handoff: `docs/handoffs/steam-observability-implementation-handoff-2026-06-14.md`  
> Backlog: `01KV3KWT98Y6W6CNXP05ZPSHH7`

---

## Technology & Infrastructure

**Languages & Frameworks**
- TypeScript 74%, TSX 10%, Nix 12%, Shell/BASH 2%
- React 18 + TanStack Router for the portal SPA
- Effect v4 for service contracts, schema, RPC (`effect`, `@effect/atom-react`)
- Hono (`@hono/node-server`) for the HTTP/RPC server layer
- Bun as the runtime and test runner
- Storybook for visual harness
- Biome 2.3.5 for lint/format (2-space indent, no semicolons except as needed, double quotes)
- Vite for the web build; Nix flakes + direnv for reproducible tooling

**Deployment Model**
- Multi-service: `korrid` (main API daemon), `sessiond` (foreground session lifecycle), `inputd` (input broker), device-side systemd units
- Device targets: SM8550/Bandai (arm64, NixOS), source-machine (LAN stream host), x86 live USB kiosk
- Korri-owned Steam root: `/var/lib/korri/steam/`; logs at `/var/lib/korri/steam/logs/`

**TypeScript Path Aliases**
```
@platform/*  →  product/platform/*   (shared runtime, schemas, services, protocols)
@product/*   →  product/*            (portal apps, API, themes)
```
No other aliases exist. Shared modules under `@platform` must not import from `@product`.

**Test runner**: `bun test` (just `test-unit`). Playwright for E2E/component.

**Module structure** (relevant to Steam observability):
```
product/
  platform/
    api/rpc/         – RPC error types, serialization
    control/         – KorriControl service + live layer
    library/
      launcher.ts                           – LaunchSpec schema
      sessiond-managed-launch-protocol.ts   – SSE/HTTP wire schema (Effect Schema)
      sessiond-lifecycle-projections.ts     – projection helpers
    logger/                                 – pino-based shared logger
    stream/
      steam-launch-spec.ts                  – parseSteamAppId, renderSteamLaunchSpec
  services/device/
    sessiond.ts          – foreground session lifecycle HTTP server
    sessiond-state.ts    – pure session state reducer
    sessiond-gamescope-reaper.ts – process reaper (pattern model)
    sessiond-status-sidecar.ts   – JSON sidecar writer
    steam/               – (worktree only today; new home for Steam TS code)
      steam-gamescope-launch-plan.ts
      steam-gamescope-launch-planner-cli.ts
  apps/portal/api/
    server/
      status.rpc.ts          – app.server.status (Effect Schema + Rpc.make)
      status.rpc-handler.ts  – handler composition; sessiond probe + runner sidecar
      rpc-group.ts           – all server RPCs registered here
      rpc-server.ts          – Layer assembly + HTTP handler
    session/
      status.rpc.ts           – app.session.status
      status.rpc-handler.ts
    hello/
      rpc.ts / rpc-handler.ts / rpc-handler.test.ts  – canonical minimal example
```

---

## Architecture & Structure

### Service Layering

```
Portal SPA (React/TanStack Router)
    ↓  Effect RPC  (app.xxx.yyy)
korrid (Hono/Effect server — product/services/device/korrid.ts)
    ↓  HTTP fetch to socket
sessiond (Bun.serve — product/services/device/sessiond.ts)
    ↓  Bun.spawn
  Game processes / Steam
```

**Key architectural rules (inferred from codebase):**
- `sessiond` is the sole truth for foreground lifecycle. `korrid` proxies sessiond state through `app.server.status` and `app.session.status`.
- `korrid` RPCs live in `product/apps/portal/api/{domain}/`. Each domain has `{action}.rpc.ts` (schema + `Rpc.make`), `{action}.rpc-handler.ts` (Effect handler), and a `rpc-handler.test.ts`.
- Shared protocol schemas live in `product/platform/library/` and are imported by both server and client.
- New domain RPCs must be added to `product/apps/portal/api/server/rpc-group.ts` and wired in `rpc-server.ts`.
- Effect Schema (not hand-rolled types) is the source of truth for all wire types. Generated files are read-only.

### sessiond Architecture

`sessiond` is a Bun HTTP server that:
1. Maintains `KorriSessionState` (pure state machine: `stopped → starting → home → launching → game → restoring → recovering`).
2. Accepts `POST /managed-launch` to start a session.
3. Streams lifecycle events via `GET /managed-launch/events` (SSE).
4. Exposes `GET /managed-launch/status` for polling.
5. Plugs in a `role` (kiosk or source-machine), a `launcher`, and an optional `reaper`/`gamescopeControlBridge`.

All components are injected as interface dependencies — no singletons. Tests build a `createKorriSessiondCore(...)` with harness objects; production `main()` builds from env.

### GamescopeReaper — Pattern Model for Steam Observer

`product/services/device/sessiond-gamescope-reaper.ts` is the closest existing analogue to the Steam log observer:

- Exposes a `GamescopeReaper` function type: `(request: ReapRequest) => Promise<ReapOutcome>`.
- Implementation `createGamescopeReaper(options)` takes injected `processList`, `signaler`, `logger`, `graceMs`, `retries`.
- Helper `createProcfsProcessList()` reads `/proc`; `POSIX_PROCESS_SIGNALER` does real signals.
- Production wiring: `createSystemGamescopeReaper(overrides)` — accepts partial overrides so tests inject cheap fakes.
- Tests use inline fakes (`makeProcessList(processes)`, `makeSignaler()`) — never Mock/Stub/Fake class names.

**Steam observer should follow the same dependency-injection + configurable-behavior pattern.**

### Steam Code Today

The steam code referenced in the handoff (`steam-gamescope-launch-plan.ts`, `steam-gamescope-launch-planner-cli.ts`) lives in a worktree branch `feat/steam-ts-planner-handoff`:

```
.worktrees/feat/steam-ts-planner-handoff/product/services/device/steam/
  steam-gamescope-launch-plan.ts
  steam-gamescope-launch-plan.test.ts
  steam-gamescope-launch-planner-cli.ts
  steam-gamescope-launch-planner-cli.test.ts
```

These files do **not** yet exist on `trunk`. The handoff assumes they will land before or alongside the observability work. New Steam observability code belongs in `product/services/device/steam/`.

The stable Steam code that already exists on `trunk`:
```
product/platform/stream/steam-launch-spec.ts       – parseSteamAppId(), renderSteamLaunchSpec()
product/platform/library/config/steam-state-materializer.ts  – VDF manipulation, lifecycle
product/systems/nixos/modules/korri-steam.nix       – Nix module
```

---

## Implementation Patterns

### RPC Contract Pattern

All RPCs follow this exact structure. `hello` is the canonical minimal example:

**`{action}.rpc.ts`** — schema + RPC declaration:
```ts
import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class GetHelloPayload extends Schema.Class<GetHelloPayload>("GetHelloPayload")({
  name: Schema.optional(Schema.String),
}) {}

export class HelloResponse extends Schema.Class<HelloResponse>("HelloResponse")({
  message: Schema.String,
  timestamp: Schema.String,
}) {}

export const GetHelloRpc = Rpc.make("app.hello.get", {
  payload: GetHelloPayload,
  success: HelloResponse,
  error: ApiError,
})
```

**`{action}.rpc-handler.ts`** — pure Effect handler:
```ts
import { Effect } from "effect"
import { type GetHelloPayload, HelloResponse } from "./rpc"

export const handleGetHello = (payload: typeof GetHelloPayload.Type) =>
  Effect.succeed(new HelloResponse({ … }))
```

**`{action}.rpc-handler.test.ts`**:
```ts
import { expect, it } from "bun:test"
import { Effect } from "effect"
import { handleGetHello } from "./rpc-handler"

it("returns a starter greeting", async () => {
  const response = await Effect.runPromise(handleGetHello({ name: "Simon" }))
  expect(response.message).toBe("Hello, Simon. Effect RPC is ready.")
})
```

**RPC tag naming**: `app.{domain}.{action}` — e.g., `app.hello.get`, `app.server.status`, `app.session.status`, `app.library.launch.dry-run`. For the Steam status surface, the handoff suggests `app.steam.status`.

**Registering a new RPC**:
1. Create `product/apps/portal/api/{domain}/status.rpc.ts` (schema + `Rpc.make`).
2. Create `product/apps/portal/api/{domain}/status.rpc-handler.ts` (handler).
3. Import and add to `serverRpcGroup` in `product/apps/portal/api/server/rpc-group.ts`.
4. Add handler mapping in `serverRpcGroup.toLayer({...})` in `product/apps/portal/api/server/rpc-server.ts`.

### Error Types

Errors are `Data.TaggedError` or `Schema.TaggedErrorClass`:
```ts
export class SteamStateMutationFailed extends Data.TaggedError("SteamStateMutationFailed")<{
  readonly path: string
  readonly reason: string
}> {}
```
- `_tag` is the discriminant.
- API-layer errors must be in `ApiError = Schema.Union([DataError, NotFoundError, ValidationError])`.
- Domain errors (below the API layer) use `Data.TaggedError`.

### Pure Reducer / State Machine Pattern

`sessiond-state.ts` is the canonical reducer model:
- Pure exported functions: `startKorriSession`, `beginKorriLaunch`, `markKorriGameRunning`, etc.
- State is a plain `interface` with `readonly` fields.
- No classes, no mutation.
- Tests import and call functions directly with initial/built states.

**For the Steam observer**: the `SteamLaunchObservationSnapshot` reducer should follow this pattern — pure functions `applyContentLogSignal`, `applyGameProcessSignal`, etc., returning a new snapshot.

### Dependency Injection / Configurable Behavior Pattern

See `sessiond-gamescope-reaper.ts` for the exact idiom:

```ts
export interface GamescopeReaperOptions {
  readonly processList: ProcessListQuery
  readonly signaler: ProcessSignaler
  readonly logger?: GamescopeReaperLogger
  readonly graceMs?: number
  readonly retries?: number
}

export function createGamescopeReaper(options: GamescopeReaperOptions): GamescopeReaper { … }

// System defaults (production)
export function createSystemGamescopeReaper(overrides = {}): GamescopeReaper {
  return createGamescopeReaper({
    processList: overrides.processList ?? createProcfsProcessList(),
    signaler: overrides.signaler ?? POSIX_PROCESS_SIGNALER,
    …
  })
}
```

Tests inject cheap inline fakes:
```ts
function makeProcessList(processes: readonly ProcessInfo[]) {
  return { list: async () => processes }
}
```

**The Steam tailer must follow this**: `createSteamLogTailer(options)` with injected `watchFile`, `readLine`, logger, etc. `createSystemSteamLogTailer()` provides real filesystem defaults.

### Testing Pattern

All test files:
- Use `bun:test` (`describe`, `it`, `expect`, `afterEach`).
- Live next to the source: `foo.ts` / `foo.test.ts`.
- Use real implementations with configurable behavior — not mocks/stubs/fakes.
- Temp directories for filesystem tests via `mkdtemp`/`mkdir` in `out/tmp/<module>/`.
- `afterEach` cleanup via a `cleanups` array.
- Assertions on observable behavior, not private internals.

**Test double naming**: never `MockFoo`, `StubFoo`, `FakeFoo`. Use `createHarness(…)` returning real objects with recorded side-effects (see `inputd-actions.test.ts`).

Example harness pattern:
```ts
function createHarness(options = {}) {
  const commands: InputdActionCommand[] = []
  const warnings: unknown[] = []
  const dispatcher = createInputdActionDispatcher({
    ...options,
    runner: async command => { commands.push(command) },
    logger: { debug: () => {}, info: () => {}, warn: input => warnings.push(input), error: () => {} },
  })
  return { dispatcher, commands, warnings }
}
```

### Logger Usage

Import from `@platform/logger`, not `console.log`:
```ts
import { logger as defaultLogger } from "@platform/logger"
// or
import { createLogger } from "@platform/logger"
const log = createLogger("steam-log-tailer")
```

Pino logger interface: `{ debug, info, warn, error }` each taking `(input: unknown, message?: string)`.

---

## Issue Conventions

No `.github/ISSUE_TEMPLATE/` found. Issues and backlog items use the `work/items/parking-lot/` markdown format:

```yaml
---
id: 01KV3KWT98Y6W6CNXP05ZPSHH7
slug: capture-steam-launch-diagnostics-as-first-class-session-arti
title: Build first-class Steam launch observability
origin: parked
status: To Do
priority: high
labels:
  - steam
  - observability
  - sessiond
created: 2026-06-14
source: user
---
```

---

## Documentation Insights

### Contribution Guidelines

No explicit CONTRIBUTING.md found. Standards are:
1. `just typecheck` — whole-repo only (path aliases require it).
2. `just test-unit` — unit tests.
3. `just lint` / `just format` — Biome.
4. `just fallow-audit` — if Fallow is configured.
5. E2E (`just test-e2e`) when user-facing behavior changes.

### Coding Standards

- **Effect Schema** is source of truth for wire shapes. No hand-rolled parsers at protocol boundaries.
- **No `any`**. Strict TypeScript throughout.
- **No barrel exports** except documented module entrypoints (`@platform/logger`).
- **Comments**: why, not what. Sparse doc comments.
- **UTC methods** for ISO date strings.
- **Additive protocol evolution**: new optional fields only. Schema updated before daemon emits.
- **Sensitive data**: never in localStorage.

### Architecture Decision Records

Live in `docs/solutions/` (by category) and `docs/plans/`. Notable relevant ones:
- `docs/solutions/architecture-patterns/steam-applaunch-with-silent-steam-and-per-app-launchoptions-gamescope-wrap-aka-x86-2026-05-27.md`
- `docs/solutions/runtime-errors/steam-manual-launch-x86-eager-xwayland-dbus-readiness-2026-05-26.md`

---

## Templates Found

No GitHub issue/PR templates in `.github/`.  
Work items use the parking-lot markdown format (`work/items/parking-lot/*.md`).

---

## Bandai Fixture Summary

The fixtures in `docs/research/steam-observability/bandai-2026-06-14/` are the ground truth for parser tests. The three confirmed AppIDs:

| Game       | AppID  | content_log         | gameprocess_log | console_log |
|-----------|--------|--------------------|--------------------|-------------|
| Downwell   | 360740 | ✅ (stale stop + new launch) | ✅ (multi-PID) | ✅ (install script) |
| Sonic Mania| 584400 | ✅ (clean start)   | ✅ (multi-PID)    | ✅ (cloud sync) |
| Caveblazers| 452060 | ✅ (clean start)   | ✅ (multi-PID)    | available   |

**Exact observed line formats from fixtures:**

`content_log.txt`:
```
[2026-06-14 14:41:27] AppID 360740 state changed : Fully Installed,App Running,
[2026-06-14 14:41:57] AppID 360740 state changed : Fully Installed,
```

`gameprocess_log.txt` (first PID has command; subsequent do not):
```
[2026-06-14 14:41:27] AppID 360740 adding PID 204611 as a tracked process "/run/current-system/sw/bin/bash /var/lib/korri/bin/korri-steam-gamescope-launch ..."
[2026-06-14 14:41:28] AppID 360740 adding PID 204625 as a tracked process
[2026-06-14 14:41:57] AppID 360740 no longer tracking PID 204625, exit code -1
[2026-06-14 14:41:57] AppID 360740 no longer tracking PID 204611, exit code 0
```

`console_log.txt` (tasks and install-script evaluator):
```
[2026-06-14 14:41:06] ExecCommandLine: "'/var/lib/korri/steam/steamrtarm64/steam' ... '-applaunch' '360740'"
[2026-06-14 14:41:06] GameAction [AppID 360740, ActionID 4] : LaunchApp changed task to CheckShaderDepotManifest with ""
[2026-06-14 14:41:07] GameAction [AppID 360740, ActionID 4] : LaunchApp changed task to ProcessingInstallScript with ""
[2026-06-14 14:41:07] Running install script evaluator for AppID 360740, 1 step(s)  ...
[2026-06-14 14:41:27] GameAction [AppID 360740, ActionID 4] : LaunchApp changed task to CreatingProcess with ""
[2026-06-14 14:41:27] GameAction [AppID 360740, ActionID 4] : LaunchApp changed task to WaitingGameWindow with ""
[2026-06-14 14:41:27] GameAction [AppID 360740, ActionID 4] : LaunchApp changed task to Completed with ""
```

`shader_log.txt`:
```
[2026-06-14 14:38:14] AppID 360740 exited.
[2026-06-14 14:39:02] Setting MESA_GLSL_CACHE_DIR=/var/lib/korri/steam/steamapps/shadercache/584400 ...
```

**Downwell stale-PID gotcha**: `gameprocess_log.txt` has 8 stale PID-removal lines from the *previous* Downwell run (at 14:38:14) before the new launch at 14:41:27. Parsers must use launch-window correlation (ignore pre-launch removals).

**Wrapper PID always exits 0**: child PIDs exit -1; the root/wrapper PID exits 0. Do not treat `-1` as user-facing failure.

`parser-fixtures/` directory has per-AppID combined files (`downwell-360740.txt`, `sonic-mania-584400.txt`, `caveblazers-452060.txt`) mixing sources — these need to be split into source-specific fixture files per handoff Unit 1.

---

## Recommendations

### File Layout for New Steam Observability Code

Following handoff and existing conventions:

```
product/services/device/steam/
  steam-log-signals.ts              # pure parsers (content_log, gameprocess, console, shader)
  steam-log-signals.test.ts         # unit tests from fixtures
  steam-log-tailer.ts               # tail-by-name watcher
  steam-log-tailer.test.ts          # append/truncate/recreate/missing tests
  steam-launch-observer.ts          # reducer + snapshot
  steam-launch-observer.test.ts     # Bandai fixture replay sequences

product/apps/portal/api/steam/
  status.rpc.ts                     # app.steam.status schema + Rpc.make
  status.rpc-handler.ts             # handler
  status.rpc-handler.test.ts        # Effect.runPromise tests
```

Register `app.steam.status` in:
- `product/apps/portal/api/server/rpc-group.ts` (add `SteamStatusRpc`)
- `product/apps/portal/api/server/rpc-server.ts` (add `"app.steam.status": handleSteamStatus`)

### Specific Implementation Notes

1. **Parser functions should be pure** (no I/O, no side effects). They receive a string line and return a typed signal or `undefined` for unrecognized lines. Tested directly with fixture strings.

2. **Tailer DI interface** modeled on reaper pattern:
   ```ts
   interface SteamLogTailerFs {
     stat: (path: string) => Promise<{ size: number; ino: number }>
     open: (path: string, position: number) => Promise<AsyncIterable<string>>
     watch: (path: string) => AsyncIterable<"change" | "rename">
   }
   function createSteamLogTailer(options: { fs?: SteamLogTailerFs; ... }): SteamLogTailer
   function createSystemSteamLogTailer(): SteamLogTailer   // real fs defaults
   ```

3. **Observer reducer signature** modeled on `sessiond-state.ts`:
   ```ts
   function applyObservationSignal(
     snapshot: SteamLaunchObservationSnapshot,
     signal: SteamObservationEvent,
   ): SteamLaunchObservationSnapshot
   ```
   Initial state factory, pure reducer, tested with sequences from Bandai fixtures.

4. **RPC response shape** must include `app.steam.status` in `ServerStatusResponse` schema as an optional field (additive-only per the protocol evolution rule in `sessiond-managed-launch-protocol.ts`), OR expose as a separate `app.steam.status` RPC. Separate RPC is simpler to test and iterate without touching the existing `app.server.status` shape. The handoff recommends the separate RPC.

5. **Tailer output** is the canonical `SteamObservationEvent` stream that the observer reducer consumes. The observer is not coupled to the tailer's implementation — it accepts events from any source (replay, fixture injection in tests, live tailer in production).

6. **Bounded evidence**: keep recent events bounded (≤N) in the observer snapshot as the handoff requires. 64 is the existing bound in `sessiond.ts` for lifecycle events.

7. **Truncation/recreation detection**: watch for inode changes (rename signal) and restart tailing from offset 0 on recreation; track file size and restart from offset 0 on truncation (new size < previous). Node `fs.watch` emits `rename` for deletion/recreation on Linux; `change` for appends.

8. **Log directory env var**: use `KORRI_STEAM_STATE_ROOT` or `KORRI_STEAM_LOG_DIR` (check existing env naming convention; current Steam code uses `KORRI_STEAM_STATE_ROOT` equivalent in the Nix module / `steam-state-materializer.ts`'s `stateRoot` pattern) defaulting to `/var/lib/korri/steam`.

### Fixture Split (Unit 1 prep)

Split `parser-fixtures/downwell-360740.txt` etc. into per-source fixtures:
```
docs/research/steam-observability/bandai-2026-06-14/parser-fixtures/
  content-log-app-state.txt          # content_log lines only
  gameprocess-log-tracked-pids.txt   # gameprocess_log lines only
  console-log-launch-tasks.txt       # console_log lines only
  shader-log-appid-evidence.txt      # shader_log lines only
```

The current `parser-fixtures/*.txt` files mix sources (content_log + gameprocess_log + console_log in a single file), which makes test assertions ambiguous when a parser for one source is fed lines from another.

### RPC Tag for Steam Status

Following the existing tag pattern (`app.{domain}.{sub-domain?}.{action}`):
```
app.steam.status
```
This is consistent with `app.server.status`, `app.session.status`, `app.source.status`.

### Key Files to Read Before Implementation

| File | Why |
|------|-----|
| `product/services/device/sessiond-gamescope-reaper.ts` | DI + configurable-behavior pattern to replicate |
| `product/services/device/sessiond-state.ts` | Pure reducer pattern for observer snapshot |
| `product/services/device/sessiond.ts` | Bounded event buffer (64), SSE lifecycle pattern |
| `product/apps/portal/api/hello/rpc.ts` + `rpc-handler.ts` | Minimal RPC template |
| `product/apps/portal/api/server/status.rpc.ts` | Complex response schema example |
| `product/apps/portal/api/server/rpc-group.ts` | Where to register new RPC |
| `product/apps/portal/api/server/rpc-server.ts` | Where to wire handler + layer |
| `product/platform/library/sessiond-managed-launch-protocol.ts` | Protocol evolution rules comment |
| `docs/handoffs/steam-observability-implementation-handoff-2026-06-14.md` | Full spec |
| `docs/research/steam-observability/bandai-2026-06-14/` | Ground-truth fixtures |

### Areas Needing Clarification

1. **Steam log dir env variable name**: The handoff says `/var/lib/korri/steam/logs`. The Nix module and `steam-state-materializer.ts` use `stateRoot`. The tailer should read an env var; confirm the canonical name (`KORRI_STEAM_STATE_ROOT` appended with `/logs`, or `KORRI_STEAM_LOG_DIR` directly).

2. **Observer service as Effect Service or plain function**: The tailer + observer could be a Context.Service (Effect) or a plain-object dependency like `GamescopeReaper`. Given that the status RPC handler will need to call it, an Effect Context.Service with a `LayerLive` would align with `KorriControl` and `StreamControlLayerLive` patterns. However, the tailer is long-running (file watching), which doesn't map cleanly to a request-scoped Effect. Plain async with `createSteamObserver()` returning a handle (like `startKorriSessiond` returning `KorriSessiondHandle`) is simpler for the first slice.

3. **`steam/` directory on trunk**: The `product/services/device/steam/` directory does not exist on `trunk` yet (only in the `steam-ts-planner-handoff` worktree). Either merge the planner worktree first, or create the directory fresh when implementing observability.

4. **Fixture README**: The `docs/research/steam-observability/bandai-2026-06-14/README.md` and `notes.md` are stubs. The handoff says to fill them as Unit 1 — should happen before or during Unit 2 implementation.
