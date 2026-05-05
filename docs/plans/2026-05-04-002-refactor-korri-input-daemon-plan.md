---
title: "refactor: Replace ROCKNIX input_sense with Korri input daemon"
type: refactor
status: implemented
date: 2026-05-04
origin: docs/brainstorms/2026-05-03-native-input-bridge-requirements.md
deepened: 2026-05-04
---

# refactor: Replace ROCKNIX input_sense with Korri input daemon

## Overview

Replace the current split input ownership on the Odin with one Korri-owned native input daemon. The new daemon reads `/dev/input/event*`, continues to provide the native input WebSocket stream consumed by the renderer, owns global controller chords, and replaces the subset of ROCKNIX `/usr/bin/input_sense` behavior Korri still needs while explicitly dropping behavior we do not care about.

This turns the existing native input bridge from a renderer-only transport into the device input policy owner. `inputplumber.service` remains in place for controller normalization; ROCKNIX `input.service` / `input_sense` is masked only after Korri has parity for the required actions.

## Problem Frame

Korri is moving toward replacing ROCKNIX over time, but today's Odin stack still depends on ROCKNIX for launcher input plumbing. The current situation has three overlapping input readers:

- `tools/odin/input-bridge.ts` reads `/dev/input/event*` for Korri UI navigation.
- `/storage/bin/korri-toggle-daemon` reads `/dev/input/event*` for Korri session toggling.
- ROCKNIX `/usr/bin/input_sense` reads `/dev/input/event*` for kill-game and system hotkeys.

That was acceptable as a bridge phase, but it makes input policy ambiguous. The user-visible kill-game chord works because `input_sense` watches `BTN_TL + BTN_SELECT + BTN_START` and then kills whatever process is named in `/tmp/.process-kill-data`. Pressing `L1+R1+Start+Select` works because it includes that ROCKNIX three-button subset; R1 is not actually part of the current policy.

Korri should own that policy directly. The replacement should keep useful system affordances, especially kill-game and screen switching, while dropping non-goals such as screenshots.

## Requirements Trace

- R1. Korri owns global controller chord policy in a single daemon; no permanent parallel Korri toggle daemon plus ROCKNIX combo owner.
- R2. The renderer native input bridge behavior remains available on the same conceptual contract: gamepad evdev events stream to the renderer and map to existing semantic `InputAction`s from the origin document.
- R3. Kill-current-game is a first-class Korri action using the existing ROCKNIX `/tmp/.process-kill-data` contract so Korri can kill any emulator launched through `runemu.sh` or `start_*.sh` without hardcoding every emulator.
- R4. `L1+R1+Start+Select` is represented as the intended kill-game chord, not as an accidental superset of ROCKNIX's `L1+Select+Start` behavior.
- R5. Korri keeps useful device/system actions from `input_sense`: volume, brightness, power/suspend, lid handling when present, and screen switching via `/usr/bin/screen_switch`.
- R6. Korri explicitly drops screenshot, game guide, MangoHud toggle, and touchscreen keyboard shortcuts from the replacement scope.
- R7. `inputplumber.service` remains active; Korri replaces `input.service` / `/usr/bin/input_sense`, not controller normalization.
- R8. The Odin install/dev loop remains recoverable: masking ROCKNIX input is reversible and failure diagnostics point to Korri inputd logs.
- R9. The replacement survives a device reboot. If Korri masks ROCKNIX `input.service`, inputd must be installed as a persistent boot-started service or the installer must refuse to make the mask persistent.

## Scope Boundaries

- Do not patch `/usr/bin/input_sense` in place. It is OS-owned and can be overwritten by ROCKNIX updates.
- Do not replace `inputplumber.service`; it remains the source of the virtual controller device Korri reads.
- Do not reimplement screenshots, game guide launch, MangoHud toggle, or touchscreen keyboard shortcuts.
- Do not replace `runemu.sh` or the emulator launch scripts in this work. Korri consumes their existing `/tmp/.process-kill-data` kill-target contract.
- Do not change React component navigation APIs. Components still consume semantic actions through the existing input bus and navigation layer.

### Deferred to Separate Tasks

- Full replacement of ROCKNIX launcher/emulator scripts: future Korri OS work after input policy is owned.
- Direct reimplementation of `/usr/bin/screen_switch`: keep shelling out to the existing ROCKNIX command until display-output ownership moves into Korri.
- A user-facing input settings UI: future product work after the daemon has a stable action registry.

## Context & Research

### Relevant Code and Patterns

- `tools/odin/input-bridge.ts` already discovers devices, opens evdev streams, parses bytes, survives device-node movement, and hosts the WebSocket bridge. This is the strongest base for `korri-inputd`.
- `korri/shared/input/native/parse-evdev.ts` parses 24-byte Linux `input_event` records and should remain the single parser.
- `korri/shared/input/native/discover-devices.ts` parses `/proc/bus/input/devices`, classifies devices, and provides stable `deviceId` values.
- `korri/shared/input/native/wire-schema.ts` defines the bridge wire schema and should remain the renderer transport contract.
- `korri/shared/input/native-adapter.ts` maps gamepad-class wire events into semantic actions and already preserves the existing navigation architecture.
- `scripts/odin/install-korri-toggle.sh` installs `/storage/bin/korri-session-toggle` and `/storage/bin/korri-toggle-daemon`; the session-toggle script is useful, but the daemon should be retired.
- `scripts/odin/dev.sh` supervises the remote API and input bridge as detached `setsid` processes for iteration. The new daemon should plug into this dev seam while `scripts/odin/install.sh` also establishes a reboot-persistent inputd service before persistently disabling ROCKNIX `input.service`.
- `scripts/odin/run-input-bridge.sh` is the current device entrypoint for the bridge and should become an inputd runner.
- `scripts/odin/smoke-input.ts` verifies the current bridge subscription path and should be expanded/renamed to verify daemon bridge plus action readiness.
- ROCKNIX `/usr/bin/input_sense` currently defines default hotkey modifiers `BTN_TL`, `BTN_SELECT`, and `BTN_START`, then calls `killall` using `/tmp/.process-kill-data`.
- ROCKNIX `/etc/profile.d/001-functions` defines `set_kill`, and `runemu.sh` / `start_*.sh` populate `/tmp/.process-kill-data` for emulator-specific kill targets.

### Institutional Learnings

- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` keeps input adapters behind the semantic bus; the daemon must preserve that renderer contract rather than adding component-level input APIs.
- `docs/development/odin-iterative-loop.md` documents detached Odin services and log locations; this plan updates that operational model from input bridge to input daemon.
- `docs/development/standards.md` requires real implementations over mocks. Tests should use real evdev byte fixtures, real process-runner seams with deterministic commands, and real WebSocket servers where the bridge contract is exercised.

### External References

External research is intentionally skipped. The relevant contract is local and device-observed: Linux evdev, existing Korri bridge code, and ROCKNIX's installed `/usr/bin/input_sense` plus `set_kill` behavior on the target Odin.

## Key Technical Decisions

- **One daemon, one device input policy owner.** `korri-inputd` replaces both `tools/odin/input-bridge.ts` as a standalone service and `/storage/bin/korri-toggle-daemon`. It hosts the renderer WebSocket bridge and owns global chords in the same process.
- **Keep `inputplumber.service`; mask `input.service`.** InputPlumber normalizes physical/controller devices into the virtual controller Korri already sees. ROCKNIX `input.service` is the redundant policy owner and should be masked only after Korri inputd starts and passes smoke checks.
- **Inputd reads more than gamepads for policy, but emits gamepads to the renderer by default.** The current bridge opens only gamepad streams because renderer navigation only needs gamepads. Replacing `input_sense` requires inputd to also read relevant keyboard/switch/touch/system event devices for power, lid, volume, and other retained system actions. The WebSocket subscription contract remains class-gated so renderer behavior does not broaden accidentally.
- **Boot persistence is part of replacement, not an optional polish step.** A detached `setsid` process is acceptable for `just dev-odin`, but replacing `input_sense` requires inputd to start at boot before or alongside the UI. The exact persistent unit location is implementation-owned because ROCKNIX's writable systemd override location must be verified on the target image; the installer should not persistently mask `input.service` until that service path is installed and smoke-checked.
- **Use exact chord matching for destructive actions.** Kill-current-game should require the intended four-button chord `BTN_TL + BTN_TR + BTN_SELECT + BTN_START`. Extra held buttons should not accidentally widen destructive shortcuts unless explicitly configured later.
- **Keep `/tmp/.process-kill-data` as the kill contract.** This gives Korri immediate parity with ROCKNIX launchers without hardcoding emulator names. If the file is missing or empty, the action should no-op with a warning rather than killing a broad process pattern.
- **Shell out for ROCKNIX system actions initially.** Volume, brightness, power/suspend, and screen-switch behavior already exist as ROCKNIX commands. The daemon should call those commands through an injectable process-runner seam now and can replace command internals later.
- **Do not introduce a product-level shortcut API.** Chord policy belongs to the device daemon, not React routes or shared themes. Renderer code continues receiving semantic actions only for UI navigation.
- **Prefer compatibility wrappers during transition.** Existing script names can remain as thin wrappers where useful, but only `korri-inputd` should be started by install/dev/check recipes after this plan lands.

## Open Questions

### Resolved During Planning

- **Should Korri run alongside `input_sense` permanently?** No. Parallel ownership was a bridge state. This plan replaces `input_sense` for the behaviors Korri cares about and masks ROCKNIX `input.service` after smoke checks.
- **Should screenshots be preserved?** No. Screenshots are explicitly out of scope per the user's direction.
- **Should screen switch be preserved?** Yes. It may be useful for external display or docked output, so Korri should keep it by invoking `/usr/bin/screen_switch`.
- **Should R1 be required for kill-game?** Yes. The new intended kill chord is `L1+R1+Start+Select`; ROCKNIX's current `L1+Select+Start` subset behavior should not be carried forward accidentally.

### Deferred to Implementation

- **Exact button code names for all physical Odin variants.** The plan uses Linux names (`BTN_TL`, `BTN_TR`, `BTN_SELECT`, `BTN_START`) based on the current InputPlumber virtual Xbox device. If implementation observes different names for a required physical event, add a device fixture and map it in the chord registry.
- **Power/lid action nuances.** `input_sense` calls ROCKNIX suspend helpers. The first implementation should shell out to the existing command and record any device-specific behavior differences during on-device smoke.
- **Exact persistent-service location on ROCKNIX.** The installer must verify the writable/persistent systemd unit or autostart location on the target image. If no persistent location is available, the implementation should keep the `input.service` mask runtime-only and document the limitation instead of creating a reboot that has no input owner.

## Output Structure

```text
korri/shared/input/native/
  button-codes.ts
  chord-engine.ts
  chord-engine.test.ts

tools/odin/
  inputd.ts
  inputd.test.ts
  inputd-actions.ts
  inputd-actions.test.ts

scripts/odin/
  run-inputd.sh
  smoke-input.ts        # modified or renamed, preserving just check-odin contract
  install.sh            # modified
  dev.sh                # modified
```

This tree is the expected shape, not a rigid constraint. The important boundary is that pure input/chord logic lives under `korri/shared/input/native/`, while Odin process ownership and shell actions live under `tools/odin/` and `scripts/odin/`.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
┌──────────────────────────── Odin / future Korri OS host ───────────────────────────┐
│                                                                                     │
│ inputplumber.service                                                                │
│   └─ normalized virtual controller under /dev/input/event*                          │
│                                                                                     │
│ korri-inputd                                                                        │
│   ├─ discover devices via /proc/bus/input/devices                                   │
│   ├─ read evdev streams and parse bytes                                             │
│   ├─ publish existing NativeInputEvent frames over WebSocket                        │
│   ├─ update pressed-button state per device                                         │
│   └─ match exact chords                                                             │
│        ├─ L1+R1+Select+Start → kill current game via /tmp/.process-kill-data        │
│        ├─ L3+R3+Start         → Korri session toggle                                │
│        ├─ volume keys / function chords → volume / brightness actions               │
│        ├─ power / lid events      → suspend actions                                 │
│        └─ configured screen chord  → /usr/bin/screen_switch                         │
│                                                                                     │
│ ROCKNIX input.service / input_sense                                                 │
│   └─ stopped/masked after korri-inputd smoke passes                                 │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ existing ws://... native input contract
                                      ▼
                       korri/shared/input/native-adapter.ts
                                      │
                                      ▼
                         existing InputBus + navigation stack
```

## Implementation Units

- [x] **Unit 1: Extract a pure button chord engine**

**Goal:** Add a pure, testable chord engine that tracks button press/release state per device and emits configured actions exactly once until the chord is released.

**Requirements:** R1, R4

**Dependencies:** None

**Files:**
- Create: `korri/shared/input/native/button-codes.ts`
- Create: `korri/shared/input/native/chord-engine.ts`
- Test: `korri/shared/input/native/chord-engine.test.ts`

**Approach:**
- Define named Linux gamepad button constants for the buttons Korri policy uses: shoulders, stick buttons, start/select, d-pad, and face buttons if needed for future action parity.
- Model chord definitions as data: id, required button codes, optional device-class filter, exact-match flag, and fire policy.
- Track pressed buttons by `deviceId` so a chord cannot be assembled accidentally from multiple devices.
- Treat destructive actions as exact-match by default; non-destructive future actions can opt out only by explicit registry choice.
- Keep this module free of filesystem, WebSocket, process, or timer concerns.

**Execution note:** Implement this test-first; exact-match and one-shot semantics are the safety contract.

**Patterns to follow:**
- `korri/shared/input/native/parse-evdev.ts` for small pure modules with focused tests.
- `korri/shared/input/native-adapter.test.ts` for event-sequence-style assertions.

**Test scenarios:**
- Happy path: pressing `BTN_TL`, `BTN_TR`, `BTN_SELECT`, and `BTN_START` on the same device emits `kill-current-game` exactly once.
- Edge case: pressing only `BTN_TL`, `BTN_SELECT`, and `BTN_START` emits nothing.
- Edge case: pressing `BTN_TL`, `BTN_TR`, `BTN_SELECT`, `BTN_START`, plus an unrelated button emits nothing for an exact destructive chord.
- Edge case: holding the completed chord across repeated `value 2` events does not emit repeatedly.
- Edge case: releasing any required button rearms the chord so a later complete press can emit again.
- Edge case: required buttons split across two device ids do not complete a chord.
- Error path: unknown button codes update no configured chord and produce no action.

**Verification:**
- Chord behavior is deterministic from raw input event sequences and does not depend on the daemon process.

- [x] **Unit 2: Add Korri inputd action runners**

**Goal:** Encapsulate all side-effecting system actions behind a small action-runner seam so inputd can own kill-game, session toggle, volume, brightness, power/lid, and screen switch without hardcoding shell behavior throughout the daemon.

**Requirements:** R3, R5, R6, R8

**Dependencies:** Unit 1

**Files:**
- Create: `tools/odin/inputd-actions.ts`
- Test: `tools/odin/inputd-actions.test.ts`

**Approach:**
- Define action ids for the replacement surface: kill current game, Korri session toggle, volume up/down, brightness up/down, power suspend, lid close/open handling, and screen switch.
- Implement a process-runner abstraction with deterministic tests. The production runner shells out to existing ROCKNIX/Korri commands; tests use a real configurable runner implementation that records invocations and outcomes.
- For kill-current-game, read `/tmp/.process-kill-data`, validate that it contains a non-empty target, then invoke kill behavior matching ROCKNIX semantics. Missing or empty file logs a warning and no-ops.
- For screen switch, invoke `/usr/bin/screen_switch` and surface failure as a logged warning, not a daemon crash.
- For screenshots, game guide, MangoHud, and touchscreen keyboard, do not create action ids.

**Execution note:** Add characterization-style tests for ROCKNIX kill-file semantics before wiring actions into the daemon.

**Patterns to follow:**
- `tools/testing/fake-game.sh` and `tools/testing/fake-game.test.ts` for real subprocess behavior with deterministic configuration.
- `tools/odin/input-bridge.ts` logger injection pattern.

**Test scenarios:**
- Happy path: kill-current-game with a kill file containing `retroarch retroarch32` invokes the runner with those targets.
- Edge case: kill-current-game with no kill file emits no runner call and records a warning.
- Edge case: kill-current-game with an empty or whitespace-only kill file emits no runner call and records a warning.
- Error path: runner failure for kill-current-game is logged and does not crash the action dispatcher.
- Happy path: screen-switch action invokes the configured screen-switch command.
- Error path: screen-switch command failure is logged and the daemon remains alive.
- Happy path: volume and brightness actions invoke the configured ROCKNIX commands with the intended direction.
- Happy path: power/lid actions invoke the existing suspend helper command path selected for the event.
- Scope guard: no action id exists for screenshot, game guide, MangoHud, or touchscreen keyboard.

**Verification:**
- Every retained `input_sense` behavior has one explicit action id and every dropped behavior is absent by construction.

- [x] **Unit 3: Build `korri-inputd` by merging bridge streaming and chord policy**

**Goal:** Create the single daemon process that reads evdev, serves the existing native input WebSocket stream, feeds the chord engine, and dispatches action runners.

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** Units 1 and 2

**Files:**
- Create: `tools/odin/inputd.ts`
- Test: `tools/odin/inputd.test.ts`
- Modify: `tools/odin/input-bridge.ts`
- Modify: `tools/odin/input-bridge.test.ts`

**Approach:**
- Preserve the current bridge contract: clients subscribe by device class and receive `device-added`, `device-removed`, and `input` events encoded with `korri/shared/input/native/wire-schema.ts`.
- Reuse discovery, event-source, hotplug, and stream-reopen behavior from `tools/odin/input-bridge.ts` rather than introducing a second reader implementation.
- Broaden device opening from gamepad-only to all classes needed by retained policy actions. Renderer subscribers still receive only the classes they request.
- Feed gamepad-class `EV_KEY` events into the chord engine before or alongside WebSocket broadcast. Feed retained non-gamepad system events into the system-action policy path without exposing them as renderer navigation actions by default.
- Ensure action dispatch is one-shot and non-blocking from the event stream's perspective. Slow shell actions should not pause broadcast of unrelated input events.
- Keep malformed WebSocket subscription handling as warn-and-ignore, matching the current bridge.
- Decide during implementation whether `tools/odin/input-bridge.ts` becomes a compatibility wrapper around inputd or is reduced to shared internals. The started service should be inputd, not bridge.

**Execution note:** Preserve current bridge tests while adding action/chord cases; this is a refactor with behavioral parity requirements.

**Patterns to follow:**
- `tools/odin/input-bridge.ts` for Bun server lifecycle, stream reopen, and current-device subscription behavior.
- `tools/odin/input-bridge.test.ts` for controllable event sources and real WebSocket clients.

**Test scenarios:**
- Happy path: a gamepad subscriber receives current `device-added` and streamed input events exactly as with the existing bridge.
- Happy path: completing the configured kill-game chord dispatches the kill action exactly once.
- Edge case: the same input event stream still broadcasts input frames to WebSocket clients while also driving chord matching.
- Edge case: non-gamepad device events are not matched as gamepad chords but can still dispatch retained system actions when explicitly mapped.
- Edge case: device removal clears pressed state for that device so stale held buttons cannot complete a later chord.
- Error path: action runner failure is logged and WebSocket streaming continues.
- Error path: an event stream read error triggers the existing reopen behavior and does not lose daemon process state for other devices.
- Integration: a newly subscribing client receives current devices after prior chord actions have fired.

**Verification:**
- `korri-inputd` is a strict superset of the current input bridge contract plus global action dispatch.

- [x] **Unit 4: Port required `input_sense` system events**

**Goal:** Replace the non-chord event behaviors from `input_sense` that Korri wants to retain: volume, brightness/function behavior, power/suspend, lid handling, and screen-switch shortcut.

**Requirements:** R5, R6, R7

**Dependencies:** Units 2 and 3

**Files:**
- Modify: `tools/odin/inputd.ts`
- Modify: `tools/odin/inputd-actions.ts`
- Test: `tools/odin/inputd.test.ts`
- Test: `tools/odin/inputd-actions.test.ts`

**Approach:**
- Add policy mappings for retained system events using named button/key codes rather than string matching against `evtest` output.
- Preserve volume repeat semantics for held volume buttons if those events are present in the discovered devices.
- Preserve the function-key brightness behavior only to the extent Korri actually needs it on the Odin; do not copy unrelated `input_sense` behaviors just because they exist.
- Map the selected screen-switch shortcut to the `screen-switch` action. If the existing ROCKNIX shortcut is awkward or conflicts with Korri chords, prefer a documented Korri registry entry over blindly inheriting the old one.
- Treat power and lid events as device/system events, not gamepad chords. They should not be delivered to renderer navigation as semantic gamepad actions.

**Execution note:** Use characterization from the observed `/usr/bin/input_sense` behavior as the guide, but only for retained behaviors.

**Patterns to follow:**
- `korri/shared/input/native/discover-devices.ts` class tagging for non-gamepad devices.
- Current `/usr/bin/input_sense` behavior as observed on the Odin, referenced in the plan rather than copied wholesale.

**Test scenarios:**
- Happy path: volume-up press dispatches volume-up once and starts repeat while held.
- Edge case: volume-up release stops repeat and does not dispatch after release.
- Happy path: function-plus-direction mapping dispatches brightness up/down for the retained brightness shortcuts.
- Happy path: power press dispatches the configured suspend action.
- Happy path: lid close/open events dispatch the configured lid action when those events are present.
- Happy path: screen-switch shortcut dispatches `screen-switch` and invokes `/usr/bin/screen_switch` through the action runner.
- Scope guard: screenshot, game guide, MangoHud, and touchscreen keyboard event sequences dispatch no action.
- Error path: repeated failure of a system action logs warnings without terminating inputd or blocking renderer input streaming.

**Verification:**
- Every retained `input_sense` behavior has explicit test coverage, and explicitly dropped behaviors are covered as no-ops.

- [x] **Unit 5: Replace Odin service wiring and retire the toggle daemon**

**Goal:** Change the install/dev/check recipes so the Odin starts `korri-inputd` as the only Korri input process, installs only the session-toggle command needed by actions, and masks ROCKNIX `input.service` after Korri inputd is ready.

**Requirements:** R1, R7, R8, R9

**Dependencies:** Units 1 through 4

**Files:**
- Create: `scripts/odin/run-inputd.sh`
- Create: `scripts/odin/install-inputd-service.sh`
- Modify: `scripts/odin/install.sh`
- Modify: `scripts/odin/dev.sh`
- Modify: `scripts/odin/install-korri-toggle.sh`
- Modify: `scripts/odin/smoke.sh`
- Modify: `scripts/odin/smoke-input.ts`
- Test expectation: none for shell script internals -- existing project convention validates Odin scripts through smoke checks rather than unit-testing shell scripts.

**Approach:**
- Replace `run-input-bridge.sh` usage with `run-inputd.sh`; keep environment variable compatibility where practical (`ODIN_INPUT_BRIDGE_PORT` can remain as the WebSocket port name until a broader rename is worth it).
- Add persistent-service installation for inputd during `install.sh`. The implementation must verify the target ROCKNIX unit location and only make `input.service` masking persistent after inputd is also persistent.
- Update `dev.sh` process cleanup to stop old `input-bridge.ts`, old `korri-toggle-daemon`, and new `inputd.ts` before starting inputd for the current iteration.
- Modify `install-korri-toggle.sh` so it no longer installs or starts a separate toggle daemon. It may continue installing `/storage/bin/korri-session-toggle` as an action target, or that script can move to a clearer installer if implementation makes that simpler.
- Add install-time readiness sequencing: start inputd, smoke-check its WebSocket bridge and action registry, verify boot persistence is installed, then mask/stop ROCKNIX `input.service`. If readiness or persistence fails, leave `input.service` unmasked or runtime-only and surface logs.
- Add rollback affordance in script help/status output: unmask/start ROCKNIX input service and stop inputd.
- Update logs from `/storage/korri-input-bridge.log` to `/storage/korri-inputd.log`, or keep the old log path as a compatibility alias with clear naming in output.

**Patterns to follow:**
- `scripts/odin/dev.sh` detached process and readiness-loop pattern.
- `scripts/odin/install.sh` idempotent install/update posture.
- `scripts/odin/install-korri-toggle.sh` status/remove/reset-host-key command shape for operational safety.

**Test scenarios:**
- Smoke: inputd starts and responds to a gamepad subscription before ROCKNIX `input.service` is disabled.
- Smoke: if inputd readiness fails, installer leaves ROCKNIX input service enabled and reports inputd logs.
- Smoke: status output shows whether inputd is running, whether ROCKNIX input service is masked, and where logs live.
- Smoke: rollback restores ROCKNIX input service and stops inputd.
- Smoke: after a simulated or real service restart, inputd comes back without the dev loop running.

**Verification:**
- The Odin has only one active policy owner after install and after reboot: `korri-inputd`; ROCKNIX `input.service` is stopped/masked only after successful readiness and persistence checks.

- [x] **Unit 6: Preserve renderer native adapter and dev-loop compatibility**

**Goal:** Ensure the renderer and existing dev tooling continue to consume native input through the same `VITE_KORRI_NATIVE_BRIDGE_URL` / WebSocket contract even though the backing process is now inputd.

**Requirements:** R2, R8

**Dependencies:** Units 3 and 5

**Files:**
- Modify: `korri/shared/input/native-adapter.ts`
- Test: `korri/shared/input/native-adapter.test.ts`
- Modify: `korri/shared/navigation/start.ts`
- Test: `korri/shared/navigation/start.test.ts`
- Modify: `scripts/odin/dev.sh`
- Modify: `scripts/odin/smoke-input.ts`

**Approach:**
- Keep `NativeInputEvent` unchanged unless Unit 3 reveals a necessary additive field. The renderer should not know whether the producer process is called input bridge or inputd.
- Keep `source: "native"` semantics unchanged for directional input mode.
- Ensure malformed daemon action/log events are never sent over the renderer input stream unless schema-explicit; UI adapters should only decode known native input events.
- Preserve current reconnect behavior when inputd restarts.
- Update user-facing script output to call the service inputd while keeping URLs stable.

**Patterns to follow:**
- `korri/shared/input/native-adapter.test.ts` real WebSocket test server pattern.
- `korri/shared/navigation/start.ts` peer-adapter composition; no arbitration logic.

**Test scenarios:**
- Happy path: existing native adapter maps inputd-emitted button/dpad/stick events to the same semantic actions as before.
- Edge case: inputd restart closes the socket; native adapter reconnects and resumes consuming events.
- Error path: unknown inputd-side frames are ignored with warnings and do not break later valid input frames.
- Integration: `startSpatialNavigation({ native: { url } })` still registers the adapter and treats native direction as directional input mode.

**Verification:**
- Existing app and Storybook navigation surfaces do not need changes after the daemon replacement.

- [x] **Unit 7: Update documentation and operational notes**

**Goal:** Make the new ownership model discoverable and document what Korri now owns versus what ROCKNIX still provides.

**Requirements:** R1, R6, R7, R8

**Dependencies:** Units 1 through 6

**Files:**
- Modify: `docs/development/odin-iterative-loop.md`

**Approach:**
- Update the Odin loop docs from "native input bridge" to "Korri input daemon" while preserving the renderer WebSocket mental model.
- Document the retained actions: kill-current-game, Korri session toggle, volume, brightness, power/lid, and screen switch.
- Document dropped actions: screenshots, game guide, MangoHud, touchscreen keyboard.
- Document rollback: stop inputd and restore ROCKNIX `input.service`.
- Clarify that `inputplumber.service` remains required.

**Patterns to follow:**
- Existing `docs/development/odin-iterative-loop.md` concise operational style.

**Test scenarios:**
- Test expectation: none -- documentation-only unit. Verify by review that docs name the right daemon, logs, retained actions, dropped actions, and rollback path.

**Verification:**
- A developer can understand the input ownership model without reading `/usr/bin/input_sense` on the device.

## System-Wide Impact

- **Interaction graph:** `korri-inputd` becomes the upstream source for both renderer input and global device actions. Renderer navigation remains downstream of the existing native adapter and input bus. ROCKNIX launch scripts remain upstream only for `/tmp/.process-kill-data`. InputPlumber remains upstream of inputd for controller normalization.
- **Error propagation:** Action failures are logged by inputd and do not propagate to renderer UI navigation. WebSocket decode failures remain local to the renderer adapter and should not crash navigation.
- **State lifecycle risks:** Pressed-button state must clear on device removal, stream restart, daemon restart, and chord release. Kill-game must not reuse stale kill-file contents after launch scripts clear or update the file.
- **API surface parity:** `VITE_KORRI_NATIVE_BRIDGE_URL`, `ODIN_INPUT_BRIDGE_URL`, and the native input wire schema should remain compatible unless a deliberate rename is done with compatibility wrappers.
- **Integration coverage:** Unit tests prove pure chord/action behavior; smoke checks prove the daemon starts on the Odin, sees the virtual controller, and can replace `input.service` safely.
- **Unchanged invariants:** React components stay native HTML. Product code subscribes to semantic actions through `useInputAction`. The web gamepad adapter stays available for laptop/Storybook contexts.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Masking ROCKNIX `input.service` removes a needed power or volume behavior. | Implement retained system actions before masking; stage readiness checks; provide rollback to restore `input.service`. |
| Kill-game chord becomes too easy to trigger accidentally. | Use exact four-button chord matching for destructive actions and one-shot-until-release semantics. |
| The daemon blocks input streaming while running shell actions. | Dispatch actions asynchronously and isolate runner failures from the evdev read loop. |
| InputPlumber virtual device changes event codes across ROCKNIX updates. | Keep device fixtures, named constants, and smoke checks; update chord registry from observed evdev events rather than string matching. |
| `/tmp/.process-kill-data` contains stale or dangerous content. | Treat missing/empty content as no-op; keep behavior scoped to the existing ROCKNIX contract; log kill target before invoking. |
| `screen_switch` has side effects not available outside ROCKNIX. | Shell out for now and document it as a retained ROCKNIX dependency; reimplement later when Korri owns display output. |
| Existing dev scripts or docs still refer to input bridge. | Keep URL/env compatibility while renaming process/log output deliberately in docs and scripts. |
| Device reboots into a state with ROCKNIX input masked but Korri inputd not started. | Treat boot persistence as a hard install prerequisite before persistent masking; keep runtime-only masking or rollback if persistence cannot be proven. |

## Documentation / Operational Notes

- `just install-odin`, `just dev-odin`, and `just check-odin` should describe the service as Korri inputd even if bridge URL names remain compatible.
- Inputd logs should live at a clear `/storage/korri-inputd.log` path or the old bridge log path should point to the new name in script output.
- Rollback must be easy because this replaces power/volume input behavior, not just app navigation.
- This plan intentionally preserves a ROCKNIX dependency boundary: launch scripts provide `/tmp/.process-kill-data`, `screen_switch` handles display output, and InputPlumber normalizes controller devices.

## Sources & References

- Origin document: `docs/brainstorms/2026-05-03-native-input-bridge-requirements.md`
- Prior plan: `docs/plans/2026-05-03-005-feat-native-input-bridge-plan.md`
- Existing bridge: `tools/odin/input-bridge.ts`
- Existing renderer adapter: `korri/shared/input/native-adapter.ts`
- Existing evdev parser: `korri/shared/input/native/parse-evdev.ts`
- Existing device discovery: `korri/shared/input/native/discover-devices.ts`
- Existing Odin toggle installer: `scripts/odin/install-korri-toggle.sh`
- Existing Odin dev loop: `scripts/odin/dev.sh`
- Existing Odin docs: `docs/development/odin-iterative-loop.md`
- Spatial navigation learning: `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`
