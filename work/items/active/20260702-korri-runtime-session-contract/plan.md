---
title: refactor: Unify Korri runtime session contract
type: refactor
status: completed
date: 2026-07-02
deepened: 2026-07-02
verify_command: "nix build .#checks.x86_64-linux.korri-source-machine-module .#checks.x86_64-linux.korri-source-machine-image .#checks.x86_64-linux.korri-sm8550-kiosk-config .#checks.x86_64-linux.korri-rk3566-kiosk-config .#checks.x86_64-linux.korri-rk3326-kiosk-config --no-link"
---

# refactor: Unify Korri runtime session contract

## Summary

Make Korri's source-machine and portable-device runtime posture follow one Linux session model: `XDG_RUNTIME_DIR` is the canonical user runtime root, D-Bus/PipeWire/Pulse are discovered at their standard locations, and Korri-owned IPC/state lives in explicit subdirectories. The implementation aligns x86 source-machine with the Nix-on-Rocks platform adapters that already use `%t`, adds x86 PipeWire defaults in the source-machine composition, and preserves only substrate-required explicit bridge variables.

---

## Problem Frame

Aka's RPCS3 launch exposed a broader runtime-session mismatch: x86 source-machine children inherited `XDG_RUNTIME_DIR=%t/korri-compositor`, so PulseAudio-compatible and native PipeWire clients looked for sockets under a Korri-private directory instead of `/run/user/<uid>`. Nix-on-Rocks platform adapters already mostly use `%t`, but the module graph does not describe a single app-facing contract, which makes audio/display/session exceptions accumulate in individual platform files.

---

## Requirements

- R1. Keep the app-facing runtime contract Linux-idiomatic: `XDG_RUNTIME_DIR` resolves to the canonical logind/user-manager runtime root for normal Korri user services.
- R2. Keep Korri-owned runtime files under explicit subdirectories such as `%t/korri` and `%t/korri-game-stream`; compositor-standard endpoints such as the Wayland socket and stable Sway IPC symlink may live directly under the user runtime root because that is the standard Wayland/session convention.
- R3. Make x86 source-machine audio work without host-level hand-rolled PipeWire/Pulse config for the default case.
- R4. Align x86 source-machine, SM8550, and RK-family Nix-on-Rocks adapters around the same app-facing contract while preserving substrate-specific implementation details.
- R5. Avoid default `PULSE_SERVER` / `PIPEWIRE_RUNTIME_DIR` escape hatches in x86 user-service paths where standard discovery should work naturally.
- R6. Preserve existing source-machine lifecycle invariants: sessiond remains the foreground truth, Sunshine attaches to the managed compositor, and sessiond/daemon/gameStream share one socket path.
- R7. Add Nix evaluation checks that prevent regression to the private source-machine runtime root and verify the expected audio/session defaults.

---

## Scope Boundaries

- This plan targets Korri NixOS modules and image/platform compositions, not emulator plugin launch semantics.
- This plan does not retune device-specific sinks, safe volumes, UCM routing, or hardware audio quirks.
- This plan does not remove all explicit `PULSE_SERVER` uses. Shell-launched browser envs, system-scope services, SM8550's currently validated user-service Pulse environment, root-compositor exceptions, and cross-user boundaries may still need explicit paths until separately validated.
- This plan does not change ROCKNIX host OS deployment mechanics; all changes land in guest NixOS modules/images.
- This plan does not solve dynamic Wayland socket-name discovery for concurrent desktop sessions; source-machine remains an appliance-style posture unless a host overrides it deliberately.

### Deferred to Follow-Up Work

- Harden `korri-sunshine`'s Wayland preflight from socket-file existence to live connection probing after source-machine validation.
- Add dynamic `WAYLAND_DISPLAY` discovery if developer hosts need to run Korri source-machine concurrently with another compositor under the same user.
- Reduce remaining platform-local duplicate path formulas only after the source-machine fix and portable conformance checks are validated.
- Evaluate whether SM8550's user-service `PULSE_SERVER=unix:%t/pulse/native` can be removed after a dedicated device validation pass; preserve it in this slice.

---

## Context & Research

### Relevant Code and Patterns

- `product/systems/nixos/modules/korri-runtime.nix` already defines the runtime identity and defaults Korri-owned sockets to `%t/korri`.
- `product/systems/nixos/modules/korri-compositor.nix` owns `services.korri.compositor.runtimeDir`, `sessionBus.mode`, Sway's stable IPC symlink, and the compositor service environment.
- `product/systems/nixos/images/source-machine.nix` projects `compositorCfg.runtimeDir` into `services.korri.sessiond.extraEnvironment.XDG_RUNTIME_DIR`, which is the direct source of the Aka RPCS3 audio failure.
- `product/systems/nixos/images/kiosk.nix` already handles the sibling-unit D-Bus problem by copying the compositor bus address into sessiond environment when `sessionBus.mode = "existing"`; source-machine needs the same pattern once it uses the existing user bus.
- `product/systems/nixos/modules/korri-game-stream.nix` already resolves `%t` paths against `/run/user/$(id -u)` for sessiond and game-stream runtime files, so the stream runner is structurally ready for canonical `%t`.
- `product/systems/nixos/modules/korri-daemon.nix` builds `korri-sunshine.service` by inheriting compositor environment; source-machine runtime and bus changes therefore affect Sunshine capture/audio discovery too.
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`, `product/systems/nixos/images/platforms/rocknix-rk3566.nix`, and `product/systems/nixos/images/platforms/rocknix-rk3326.nix` already set `services.korri.compositor.runtimeDir = "%t"`, but each encodes platform-local audio/session bridge variables.
- `tools/testing/nix/korri-source-machine-module-check.nix` and `tools/testing/nix/korri-source-machine-image-check.nix` are the primary Nix eval gates for the source-machine exported module and image composition.
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix` and `tools/testing/nix/korri-rocknix-rk3566-config-check.nix` are the existing portable platform config checks; RK3326 needs an equivalent conformance gate if it remains in active scope.

### Institutional Learnings

- `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md` documents that sessiond children must explicitly receive the full graphical/session environment that compositor-spawned children once inherited implicitly.
- `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md` documents that `%t` resolves differently in user vs. system managers and that boot-scoped runtime paths must be explicit, not inferred from user-manager specifiers.
- `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md` establishes sessiond as the single foreground lifecycle truth for both kiosk and source-machine roles.
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md` warns against sniffing argv/env or filesystem state to infer launch policy; platform contract choices should be explicit module policy.
- `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md` reinforces that ROCKNIX product changes belong inside the NixOS guest, not the minimal host layer.

### External References

- XDG Base Directory Specification: `XDG_RUNTIME_DIR` is the user-owned, mode-0700 runtime root for sockets and other ephemeral IPC objects.
- `systemd.unit(5)`: `%t` expands to `/run` for the system manager and `$XDG_RUNTIME_DIR` for user managers.
- `systemd.exec(5)`: user-service `RuntimeDirectory=` creates subdirectories under `$XDG_RUNTIME_DIR` and user services receive `XDG_RUNTIME_DIR` from the user manager.
- `pam_systemd(8)`: creates `/run/user/<uid>` on login and removes it on final logout.
- PipeWire documentation: native clients look under `PIPEWIRE_RUNTIME_DIR` first, then `XDG_RUNTIME_DIR`; `pipewire-pulse` creates the Pulse-compatible socket under `$XDG_RUNTIME_DIR/pulse/native` unless overridden.
- `dbus-run-session(1)`: wraps a process in a new private bus and overwrites `DBUS_SESSION_BUS_ADDRESS`, so it is not the idiomatic source-machine path when peer user services should share the normal user bus.

---

## Key Technical Decisions

- Source-machine should use `services.korri.compositor.runtimeDir = "%t"`: this makes launched games, Sunshine, and sessiond children discover D-Bus/PipeWire/Pulse under the standard user runtime root instead of a Korri-private directory.
- Source-machine should use an existing user bus (`unix:path=%t/bus`) instead of `dbus-run-session`: this aligns x86 with Nix-on-Rocks adapters and avoids isolating Sway from peer user services that need the normal session bus.
- Source-machine sessiond must receive the same existing bus address as the compositor: sessiond-spawned foreground apps are sibling-unit children, not descendants of Sway, so the bus address must be copied into `services.korri.sessiond.extraEnvironment` just like kiosk does.
- Add x86 PipeWire defaults directly to the source-machine composition using `mkDefault`: new x86 source-machine hosts get working audio by default without a shallow one-consumer module, while hosts with deliberate audio topology can override cleanly.
- Keep explicit audio env vars as compatibility escape hatches, not the baseline: x86 user-service paths should rely on standard discovery; system-scope services, shell-launched browser envs, SM8550's current validated user-service Pulse env, and root-compositor exceptions may still need explicit paths.
- Do not globally change the base compositor default yet: `korri-compositor` can keep `%t/korri-compositor` as a standalone/private default, while product role compositions choose the canonical runtime where appropriate.
- Treat RK-family root/system boundaries as named compatibility exceptions: root/system services may need explicit absolute bridge envs to reach sockets in the Korri runtime user's directory until the platform can run more of the session stack as the Korri runtime user.

---

## Open Questions

### Resolved During Planning

- Should the x86 fix be per-service `PULSE_SERVER` / `PIPEWIRE_RUNTIME_DIR` injection or a systemic runtime change? Resolved: use the systemic runtime change; keep `XDG_RUNTIME_DIR` canonical and let clients discover standard sockets naturally.
- Should this align with Nix-on-Rocks devices? Resolved: yes; Nix-on-Rocks adapters already mostly use `%t`, so the plan makes that the cross-platform contract and brings x86 source-machine into line.
- Should `dbus-run-session` remain the default for source-machine? Resolved: no for source-machine posture; the most idiomatic shared-user-session model is the existing user bus at `%t/bus`.
- Should x86 audio defaults be a new public module? Resolved: no for this slice; put them in source-machine with `mkDefault` until there is another current consumer.

### Deferred to Implementation

- Whether any source-machine host needs `pipewire.socketActivation = false` or eager PipeWire services: this depends on live startup behavior after canonical runtime discovery is fixed.
- Whether source-machine should hard-assert `runtimeDir == "%t"` or provide an explicit documented override option: the plan recommends an assertion, but implementation may need an escape hatch if existing consumers intentionally run in private runtime mode.
- Whether RK3326 has a ready product config fixture for a first-class check or needs a small new one: if RK3326 remains touched, it must get a deterministic regression gate.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TD
  login[greetd/logind session] --> runtime[/run/user/uid]
  runtime --> dbus[bus]
  runtime --> pipewire[pipewire-0]
  runtime --> pulse[pulse/native]
  runtime --> korri[korri/]
  runtime --> stream[korri-game-stream/]
  runtime --> wayland[wayland-1]
  runtime --> sway[sway-ipc.sock]

  compositor[korri-compositor.service] --> runtime
  sessiond[korri-sessiond.service] --> runtime
  sunshine[korri-sunshine.service] --> runtime
  game[foreground game/RPCS3] --> runtime

  korri --> sessiondSock[sessiond.sock]
  stream --> intent[next-launch.json]
  stream --> status[status.json]
```

The contract is simple: all normal user-session services share the user runtime root; Korri names only its own subdirectories. Platform-specific substrate details decide how `bus`, `pipewire-0`, and `pulse/native` are provided, but launched apps see one consistent environment. Wayland and Sway IPC endpoints are an intentional root-level runtime exception because they are compositor/session endpoints, not Korri-owned state.

---

## Implementation Units

### U1. Codify the runtime-session contract in existing module docs and checks

**Goal:** Establish the shared contract as enforceable module behavior and documentation without introducing a broad new string-alias abstraction.

**Requirements:** R1, R2, R4, R5

**Dependencies:** None

**Files:**
- Modify: `product/systems/nixos/modules/korri-runtime.nix`
- Modify: `product/systems/nixos/modules/korri-compositor.nix`
- Modify: `product/systems/nixos/modules/korri-game-stream.nix`
- Test: `tools/testing/nix/korri-source-machine-module-check.nix`
- Test: `tools/testing/nix/korri-source-machine-image-check.nix`

**Approach:**
- Use existing options and comments to name the contract: `%t` is the canonical user runtime root for product role compositions; Korri-owned IPC/state belongs under `%t/korri` and `%t/korri-game-stream`.
- Prefer assertions and role checks over a new shared module that only aliases strings already owned by runtime/sessiond/gameStream.
- Clarify that the base compositor default can remain private, but source-machine and portable-product adapters should choose canonical `%t` where standard D-Bus/audio discovery is part of the role.
- Update stale source-machine comments that describe private runtime inheritance as intentional.

**Patterns to follow:**
- Existing `services.korri.runtime.socketDir` option in `product/systems/nixos/modules/korri-runtime.nix`.
- Existing source-machine Nix eval checks that assert role-level invariants.
- Existing explanatory comments in `product/systems/nixos/images/source-machine.nix` and platform adapters.

**Test scenarios:**
- Happy path: source-machine module/image checks prove the role's runtime contract without requiring a new standalone runtime module.
- Edge case: the base compositor module can still evaluate with its private runtime default outside source-machine.
- Error path: source-machine private-runtime regression is caught by a source-machine-specific assertion/check.

**Verification:**
- The contract is visible in the module comments/options and backed by source-machine checks.

---

### U2. Move x86 source-machine to canonical runtime and user bus

**Goal:** Make the source-machine role use the standard user runtime root and normal user D-Bus bus so RPCS3, Sunshine, and other foreground children discover session IPC naturally.

**Requirements:** R1, R2, R5, R6, R7

**Dependencies:** U1 helpful but not strictly required if implemented incrementally

**Files:**
- Modify: `product/systems/nixos/images/source-machine.nix`
- Modify: `product/systems/nixos/modules/korri-game-stream.nix`
- Modify: `product/systems/nixos/modules/korri-daemon.nix`
- Test: `tools/testing/nix/korri-source-machine-module-check.nix`
- Test: `tools/testing/nix/korri-source-machine-image-check.nix`

**Approach:**
- In the source-machine composition, default `services.korri.compositor.runtimeDir` to `%t`.
- In the source-machine composition, default `services.korri.compositor.sessionBus.mode` to `existing` and `sessionBus.address` to `unix:path=%t/bus`.
- Copy the compositor session bus address into `services.korri.sessiond.extraEnvironment.DBUS_SESSION_BUS_ADDRESS` when source-machine uses the existing bus, following the sibling-unit pattern from kiosk.
- Add an assertion or equivalent Nix check that prevents silent fallback to `%t/korri-compositor` in the default source-machine path.
- Preserve the existing three-way sessiond/daemon/gameStream socket invariant under `%t/korri/sessiond.sock`.

**Patterns to follow:**
- ROCKNIX platform adapter use of `runtimeDir = "%t"` and `sessionBus.mode = "existing"` in `product/systems/nixos/images/platforms/rocknix-sm8550.nix` and RK-family adapters.
- D-Bus env copy pattern in `product/systems/nixos/images/kiosk.nix`.
- Existing source-machine socket-drift assertion in `product/systems/nixos/images/source-machine.nix`.
- Existing `%t` wrapper checks in `tools/testing/nix/korri-source-machine-module-check.nix`.

**Test scenarios:**
- Happy path: source-machine module eval produces `services.korri.compositor.runtimeDir == "%t"`.
- Happy path: source-machine compositor and sessiond environments include `DBUS_SESSION_BUS_ADDRESS == "unix:path=%t/bus"`.
- Happy path: source-machine sessiond environment uses `XDG_RUNTIME_DIR == "%t"`, `SWAYSOCK == "%t/sway-ipc.sock"`, and the canonical sessiond socket path remains `%t/korri/sessiond.sock`.
- Happy path: `korri-sunshine.service` inherits canonical runtime and stable Wayland display attachment values.
- Edge case: forcing socket drift between daemon, sessiond, and gameStream still fails the existing assertion.
- Error path: forcing a private source-machine compositor runtime either fails evaluation with a clear message or requires an explicit documented override path that also owns audio/session bridging.

**Verification:**
- Source-machine checks prove the canonical runtime and user-bus contract in CI.
- Aka live validation can show a Korri-launched RPCS3 process with `XDG_RUNTIME_DIR=/run/user/1000`, `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus`, and no launch-time PipeWire/Pulse connection failure.

---

### U3. Add x86 source-machine PipeWire defaults in the source-machine composition

**Goal:** Make x86 source-machine imports provide the standard PipeWire/PipeWire-Pulse/WirePlumber stack by default so new hosts do not need Mountainous-style hand wiring.

**Requirements:** R3, R5, R7

**Dependencies:** U2

**Files:**
- Modify: `product/systems/nixos/images/source-machine.nix`
- Test: `tools/testing/nix/korri-source-machine-module-check.nix`
- Test: `tools/testing/nix/korri-source-machine-image-check.nix`

**Approach:**
- Add x86-guarded `mkDefault` values in source-machine composition for standalone PulseAudio disabled, PipeWire enabled, ALSA including 32-bit support, Pulse compatibility, JACK compatibility, WirePlumber, and RTKit.
- Gate behavior on `pkgs.stdenv.hostPlatform.isx86_64`; portable devices should not inherit NixOS desktop PipeWire defaults that conflict with their substrate.
- Do not set `PULSE_SERVER` or `PIPEWIRE_RUNTIME_DIR` for normal x86 user-service consumers; the source-machine role should provide sockets at the standard runtime locations.
- Keep host override semantics simple: downstream hosts can override the defaults without `mkForce`.

**Patterns to follow:**
- Mountainous Aka host config pattern for `services.pipewire.*`, but moved into Korri source-machine with `mkDefault`.
- NixOS PipeWire module conventions: use `services.pipewire.*` and `security.rtkit`, not direct config-file writes.
- `product/systems/nixos/modules/korri-rocknix-audio-bootstrap.nix` as a readiness/route precedent, not as a direct x86 topology copy.

**Test scenarios:**
- Happy path: x86 source-machine eval enables PipeWire, PipeWire-Pulse, ALSA, 32-bit ALSA support, JACK compatibility, WirePlumber, disables standalone PulseAudio, and enables RTKit by default.
- Edge case: a host override can disable or replace a specific audio default without `mkForce`.
- Error path: non-x86 eval does not enable x86 audio defaults or conflict with ROCKNIX platform adapters.

**Verification:**
- Existing source-machine Nix checks prove source-machine brings x86 audio defaults without requiring host config.
- Aka live validation shows both `/run/user/1000/pipewire-0` and `/run/user/1000/pulse/native` reachable from the Korri user session.

---

### U4. Assert and document Nix-on-Rocks portable conformance

**Goal:** Keep portable-device adapters aligned with the same app-facing contract without broad refactors of already-working platform code.

**Requirements:** R1, R2, R4, R5

**Dependencies:** U1

**Files:**
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix` only if comments or direct references need contract wording
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3566.nix` only if comments or direct references need contract wording
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3326.nix` only if comments or direct references need contract wording
- Test: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Test: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`
- Test: Create `tools/testing/nix/korri-rocknix-rk3326-config-check.nix` and wire it into `product/systems/nixos/flake/checks.nix` if RK3326 stays in active scope

**Approach:**
- Assert, rather than broadly rewrite, the fact that SM8550 and RK-family adapters already use `%t` for compositor/session identity.
- Preserve SM8550's current `PULSE_SERVER=unix:%t/pulse/native` user-service environment as a validated ROCKNIX compatibility boundary in this slice.
- Preserve RK-family explicit absolute bridge envs where root/system services must reach sockets in the Korri runtime user's directory.
- Add contract-aligned assertions to existing platform checks: runtimeDir `%t`, existing bus address where applicable, required explicit bridge values preserved, and x86 audio defaults absent.
- Add a deterministic RK3326/R36T Max config check if the implementation touches RK3326; otherwise leave RK3326 code unchanged and move its dedicated check to follow-up.

**Patterns to follow:**
- SM8550's use of substrate audio facts and `korri-rocknix-audio-bootstrap` actions in `product/systems/nixos/images/platforms/rocknix-sm8550.nix`.
- RK3566's `rocknix.session.runtimeDir.uid = runtime.uid` and user PipeWire disablement in `product/systems/nixos/images/platforms/rocknix-rk3566.nix`.
- Literal-scan style in `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`, which already guards against hard-coding substrate capability values.

**Test scenarios:**
- Happy path: SM8550 platform config still uses `%t` runtime, existing bus, product-owned user PipeWire graph, and preserved explicit Pulse env where currently validated.
- Happy path: RK-family config still uses `%t` for compositor/session identity while keeping explicit audio bridge values only where root/system-scope services require them.
- Edge case: portable platform adapters do not import or enable x86 source-machine audio defaults.
- Error path: removing a required runtime-dir UID bridge or platform audio bootstrap causes platform checks to fail with a contract-specific message rather than a generic missing literal.

**Verification:**
- Existing SM8550/RK3566 checks continue to pass with contract-aligned assertions.
- RK3326 either has a first-class config check or is explicitly left untouched in this slice.
- No portable-device behavior changes unintentionally remove required explicit audio paths for shell/system/root contexts.

---

### U5. Update runtime-session documentation and operator guidance

**Goal:** Make the new contract discoverable so future plugin/platform work does not reintroduce private runtime roots or per-service audio variables by default.

**Requirements:** R1, R2, R4, R5

**Dependencies:** U1, U2, U3, U4

**Files:**
- Modify: `product/systems/nixos/modules/korri-runtime.nix`
- Modify: `product/systems/nixos/modules/korri-compositor.nix`
- Modify: `product/systems/nixos/modules/korri-daemon.nix`
- Modify: `product/systems/nixos/modules/korri-game-stream.nix`
- Modify: `product/systems/nixos/images/source-machine.nix`
- Modify: `product/systems/nixos/images/kiosk.nix` if shared commentary needs alignment
- Modify: `work/items/active/20260702-rpcs3-aka-source-plugin/x86-pipewire-audio-proposal.md` or create a new architecture note only if the repo has an established durable-doc location for module contracts

**Approach:**
- Update option descriptions and comments to state the contract: user services should inherit canonical `XDG_RUNTIME_DIR`; Korri owns subdirectories; explicit audio env vars are escape hatches for non-user-service contexts.
- Make source-machine's appliance assumption explicit: the Korri runtime user should not run a second compositor unless the host provides explicit overrides.
- Document the remaining root/system-scope exceptions so they are understood as compatibility boundaries, not competing runtime models.
- Keep documentation close to the modules unless there is already a durable architecture-doc convention for Korri module contracts.

**Patterns to follow:**
- Existing explanatory comments in `product/systems/nixos/images/source-machine.nix` and platform adapters.
- Institutional learning style from `docs/solutions/architecture-patterns/*` if a new durable note is warranted after implementation.

**Test scenarios:**
- Test expectation: none -- documentation/comment updates only, with correctness indirectly enforced by module checks from U2-U4.

**Verification:**
- A reader of source-machine and platform modules can identify the single app-facing runtime contract and the specific contexts that still require explicit env bridging.

---

### U6. Add live validation checklist for Aka and portable smoke gates

**Goal:** Give implementation a concrete post-deploy validation surface for the original Aka audio failure and for portable-device contract preservation.

**Requirements:** R3, R4, R6, R7

**Dependencies:** U2, U3, U4

**Files:**
- Modify: `work/items/active/20260702-rpcs3-aka-source-plugin/work.md` if continuing the current RPCS3 validation thread
- Create or Modify: `work/items/active/20260702-korri-runtime-session-contract/validation.md` if validation notes should live with this work item
- Modify: existing device smoke-check documentation only if there is an established checked-in path for it

**Approach:**
- Capture Aka validation outcomes without encoding shell choreography in module docs: service environments, running RPCS3 process environment, D-Bus round-trip, PipeWire/Pulse reachability, Sunshine audio logs, and Skate 3 launch past the prior Cubeb failure.
- Include portable checks that confirm SM8550 and RK-family eval outputs still present `%t` runtime identity and required substrate-specific bridge values.
- Separate live validation evidence from Nix eval assertions: CI proves module shape; device validation proves systemd/logind/PipeWire runtime behavior.

**Patterns to follow:**
- Existing work item progress notes in `work/items/active/20260702-rpcs3-aka-source-plugin/work.md`.
- ROCKNIX artifact/device verification style from existing operational tooling, while keeping destructive writes out of validation.

**Test scenarios:**
- Happy path: Aka Korri-launched RPCS3 process has canonical `XDG_RUNTIME_DIR`, canonical `DBUS_SESSION_BUS_ADDRESS`, and no PipeWire/Pulse connection failure in fresh logs.
- Happy path: Sunshine no longer reports PulseAudio access/connection failure during a Moonlight stream.
- Integration: launching Skate 3 through Korri reaches the post-preload/game phase with audio discovery intact.
- Integration: SM8550/RK config checks still pass after shared contract assertions.
- Error path: if a host forces private source-machine runtime, the validation checklist points at explicit audio/session bridge requirements instead of silently accepting the regression.

**Verification:**
- Aka is idle after validation with no lingering test game process.
- The plan's Nix checks and live validation notes together demonstrate the original audio failure is fixed by the contract, not by RPCS3-specific tuning.

---

## System-Wide Impact

- **Interaction graph:** The change affects compositor, sessiond, Sunshine, game-stream wrapper, PipeWire/Pulse discovery, D-Bus discovery, and platform image adapter checks. It should not change plugin materializers or app-library records.
- **Error propagation:** Nix assertions should catch incompatible source-machine runtime overrides before deployment; live audio failures should become ordinary missing PipeWire/socket issues instead of hidden private-runtime lookup failures.
- **State lifecycle risks:** Moving source-machine sockets from `%t/korri-compositor` to `%t` means stale Wayland/Sway socket files are no longer removed by the compositor service's `RuntimeDirectory` cleanup; Sway normally handles this, but crash recovery should be watched.
- **API surface parity:** Source-machine and kiosk/platform modules should describe the same runtime-session contract even when platform implementations differ underneath.
- **Integration coverage:** Nix eval checks prove configuration shape; Aka and portable device validation prove systemd/logind/PipeWire runtime behavior.
- **Unchanged invariants:** sessiond remains the foreground lifecycle source of truth, `korri-session.target` remains the user-session anchor, and `services.korri.rpcs3` remains opt-in under source-machine.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| A source-machine user also runs another compositor and Sway chooses a different `WAYLAND_DISPLAY` | Document source-machine as appliance-style by default; keep explicit host override path; defer dynamic display discovery to follow-up. |
| Sessiond children miss the existing user bus even after the compositor uses it | Copy `DBUS_SESSION_BUS_ADDRESS` into source-machine sessiond env and assert it in source-machine checks. |
| RK-family root/system services cannot become fully implicit immediately | Treat them as compatibility exceptions and keep explicit absolute bridge envs where a root/system service must reach sockets in the Korri runtime user's directory. |
| PipeWire socket activation is not ready early enough on some x86 hosts | Start with NixOS defaults; add a readiness gate only if live validation proves a race after canonical runtime discovery is fixed. |
| Overly strict runtime assertion blocks legitimate downstream private-runtime use | Provide a clearly named override/escape hatch if implementation uncovers an existing supported consumer; otherwise prefer fail-fast source-machine contract enforcement. |
| Documentation drift leaves old comments recommending private source-machine runtime | Update comments/options alongside checks so future agents follow the new contract. |
| RK3326 is touched without a matching regression gate | Either add a first-class RK3326 config check or leave RK3326 code unchanged in this slice. |

---

## Documentation / Operational Notes

- Aka live validation should explicitly inspect `korri-sessiond`, `korri-sunshine`, and a launched RPCS3 process environment to confirm the contract reaches actual children.
- Portable-device validation should remain guest-side; do not attempt to apply these NixOS module changes to the minimal ROCKNIX host OS.
- If a future host intentionally uses system-scope services to reach a user audio graph, it must use explicit absolute runtime/audio paths because `%t` is `/run` in the system manager.

---

## Sources & References

- Active proposal: `work/items/active/20260702-rpcs3-aka-source-plugin/x86-pipewire-audio-proposal.md`
- Related work: `work/items/active/20260702-rpcs3-aka-source-plugin/work.md`
- Related modules: `product/systems/nixos/modules/korri-runtime.nix`, `product/systems/nixos/modules/korri-compositor.nix`, `product/systems/nixos/modules/korri-daemon.nix`, `product/systems/nixos/modules/korri-game-stream.nix`, `product/systems/nixos/images/source-machine.nix`, `product/systems/nixos/images/kiosk.nix`
- Related platform adapters: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`, `product/systems/nixos/images/platforms/rocknix-rk3566.nix`, `product/systems/nixos/images/platforms/rocknix-rk3326.nix`
- Related checks: `tools/testing/nix/korri-source-machine-module-check.nix`, `tools/testing/nix/korri-source-machine-image-check.nix`, `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`, `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`
- Institutional learnings: `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md`, `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`, `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`, `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`, `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md`
- External docs: XDG Base Directory Specification, `systemd.unit(5)`, `systemd.exec(5)`, `pam_systemd(8)`, PipeWire `pipewire(1)` / `pipewire-pulse(1)`, `dbus-run-session(1)`
