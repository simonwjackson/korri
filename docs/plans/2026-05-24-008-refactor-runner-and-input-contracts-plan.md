---
title: "refactor: Replace runner and desktop input workarounds with explicit contracts"
type: refactor
status: completed
date: 2026-05-24
verify_command: "just typecheck && just test-unit && just test-nix"
---

# refactor: Replace runner and desktop input workarounds with explicit contracts

## Summary

Replace two emergency-shaped fixes with explicit integration contracts: the game-stream runner gets absolute Sway/Gamescope tool commands from Nix instead of depending on Sunshine/user PATH, and desktop input gets a Korri-owned renderer dispatch channel instead of interposing on Electrobun's framework-owned `receiveMessageFromBun` hook.

---

## Problem Frame

Recent Sobo validation exposed two hidden assumptions that had worked earlier by accident: Sunshine app execution did not preserve the same PATH the service/user manager had, and Electrobun is free to assign `window.__electrobun.receiveMessageFromBun` after Korri preload runs. The current patches prove the failures but risk committing workaround-shaped architecture unless they are recut into explicit module and transport contracts.

---

## Requirements

- R1. The game-stream runner must not depend on an inherited interactive/user-service PATH for runner-owned tools such as `swaymsg` and `gamescope`.
- R2. Runner-owned tool failures must be classified as runner dependency/preflight/spawn failures rather than as ordinary game exits whenever possible.
- R3. The Sunshine/Nix module contract must make required runner tools visible in evaluation tests and generated runtime environment.
- R4. Desktop input must remain brokered through the Electrobun/Bun process as semantic `InputAction` payloads; the renderer must not connect directly to raw `inputd`.
- R5. Desktop input delivery must not monkeypatch or depend on Electrobun's framework-owned `window.__electrobun.receiveMessageFromBun` handler.
- R6. Renderer actions stay edge-triggered and non-replayed; status remains replayable after preload, reload, or `dom-ready`.
- R7. Existing active-window routing semantics must survive: send to the active window, use sole-window fallback, and fail closed/drop when multiple windows exist without a known active target.
- R8. Packaged desktop builds must prove the preload/dispatch artifact is present rather than relying on a runtime fallback injection.

---

## Scope Boundaries

- No full migration of desktop input to renderer-direct raw `inputd` WebSockets; the Bun-side broker remains the semantic/focus-gating owner.
- No rewrite of the native input event schema or gamepad mapping tables.
- No redesign of the default Gamescope policy cascade; this plan only fixes runner tool delivery for that policy.
- No physical-host NixOS rebuild/deploy automation; this plan prepares repo code so the next build carries the fixes.
- No additional stream quality, bitrate, encoder, or Moonlight tuning.

### Deferred to Follow-Up Work

- Enforce absolute `LaunchSpec.command` at the schema/compose boundary if further PATH tightening shows game commands still depend on ambient PATH.
- Add a physical Sobo/ROCKNIX acceptance checklist once the permanent `/dev/video*` passthrough work is planned.
- Consider a future desktop input transport over a dedicated loopback endpoint if Electrobun exposes a cleaner first-class webview messaging API later.

---

## Context & Research

### Relevant Code and Patterns

- `nix/modules/korri-game-stream.nix` owns the Sunshine app wrapper and already exports runtime paths such as `KORRI_GAME_STREAM_RUNTIME_DIR`, `KORRI_GAME_STREAM_INTENT_PATH`, and `KORRI_GAME_STREAM_STATUS_PATH` explicitly.
- `tools/device/game-stream-runner.ts` currently defaults to `createSwayCommandRunner("swaymsg")` and passes Gamescope options to `composeGamescopeLaunchSpec`, so both tool paths can be injected at the runner boundary.
- `tools/device/game-stream-fullscreen.ts` already supports a `GamescopeOptions.command`; the missing part is threading an explicit command into it from the runner/Nix contract.
- `korri/shared/input/desktop-bridge-wire.ts` already defines schema-typed semantic input action/status bridge payloads and encode/decode helpers.
- `korri/shared/input/desktop-input-broker-core.ts` owns inputd connection, semantic mapping, counters, active-state tracking, and edge-triggered action vs replayable status behavior.
- `korri/deploy/desktop/input-broker.ts` is the Electrobun-specific target adapter; it is the correct place to translate a typed broker payload into a renderer delivery mechanism.
- `korri/deploy/desktop/preload.ts` should be the single renderer-side owner of `window.__korriInput`; `korri/deploy/desktop/input-bridge-fallback.ts` duplicates that ownership through runtime JS injection.
- `nix/korri-desktop/unwrapped.nix` already builds and asserts `Resources/app/views/mainview/preload.js`, which can serve as the hard packaging proof for the input dispatch contract.
- `docs/plans/2026-05-24-004-refactor-renderer-bun-boundary-plan.md` explicitly deferred auditing `window.__korriInput` after removing connection/runtime pushes.
- `docs/plans/2026-05-24-007-feat-default-gamescope-foreground-launch-plan.md` treats Gamescope policy as visible resolved launch metadata, not as a hidden runner fallback.

### Institutional Learnings

- `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md` — session-scoped runners need explicit runtime contracts; do not rely on boot/user service inheritance.
- `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md` — trust generated Nix/Sunshine app files and validate with fresh one-shot intents; avoid stale local Sunshine/user config assumptions.
- `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md` — Gamescope is an adapter; Sway/foreground repair remains a session-owner capability and should be explicit.
- `docs/solutions/integration-issues/one-command-odin-electrobun-deploy-needs-device-nix-and-session-env-2026-05-06.md` — graphical/session code under systemd needs explicit PATH/display/session environment, not an interactive shell model.
- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — input should flow through semantic actions and lifecycle-managed adapters, not component-coupled or one-off push paths.
- `docs/solutions/best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md` — keep the desktop wrapper thin and use clear contracts at the Bun/renderer boundary.

### External References

- No web research was needed. The relevant contracts are local: NixOS module generation, Electrobun's checked-in implementation, and existing Korri input/session patterns.

---

## Key Technical Decisions

- **Use explicit runner tool commands, not PATH, as the source of truth.** Nix should export absolute `swaymsg` and `gamescope` command paths to the runner. PATH can remain a convenience for basic wrapper utilities, but it is no longer the contract for runner-owned tools.
- **Thread tool commands at the CLI/main boundary.** Manual/dev runs keep bare-name fallbacks (`swaymsg`, `gamescope`), while Nix-managed Sunshine runs get store paths through environment variables.
- **Keep game env separate from runner tool resolution.** `LaunchSpec.env` may configure the child game, but runner-owned commands must be resolved before per-game environment can hide them.
- **Use a Korri-owned renderer dispatch function for input.** Preload installs `window.__korriInput` plus an internal Korri dispatch entry point; Bun calls that dispatch entry point directly rather than assigning/wrapping `window.__electrobun.receiveMessageFromBun`.
- **Keep desktop input brokered and semantic-only.** The renderer continues to subscribe to `window.__korriInput`; only the delivery mechanism from Bun to that bridge changes.
- **Treat missing preload as a packaging/runtime failure.** Remove the runtime fallback injection once build/tests prove `preload.js` is present and the bridge dispatch works.
- **Preserve replay semantics.** Actions are never replayed to late subscribers; status is stored by preload and pushed/replayed after `dom-ready` or subscription.

---

## Open Questions

### Resolved During Planning

- Should the Electrobun fix keep the current `receiveMessageFromBun` chain or introduce a Korri-owned dispatch channel? — Use a Korri-owned dispatch channel. The user selected this direction because it avoids committing a framework-global monkeypatch.
- Should Sunshine runner dependencies be expressed as PATH entries or explicit commands? — Use explicit command paths as the primary contract, with PATH only as wrapper/dev convenience.
- Should the renderer connect directly to raw inputd as a cleaner transport? — No. This would bypass the Bun-side semantic broker, active-window routing, and device-profile fail-closed behavior.
- Should the main-world input fallback remain as belt-and-suspenders? — No. It duplicates preload ownership and should be replaced with packaging/runtime proof.

### Deferred to Implementation

- Exact environment variable names for runner tool commands. Suggested names are `KORRI_GAME_STREAM_SWAYMSG_COMMAND` and `KORRI_GAME_STREAM_GAMESCOPE_COMMAND`, but implementation can choose names consistent with nearby runner env naming.
- Exact name of the internal Korri dispatch entry point on `window`. Suggested shape is a non-public `window.__korriInputDispatch(payload)` or a namespaced equivalent; implementation should keep the public renderer API as `window.__korriInput`.
- Whether the broker uses `webview.executeJavascript` directly or a tiny target adapter wrapper around it. The key constraint is that it calls the Korri-owned dispatch entry point, not Electrobun's receive hook.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TD
  subgraph StreamHost[Sunshine / game-stream host]
    Nix[NixOS gameStream module] --> Env[Explicit runner command env]
    Env --> Wrapper[korri-game-stream-sunshine-app]
    Wrapper --> Runner[game-stream-runner]
    Runner --> Sway[swaymsg via explicit path]
    Runner --> Scope[gamescope via explicit path]
    Scope --> Game[resolved game command]
  end

  subgraph DesktopInput[Electrobun desktop input]
    Inputd[inputd websocket] --> Broker[Bun desktop input broker]
    Broker --> Target[Electrobun target adapter]
    Target --> Dispatch[window.__korriInputDispatch(payload)]
    Dispatch --> Bridge[window.__korriInput subscribers]
    Bridge --> React[desktop-bridge adapter / navigation]
  end
```

The stream-host side makes session tools explicit at the Nix/runtime seam. The desktop side keeps the existing semantic input API but changes delivery so Korri owns its own dispatch hook and Electrobun owns its RPC hook independently.

---

## Implementation Units

### U1. Make game-stream runner tools explicit Nix/runtime commands

**Goal:** Replace Sunshine/user PATH dependency for runner-owned tools with explicit command paths exported by the Nix module and consumed by the runner.

**Requirements:** R1, R2, R3

**Dependencies:** None

**Files:**
- Modify: `nix/modules/korri-game-stream.nix`
- Modify: `tools/device/game-stream-runner.ts`
- Test: `tools/device/game-stream-runner.test.ts`
- Modify: `tools/testing/nix/korri-server-module-eval.fixture.nix`
- Test: `tools/testing/nix/korri-server-module-eval.test.ts`

**Approach:**
- Add explicit Nix-provided runner command environment for Sway and Gamescope tools, derived from `cfg.sway.package` and `cfg.gamescope.package`.
- Export those command env values unconditionally after `sessionEnvFile` is sourced, so stale inherited/session-file values cannot override the Nix store paths in managed deployments.
- Keep `cfg.path` focused on wrapper utility dependencies and dev/manual convenience rather than as the semantic dependency contract for `swaymsg`/`gamescope`.
- At the `game-stream-runner` CLI/main boundary, read the explicit command env vars and pass them into `createSwayCommandRunner(...)` and `composeGamescopeLaunchSpec(...)`.
- Preserve bare-name defaults for non-Nix/dev usage, but ensure Nix-managed Sunshine apps use store paths.
- Define Gamescope command precedence explicitly: an absolute per-intent `gamescope.command` wins; otherwise use the Nix-provided command env; otherwise fall back to bare `gamescope` only for dev/manual runs. In Nix-managed runs, a non-absolute per-intent Gamescope command should fail preflight instead of falling back to PATH.
- Keep per-game `LaunchSpec.env` from deciding where runner-owned tools are found.
- Replace the current eval test expectation that Gamescope/Sway appear in Sunshine app PATH with expectations that explicit command env values are present in the generated wrapper and point at the configured packages.

**Patterns to follow:**
- Runtime env export style in `nix/modules/korri-game-stream.nix` for intent/status/runtime paths.
- Existing `GamescopeOptions.command` seam in `tools/device/game-stream-fullscreen.ts`.
- Existing injected command runner seam in `createSwayCommandRunner`.

**Test scenarios:**
- Happy path: Nix eval exposes explicit Sway and Gamescope command env values for the generated Sunshine app/wrapper contract.
- Happy path: generated wrapper exports those command env values after sourcing `sessionEnvFile`.
- Happy path: runner composes a Gamescope launch using the env-provided Gamescope command instead of bare `gamescope` when the intent has no command override.
- Happy path: an absolute per-intent Gamescope command overrides the Nix-provided default.
- Happy path: runner repairs fullscreen using the env-provided Sway command instead of bare `swaymsg`.
- Edge case: with no explicit env values, dev/manual runner usage still falls back to bare names.
- Error path: a non-absolute per-intent Gamescope command under a Nix-managed runner is reported as a preflight failure and requeues the intent.
- Error path: a missing/invalid Sway command during pre-launch snapshot is reported as a preflight/fullscreen dependency failure and requeues the intent rather than silently consuming it as a game exit.
- Integration: per-game env containing a narrow `PATH` does not hide the runner-owned Sway/Gamescope commands.

**Verification:**
- Generated Nix module output documents the runner tool contract without relying on Sunshine's inherited PATH.
- Game-stream runner unit tests prove explicit commands are threaded into both wrapping and repair.

---

### U2. Introduce a Korri-owned desktop input dispatch contract

**Goal:** Make preload the single owner of the renderer input bridge and stop using Electrobun's `receiveMessageFromBun` as Korri's input delivery bus.

**Requirements:** R4, R5, R6, R8

**Dependencies:** None

**Files:**
- Modify: `korri/deploy/desktop/preload.ts`
- Modify: `korri/deploy/desktop/preload-entry.ts`
- Modify: `korri/deploy/desktop/preload.test.ts`
- Modify: `korri/deploy/desktop/preload-input-action-bridge.test.ts`
- Delete: `korri/deploy/desktop/input-bridge-fallback.ts`
- Delete: `korri/deploy/desktop/input-bridge-fallback.test.ts`
- Modify: `nix/korri-desktop/unwrapped.nix`
- Modify: `nix/korri-desktop/wrap.nix`

**Approach:**
- Replace `chainAcceptor` with a Korri-owned dispatch entry point installed by preload. The public API remains `window.__korriInput`; the dispatch entry point is internal to Bun/preload delivery.
- Reuse `isDesktopInputActionBridgePayload` and `isDesktopInputStatusBridgePayload` so preload accepts only schema-valid Korri input payloads.
- Keep actions edge-triggered: dispatch delivers to current action listeners only and does not store/replay actions.
- Keep status replayable: dispatch updates the stored status snapshot and notifies current status subscribers; new subscribers can call `getStatus()`.
- Remove the main-world fallback script itself. U3 owns removing the `main.ts` import/calls that installed it.
- Update Nix desktop comments/postconditions if needed so `preload.js` is explicitly described as the owner of the input dispatch contract, not an Electrobun receive hook chain.

**Patterns to follow:**
- Existing `KorriInputBridge` subscribe/getStatus shape in `korri/deploy/desktop/preload.ts`.
- Schema guards and payload types in `korri/shared/input/desktop-bridge-wire.ts`.
- Existing Nix artifact assertion pattern in `nix/korri-desktop/unwrapped.nix`.

**Test scenarios:**
- Happy path: installing preload creates `window.__korriInput` and an internal dispatch function; dispatching a valid action notifies current action subscribers once.
- Happy path: dispatching a valid status updates `getStatus()` and notifies status subscribers.
- Edge case: an action dispatched before a subscriber exists is not replayed to later subscribers.
- Edge case: malformed payloads are ignored and do not poison later valid dispatches.
- Error path: a throwing subscriber is isolated so other subscribers and later dispatches still work.
- Integration: assigning/reassigning `window.__electrobun.receiveMessageFromBun` after preload does not affect Korri input dispatch because Korri no longer uses that hook.
- Packaging: desktop unwrapped build still asserts `Resources/app/views/mainview/preload.js` exists.

**Verification:**
- No production code references `input-bridge-fallback`.
- No Korri preload code depends on `window.__electrobun.receiveMessageFromBun` for input delivery.
- Renderer-facing API remains `window.__korriInput`, so React input adapters do not change.

---

### U3. Route broker payloads through the Korri dispatch target while preserving active-window semantics

**Goal:** Update the Bun-side desktop input target adapter to deliver schema-encoded semantic payloads to the Korri dispatch entry point and keep current active-window/drop/status behavior intact.

**Requirements:** R4, R6, R7

**Dependencies:** U2

**Files:**
- Modify: `korri/deploy/desktop/input-broker.ts`
- Modify: `korri/deploy/desktop/main.ts`
- Test: `korri/deploy/desktop/input-broker.test.ts`
- Test: `korri/shared/input/desktop-input-broker-core.test.ts`

**Approach:**
- Change the Electrobun-specific target adapter from `sendMessageToWebviewViaExecute(payload)` to a Korri-owned dispatch call against the webview. Use safe JSON serialization and a single helper so call-site behavior is testable.
- Prefer encoding action/status payloads with `encodeDesktopInputActionBridgePayload` and `encodeDesktopInputStatusBridgePayload` at the broker boundary. Keep this in the target adapter if possible; modify `desktop-input-broker-core.ts` only if implementation shows the core must own encoding.
- Preserve `getActiveTarget()` behavior for actions: active window wins, a single window is a valid fallback, and multiple windows with no active target drop actions rather than broadcasting them.
- Keep status broadcasts to all targets, as today, because status is replayable diagnostics rather than user action input.
- Preserve `onDomReady` status replay. Actions remain edge-triggered and may be dropped if the renderer is not ready; status is resent when the DOM is ready.
- Remove `installInputBridgeFallback` import/calls from `korri/deploy/desktop/main.ts`.
- Keep `desktop-bridge-adapter.ts` polling for `window.__korriInput`; that is renderer-side resilience to preload timing and does not recreate a Bun-side fallback bridge.

**Patterns to follow:**
- `windowToTarget` adapter boundary in `korri/deploy/desktop/input-broker.ts`.
- Active-target and status counters in `korri/shared/input/desktop-input-broker-core.ts`.

**Test scenarios:**
- Happy path: broker sends a schema-encoded action to the active webview through the Korri dispatch helper.
- Happy path: broker sends a schema-encoded status update to all targets and re-sends status on `dom-ready`.
- Edge case: no active target with exactly one window uses the sole-window fallback for actions.
- Edge case: no active target with multiple windows drops the action, increments `droppedActions`, resets mapper state, and does not broadcast the action.
- Edge case: renderer reload/`dom-ready` receives status but not stale held-button actions.
- Error path: serialization or Bun-side dispatch-call construction failure increments `pushFailures` and records `lastError` without stopping inputd reconnect loops. Renderer-side missing-dispatch detection is not assumed because Electrobun executes JavaScript without completion.

**Verification:**
- Input broker tests cover delivery, active-window routing, dropped-action accounting, and status replay under the new dispatch mechanism.
- `main.ts` no longer installs a duplicate bridge on every window.

---

## System-Wide Impact

- **Interaction graph:** Sunshine starts the Korri runner wrapper; the wrapper exports explicit tool commands; runner composes Gamescope and Sway repair with those commands. Desktop inputd still flows through Bun broker, then to preload, then to `desktop-bridge-adapter` and navigation.
- **Error propagation:** Missing runner tools should surface as preflight/spawn/fullscreen failures with requeue where appropriate. Bun-side serialization/dispatch-construction failures increment input status counters and log warnings without crashing the broker; renderer-side missing-dispatch failures are handled by packaging/preload proof rather than assumed synchronous detection.
- **State lifecycle risks:** Renderer reloads can lose edge-triggered actions, which is acceptable; status replay on `dom-ready` preserves diagnosability. Runner dependency failures before a successful foreground repair should not consume the user's pending launch intent.
- **API surface parity:** Public renderer API remains `window.__korriInput`; inputd raw WebSocket and native event schemas remain Bun-side concerns. Launch intent structure remains unchanged except for explicit command use during execution.
- **Integration coverage:** Unit tests alone will not prove physical Sobo behavior; the permanent runtime/image validation should include one controller navigation smoke and one Moonlight stream launch after these code contracts land.
- **Unchanged invariants:** Components still use semantic action subscriptions via shared navigation/input APIs. Gamescope policy remains config-resolved and separate from foreground ownership.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| The Korri dispatch call still uses Electrobun `executeJavascript`, so delivery is still one-way JS execution. | Scope the use to a Korri-owned dispatch function, keep payloads schema-encoded, resend status on `dom-ready`, and do not use framework-owned RPC globals. |
| Removing the fallback bridge could break navigation if preload packaging regresses. | Keep/strengthen `preload.js` package assertions and add focused preload/adapter tests; treat missing preload as a build/runtime failure. |
| Explicit runner command env values could drift from Nix package options. | Derive env values directly from `cfg.sway.package` and `cfg.gamescope.package`; assert them in Nix eval tests. |
| Per-game environment may still affect child execution in surprising ways. | Keep runner-owned tool resolution outside per-game PATH; defer stricter `LaunchSpec.command` absolute-path enforcement if needed. |
| Live Sobo behavior depends on runtime patches not covered here (`/dev/video*` passthrough, deployed package replacement). | Keep those as separate follow-up work; this plan only makes the two named code contracts idiomatic. |

---

## Documentation / Operational Notes

- Update comments in `nix/korri-desktop/unwrapped.nix` and `nix/korri-desktop/wrap.nix` so they describe brokered semantic input via Korri preload dispatch, not Electrobun receive-message chaining.
- If the runner env var names become public troubleshooting handles, mention them in the game-stream module option descriptions or nearby comments.
- After implementation and validation, consider capturing a short `docs/solutions/` learning about avoiding framework-owned WebView receive hooks for product-owned channels.

---

## Sources & References

- Related requirements: `docs/brainstorms/2026-05-03-native-input-bridge-requirements.md`
- Related requirements: `docs/brainstorms/2026-05-18-headless-game-stream-orchestration-requirements.md`
- Related requirements: `docs/brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md`
- Related plan: `docs/plans/2026-05-24-004-refactor-renderer-bun-boundary-plan.md`
- Related plan: `docs/plans/2026-05-24-007-feat-default-gamescope-foreground-launch-plan.md`
- Related code: `nix/modules/korri-game-stream.nix`
- Related code: `tools/device/game-stream-runner.ts`
- Related code: `tools/device/game-stream-fullscreen.ts`
- Related code: `korri/deploy/desktop/preload.ts`
- Related code: `korri/deploy/desktop/input-broker.ts`
- Related code: `korri/shared/input/desktop-input-broker-core.ts`
- Related code: `korri/shared/input/desktop-bridge-wire.ts`
