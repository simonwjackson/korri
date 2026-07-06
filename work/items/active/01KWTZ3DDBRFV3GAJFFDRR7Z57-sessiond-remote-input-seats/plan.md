---
title: "feat: Add sessiond remote input-seat service"
type: feat
status: active
date: 2026-07-06
deepened: 2026-07-06
origin: work/items/active/01KWTZ3DDBRFV3GAJFFDRR7Z57-sessiond-remote-input-seats/item.md
verify_command: "just typecheck && just test-unit && just lint"
---

# feat: Add sessiond remote input-seat service

## Summary

Build a generic sessiond-owned input-seat capability for remote emulator launches. Remote launches will pre-create emulator-visible Korri controller seats before spawning the game, expose seat state through the existing managed-launch status/event surfaces, and route Sunshine/Moonlight input through an adapter into those stable seats.

---

## Problem Frame

Remote emulator launches currently depend on stream-client timing: Sunshine creates its virtual controller lazily after client input arrives, while boot-scan emulators such as RPCS3 can scan input before that device exists. Skate 3/RPCS3 proved the failure mode: the stream starts, but the controller is invisible until a restart or manual workaround (see origin: `work/items/active/01KWTZ3DDBRFV3GAJFFDRR7Z57-sessiond-remote-input-seats/item.md`).

The fix should not be RPCS3-specific. Controller readiness should become a foreground-session precondition owned by sessiond, with emulator plugins consuming stable seat identities instead of source-specific Sunshine device names.

---

## Requirements

- R1. sessiond exposes a generic input-seat service that allocates emulator-visible seats for a managed game session before the emulator process is spawned.
- R2. Remote launches for runtimes that declare safe extra-seat support default to a full P1-P4 seat pool, while releases and release profiles can opt down through the normal config cascade. Unknown or unvalidated runtimes do not silently inherit P1-P4.
- R3. If required seats cannot be created, verified, or uniquely identified, the managed launch fails during sessiond pre-spawn readiness before emulator spawn with a clear input-related failure.
- R4. Seat state is observable through managed-launch status, lifecycle events, and structured logs, including available, occupied-connected, occupied-disconnected-reserved, and released cases.
- R5. Remote input is modeled behind an adapter boundary: Sunshine/Moonlight is the first source adapter, while a Korri-native remote input protocol remains possible later.
- R6. Disconnect and intentional leave are distinct: disconnect reserves the source's seat for reconnect; explicit leave releases that seat for another player/source.
- R7. Verification proves the generic contract with unit/integration tests, then validates hardware behavior with Skate 3/RPCS3 and one second emulator or runtime.
- R8. The Sunshine-side event mirror must publish bounded, launch-scoped, gamepad-only frames into a stable local socket contract before the TypeScript adapter writes them into Korri-owned seats.
- R9. Production sessiond composition must construct a real writable input-seat runtime and mirror socket from `KORRI_INPUT_SEAT_RUNTIME_DIR`; the unavailable runtime is acceptable only when input-seat support is not configured.
- R10. Per-launch Sunshine mirror activation must work with a long-running Sunshine service; no design may rely on injecting launch-specific environment variables into the emulator child or into an already-running Sunshine process.
- R11. End-to-end validation must prove that a deployed launch actually opts into `@korri:input-seat`; a missing companion must be treated as a validation blocker, not a successful input-seat test.
- R12. AKA/source-host deployments must enable the production input-seat runtime, backend helper, runtime directory, and uinput permissions in the source-machine NixOS profile; Bandai/client-side deployment alone is not sufficient to fix emulator boot-scan races.

---

## Scope Boundaries

- This plan does not build user-facing UI for seat status, seat reservation, or leave-seat controls. It exposes the API/status/events first.
- This plan does not decide whether local physical controllers should always route through Korri virtual seats. That question remains parked in `work/items/parking-lot/01KWTW9DBY5NN34BVN7CMXQ8W3-explore-unified-local-and-remote-controller-routing-through-.md`.
- This plan does not build the Korri-native remote input protocol; it leaves a source-adapter seam for it.
- This plan does not require Bandai/client-side changes for the production uinput backend. The real device creation and RPCS3/Skate validation happen on the AKA/source host that runs sessiond, Sunshine, and the emulator.
- This plan does not solve every emulator's input mapping vocabulary. It integrates RPCS3 as the first consumer and validates one additional runtime to prove the seat lifecycle is not RPCS3-only.
- This plan does not rely on sleep delays, synthetic "wiggle" input, or restarting the emulator after stream connection.
- This plan does not defend against malicious code already running as the same trusted appliance Unix user as sessiond/Sunshine. The socket, sidecar, and token controls prevent cross-user, stale-launch, accidental, and public-surface injection/exposure; same-UID compromise remains an appliance trust-boundary concern.

### Deferred to Follow-Up Work

- Build UI/overlay/client affordances for "leave seat", stale-seat operator actions, and seat status.
- Explore unified local and remote controller routing through Korri virtual seats (`01KWTW9DBY5NN34BVN7CMXQ8W3`).
- Design and implement a Korri-native remote input protocol to replace or supplement the Sunshine/Moonlight source adapter.
- Extend neutral `preferences.input` vocabulary after the stable device-identity contract is proven.
- Add reservation timeouts and richer user/participant identity once the first source-session identity contract is proven.

---

## Context & Research

### Relevant Code and Patterns

- `product/services/device/sessiond.ts` owns managed-launch lifecycle, status, SSE events, role handoff, lifecycle hook cleanup, and terminal restore behavior.
- `product/services/device/sessiond-role.ts` already has a role-level `beforeChildLaunch` phase, but plugin lifecycle hooks currently only support `afterChildRunning` and `cleanup` in `product/platform/plugin/session-lifecycle.ts`.
- `product/platform/library/sessiond-managed-launch-protocol.ts` documents additive-only managed-launch protocol evolution and capability flags.
- `product/plugins/cdp-input-bridge/src/session-lifecycle-hook.ts` is the closest hook precedent for input-adjacent session resources, configurable process management, and fail-launch behavior.
- `product/platform/input/native/inputplumber-virtual-gamepad.ts` and `product/platform/input/native/discover-devices.ts` are the existing `/proc/bus/input/devices` discovery and stable virtual-controller resolution patterns.
- `product/plugins/remap/packages/korri-remap-bridge/native-driver.py` is the closest production precedent for opening `/dev/uinput`, issuing `UI_SET_*`/`UI_DEV_CREATE` ioctls, writing input-event structs, and destroying devices from a packaged Python helper.
- `product/platform/library/config/inheritable-fields.ts` and `product/platform/library/config/cascade-resolver.ts` define the cascade fields and `launch.with` provider map used for launch companion policy.
- `product/apps/portal/api/stream/prepare.rpc-handler.ts` writes remote-source launch intents with resolved `LaunchSpec`, `launchCompanions`, `launchMetadata`, and artifacts; this is how remote prepared launches carry seat policy to the source machine.
- `product/services/device/game-stream-runner.ts` forwards prepared launch companions and metadata into sessiond-managed launches.
- `product/systems/nixos/modules/korri-input.nix` already owns `uinput` kernel module, udev rule, group, and service-user membership wiring; `product/systems/nixos/images/source-machine.nix` must opt the AKA/source-machine profile into that module for hardware validation.
- `product/plugins/rpcs3/src/input-policy.ts`, `product/plugins/rpcs3/src/input-mapping.ts`, `product/plugins/rpcs3/src/input-config-render.ts`, and `product/plugins/rpcs3/src/materializer.ts` provide the RPCS3 input profile authoring surface that must consume stable Korri seat names.
- `product/platform/input-seat/sunshine-input-seat-mirror-socket.ts` defines the local bounded NDJSON socket contract that the native Sunshine packet mirror must publish into.
- `work/items/active/01KWM7Q408P6VW6RWR66SE6R3R-rpcs3-input-config-authoring/convergence-note.md` defines the boundary between emulator profile authoring and runtime controller ownership.

### Institutional Learnings

- `docs/handoffs/bandai-inputplumber-xb360-controller-normalization-2026-06-09.md`: virtual controller identity is a product contract; normalize at the input layer rather than patching every consumer.
- `docs/solutions/integration-issues/steam-uinput-permissions-block-virtual-xinput-2026-06-13.md`: `/dev/uinput` permissions must be correct before non-root services create or consume virtual devices.
- `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`: sessiond is the operator model and `beforeChildLaunch` is the right lifecycle slot for pre-spawn readiness gates.
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`: runtime behavior should come from explicit cascade policy, not argv/env/device-name heuristics.
- `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md`: lifecycle events must ride the existing heartbeat-protected managed-launch SSE stream rather than a new fragile side channel.
- `docs/solutions/runtime-errors/steam-manual-launch-x86-eager-xwayland-dbus-readiness-2026-05-26.md`: readiness must be a domain signal, not process existence or a fixed delay.
- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`: sessiond should remain the single lifecycle truth; input-seat state should not create a parallel authority.

### External References

- Linux uinput kernel docs: `https://www.kernel.org/doc/html/latest/input/uinput.html` — virtual input device lifecycle and readiness constraints.
- libevdev docs: `https://www.freedesktop.org/software/libevdev/doc/latest/` — safer uinput creation and device-node discovery helpers.
- Sunshine source and `60-sunshine.rules`: Sunshine creates Linux virtual pads lazily from controller-arrival/input packets and grants `/dev/uinput` / virtual-pad access through udev rules.
- InputPlumber docs/source: InputPlumber eagerly creates target devices and exposes stable virtual Xbox target metadata through `/proc/bus/input/devices`.

---

## Key Technical Decisions

| Decision | Rationale |
|---|---|
| sessiond owns input-seat lifecycle | Seat readiness is part of foreground-session correctness; sessiond already owns launch, termination, restore, status, and event emission. |
| Device mechanics sit behind ports/adapters | sessiond should not become a raw input daemon. uinput/InputPlumber/Sunshine-specific work stays behind small injected runtime interfaces. |
| Korri creates emulator-visible uinput seats | Sunshine's Linux virtual pads are lazy and cannot be relied on before emulator boot. The first Sunshine/Moonlight adapter supplies remote input events, not the emulator-visible device lifecycle. |
| Full P1-P4 pool is the default | Boot-scan emulators and drop-in players need the seats present up front. Releases and release profiles can opt down for games that misbehave with extra pads. |
| Seat policy rides the existing cascade through `launch.with` | `launch.with` already carries provider-keyed launch companion policy through launcher, release, profile, and override layers into sessiond. It avoids inventing a new top-level config field for the first slice. |
| Stable seat identity is policy, not runtime accident | Emulator plugins should write predictable Korri seat names into their configs before launch; sessiond allocation verifies matching devices rather than discovering arbitrary Sunshine names after the fact. |
| Use existing input failure kinds initially | Clear messages and seat events can explain seat failures while reusing `input-unavailable` and `input-ambiguous`, avoiding unnecessary managed-launch wire-literal churn in the first slice. |
| Seat events use managed-launch status/SSE | Existing clients already understand launch-scoped status/events and heartbeat behavior; a separate input-seat events channel would create a second lifecycle truth. |
| Sunshine publishes to a bounded local NDJSON socket | The TypeScript side owns strict decode, launch filtering, rate limiting, and seat state; the native Sunshine patch only needs to mirror sanitized controller packet frames into a known local contract. |
| Production composition is env-driven | `KORRI_INPUT_SEAT_RUNTIME_DIR` is the deployment boundary: when present, sessiond builds the real uinput runtime and mirror socket; when absent, the unavailable runtime fails closed for input-seat launches without affecting launches that do not request the companion. |
| Production uinput backend uses a Python helper | Follow `product/plugins/remap/packages/korri-remap-bridge/native-driver.py`: TypeScript supervises a packaged helper and owns the `UinputSeatBackend` contract, while Python performs raw `/dev/uinput` ioctls, input-event writes, and descriptor cleanup. This avoids inventing Bun FFI ioctl code in sessiond and reuses a proven repo pattern. |
| AKA/source-machine profile must opt into input-seat support | The bug is on the source host where RPCS3 scans input. `product/systems/nixos/images/source-machine.nix` must enable `services.korri.input.inputSeat` and include the helper/runtime-dir wiring; deploying only Bandai/client changes cannot create emulator-visible seats on AKA. |
| Long-running Sunshine uses a stable socket plus launch-id sidecar | Sunshine cannot receive per-launch env after service start. Give Sunshine a stable mirror socket path through its systemd environment and deliver the active launch id/generation plus mirror token through a sessiond-owned sidecar that Sunshine re-reads. The sidecar must not contain arbitrary socket paths. |
| Mirror socket authorization uses a per-launch token within the trusted appliance user boundary | The socket stays under a private runtime dir, and sessiond writes an unguessable mirror token into the active-launch sidecar for Sunshine to echo in frames. The TypeScript socket rejects frames without the active token; the token never appears in public status, SSE, logs, or committed acceptance artifacts. This protects against other local users, stale launches, and accidental exposure, while explicitly trusting same-UID appliance code. |
| Launch opt-in stays explicit | `@korri:input-seat` must be present in the resolved launch companions for the gate to activate. RPCS3/Skate validation must author or verify that companion rather than inferring input-seat behavior from emulator identity. |

---

## Open Questions

### Resolved During Planning

- Should this be RPCS3-specific? **No.** The plan builds a generic sessiond input-seat service and uses RPCS3/Skate 3 as the first hardware proof.
- Should Sunshine own emulator-visible virtual pads? **No for the first slice.** Sunshine pads are lazy; Korri creates stable uinput seats and uses Sunshine/Moonlight as a remote input source adapter.
- Should local physical controllers be routed through the same virtual-seat layer now? **No.** That is deferred to `01KWTW9DBY5NN34BVN7CMXQ8W3`.
- Should late-created seats be acceptable? **No.** Required seats must be verified before emulator spawn.
- What is the concrete Sunshine/Moonlight event extraction path? **Sunshine-side packet mirror.** Sunshine should mirror sanitized controller-domain packets to the sessiond/input-seat socket contract; Korri-created seats remain emulator-visible owners.
- Should extra seats be opt-in or opt-out? **Opt-out for validated runtimes.** Full P1-P4 pool is the default for remote-capable runtimes that declare safe extra-seat support; releases and profiles can reduce it. Unknown runtimes must explicitly opt in or stay at a conservative minimum.
- What is the exact production uinput mechanism? **Python subprocess helper following the remap bridge pattern.** The helper owns `/dev/uinput` descriptors and device lifecycle; the TypeScript backend wrapper supervises it and implements the existing `UinputSeatBackend` contract. This keeps raw ioctl/device-event mechanics out of sessiond while reusing the repo's proven uinput approach.
- Where does the first `@korri:input-seat` opt-in live? **Code-owned RPCS3 Nix platform default when `services.korri.input.inputSeat.enable = true`.** Release/profile opt-down continues to use cascade policy.

### Deferred to Implementation

- Exact native Sunshine packet-field mapping: validate the downstream patch against Sunshine's current controller packet structs during implementation and keep the TypeScript socket schema stable unless the native API forces a documented adjustment.
- Exact helper command framing: choose line-oriented JSON vs NDJSON command framing inside the Python helper IPC while preserving the plan's wrapper/helper boundary, validation requirements, and cleanup semantics.
- Exact second emulator/runtime for hardware proof: choose a runtime already launchable on the target hardware and representative of a different input path than RPCS3.

---

## Output Structure

Expected new/expanded layout; implementation may adjust names if the same boundaries are preserved.

```text
product/platform/input-seat/
  policy.ts
  seat-state.ts
  seat-runtime-port.ts
  remote-input-source.ts
  sunshine-remote-input-source.ts
  sunshine-input-seat-mirror-socket.ts
  uinput-seat-backend.ts
  uinput-seat-backend-helper.py
  device-identity.ts
product/services/device/
  sessiond-input-seat.ts
product/plugins/rpcs3/src/
  input-seat-policy.ts
```

The implementation-unit file lists below are authoritative; this structure sketch highlights the new platform/service modules rather than every touched protocol, NixOS, Moonlight, and test file.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
sequenceDiagram
    participant Client as Remote launch client
    participant Prepare as Source prepare RPC
    participant Library as Library/cascade resolver
    participant Sessiond as sessiond
    participant Seats as Input-seat service
    participant Adapter as Sunshine/Moonlight source adapter
    participant Emulator as Emulator/RPCS3

    Client->>Prepare: prepare remote launch
    Prepare->>Library: resolve launch + launch.with policy
    Library-->>Prepare: LaunchSpec + companions + metadata
    Prepare->>Sessiond: managed launch intent
    Sessiond->>Seats: allocate seats before child spawn
    Seats-->>Sessiond: stable seat identities + ready evidence
    Sessiond->>Emulator: spawn only after required seats are ready
    Adapter->>Seats: bind/forward remote input as clients connect
    Seats-->>Sessiond: seat status events
    Sessiond-->>Client: managed-launch status/events
```

Seat state is explicit and session-scoped:

```mermaid
stateDiagram-v2
    [*] --> Available
    Available --> OccupiedConnected: bind source
    OccupiedConnected --> OccupiedDisconnectedReserved: disconnect
    OccupiedDisconnectedReserved --> OccupiedConnected: reconnect same source identity
    OccupiedConnected --> Available: explicit leave emits seat-left/seat-released
    OccupiedDisconnectedReserved --> Available: explicit leave emits seat-left/seat-released
    Available --> [*]: session cleanup
```

`Released` is an event, not a durable assignable state: explicit leave emits `seat-left`/`seat-released` and returns the durable seat state to `Available` for same-session reassignment. For the first slice, `OccupiedDisconnectedReserved` has no timeout; a disconnected source identity's seat is reserved until explicit leave or terminal session cleanup. Reservation timeouts are deferred follow-up work.

---

## Implementation Units

```mermaid
flowchart TB
    U0[U0 event-source proof] --> U4[U4 sessiond service]
    U0 --> U7[U7 Sunshine adapter]
    U1[U1 policy and identity] --> U2[U2 pre-spawn gate]
    U1 --> U3[U3 runtime/source ports]
    U1 --> U5[U5 cascade policy]
    U1 --> U4
    U2 --> U4
    U3 --> U4
    U3 --> U7
    U3 --> U9[U9 Nix device access]
    U4 --> U9
    U1 --> U6[U6 RPCS3 identities]
    U5 --> U6
    U4 --> U7
    U1 --> U8[U8 status and leave]
    U4 --> U8
    U7 --> U11[U11 mirror socket]
    U0 --> U12[U12 Sunshine patch]
    U11 --> U12
    U3 --> U13[U13 production uinput backend]
    U9 --> U13
    U4 --> U15[U15 source-host production wiring]
    U9 --> U15
    U11 --> U15
    U12 --> U15
    U13 --> U15
    U12 --> U16[U16 sidecar delivery]
    U15 --> U16
    U4 --> U14[U14 live writer bridge]
    U7 --> U14
    U11 --> U14
    U12 --> U14
    U13 --> U14
    U16 --> U14
    U6 --> U17[U17 RPCS3 opt-in]
    U4 --> U10[U10 AKA hardware proof]
    U6 --> U10
    U8 --> U10
    U9 --> U10
    U12 --> U10
    U13 --> U10
    U14 --> U10
    U15 --> U10
    U16 --> U10
    U17 --> U10
```

### U0. Prove one concrete Sunshine/Moonlight event-source path

**Goal:** De-risk the central adapter premise before production sessiond/input-seat implementation depends on it.

**Requirements:** R1, R5, R7

**Dependencies:** None

**Files:**
- Create: `docs/acceptance/remote-input-event-source-spike.md`
- Inspect/possibly modify later production targets only after choosing a path: `product/vendor/sunshine-korri/`, `product/plugins/moonlight/packages/moonlight-embedded-korri/patches/`, `product/plugins/moonlight/src/moonlight-control-protocol.ts`, or source-host evdev discovery under `product/platform/input/native/`

**Approach:**
- Prove exactly one source-host event path that can supply remote controller events independently of the emulator-visible Korri seats.
- Compare two viable paths before choosing: (A) extend Sunshine/Moonlight local-control to emit raw validated gamepad events to the source host, or (B) read Sunshine-created source-host evdev pads and forward their gamepad events into Korri seats.
- Record permissions, filtering, disconnect behavior, latency/rate behavior, and feedback-loop avoidance for the chosen path.
- Do not proceed to production U4/U7 wiring until the acceptance note identifies the chosen event path and names its production file targets.

**Test scenarios:**
- Hardware proof: a Moonlight/Sunshine remote controller event is observable on the source host without relying on emulator boot timing.
- Error path: the source path cannot feed events back into its own input source or create duplicate controller loops.
- Error path: event-source permissions are either least-privilege or explicitly documented as requiring a gated NixOS opt-in.
- Edge case: source disconnect is observable separately from explicit leave.

**Verification:**
- The plan has a concrete, buildable event-source choice before sessiond and emulator integrations depend on remote event forwarding.

---

### U1. Define input-seat policy, identity, and state model

**Goal:** Create the pure domain model for seat policy, stable seat identities, and seat lifecycle states without touching sessiond orchestration yet.

**Requirements:** R1, R2, R4, R6

**Dependencies:** None

**Files:**
- Create: `product/platform/input-seat/policy.ts`
- Create: `product/platform/input-seat/device-identity.ts`
- Create: `product/platform/input-seat/seat-state.ts`
- Test: `product/platform/input-seat/policy.test.ts`
- Test: `product/platform/input-seat/device-identity.test.ts`
- Test: `product/platform/input-seat/seat-state.test.ts`

**Approach:**
- Define a strict Effect Schema policy for the input-seat companion: enabled/disabled, player count, source adapter choice, seat naming target, runtime extra-seat capability, and opt-down behavior.
- Model the default seat pool as four stable player seats; a resolved policy can reduce the active pool but cannot exceed supported launcher/device capability.
- Define seat identity as a stable emulator-facing descriptor, not just a name: slot, player index, safe display name, backend/device class, capability profile, VID/PID where used, phys/uniq strategy where available, runtime device path, and readiness evidence. Stable seat names must be strict safe strings (bounded length; no newline, quote, backslash, or config-control characters) because emulator plugins may write them into config files.
- Model seat state as an explicit ADT with cases for available, occupied-connected, occupied-disconnected-reserved, and released.
- Distinguish durable user identity from first-slice source identity. User/participant accounts stay deferred, but binding/reconnect/leave must carry a launch-scoped remote source identity so stale or wrong-launch sources cannot claim or release a seat.

**Execution note:** Implement the pure policy/state tests first; they become the executable specification for later sessiond units.

**Patterns to follow:**
- `product/plugins/rpcs3/src/input-policy.ts`
- `product/platform/library/config/inheritable-fields.ts`
- `product/platform/session/foreground-session-lifecycle.ts`

**Test scenarios:**
- Happy path: omitted policy resolves to enabled full P1-P4 defaults for a remote managed launch context.
- Happy path: release/profile opt-down resolves to fewer seats while preserving deterministic P1-first ordering.
- Edge case: player count zero disables seat allocation without failing decode.
- Error path: player count greater than the supported maximum fails strict policy decode.
- Error path: unknown policy keys fail strict decode.
- Error path: seat identity names containing newline, quote, backslash, or config-control characters fail strict decode.
- Happy path: disconnect transitions an occupied seat to occupied-disconnected-reserved without releasing the emulator-visible seat.
- Happy path: explicit leave transitions an occupied or reserved seat to released.
- Edge case: reconnect with the same launch-scoped source identity reuses the reserved seat; a different or stale source identity does not.

**Verification:**
- The input-seat domain can be exercised without sessiond, uinput, or Sunshine dependencies.

---

### U2. Add sessiond pre-spawn input readiness gate

**Goal:** Add a sessiond-owned pre-spawn readiness gate for input-seat allocation after the role yields the foreground surface but before the child emulator process is spawned, without turning this slice into a broad plugin lifecycle framework.

**Requirements:** R1, R3, R4

**Dependencies:** U1

**Files:**
- Modify: `product/services/device/sessiond.ts`
- Create: `product/services/device/sessiond-pre-spawn.ts` if the helper boundary needs to be shared between sessiond and the input-seat service
- Test: `product/services/device/sessiond.test.ts`
- Test: `product/services/device/sessiond-pre-spawn.test.ts` if a helper is introduced

**Approach:**
- Add an internal pre-spawn readiness gate to sessiond rather than a general-purpose plugin hook API. Existing plugin lifecycle hooks that only implement after-child and cleanup behavior remain unchanged.
- Invoke the input-seat readiness gate after `SessionRole.beforeChildLaunch()` completes and before sessiond marks the game running or calls the launcher spawn path.
- Treat pre-spawn input-seat failures as launch rejections or pre-spawn failures that restore the role without launching the emulator.
- Add a typed failure-kind surface for lifecycle hooks so input-seat failures can map to the existing `input-unavailable` and `input-ambiguous` launch failure kinds instead of being collapsed into `host-unavailable`.
- Track pre-spawn hook handles separately from after-child hook handles. Pre-spawn seat handles must survive child exit and restore attempts for the same launch id, but must still be stopped on pre-spawn rollback, terminal cleanup, or failed launch.
- Run pre-spawn hooks only on the managed `spawn` path; the legacy blocking `run` path remains unaffected because sessiond cannot correlate a pre-spawn lease with a managed child there.
- Thread cancellation into the pre-spawn phase so a force-terminate request during seat allocation can abort readiness polling instead of waiting for a full timeout.

**Execution note:** Add characterization coverage around current hook ordering before changing lifecycle order.

**Patterns to follow:**
- `product/services/device/sessiond.ts` existing launch ordering, restore, cancellation, and cleanup paths
- `product/platform/library/launcher.ts` failure-kind handling
- Existing lifecycle hook cleanup tests as a rollback-symmetry reference, without broadening this unit into plugin lifecycle API work

**Test scenarios:**
- Happy path: the input-seat readiness gate runs after role `beforeChildLaunch` and before launcher `spawn`.
- Happy path: existing after-child lifecycle hooks still run after `child-running` with unchanged request data.
- Error path: an input-seat pre-spawn failure prevents `spawn` from being called and returns an input-related failed launch result.
- Error path: acquired pre-spawn seat handles are stopped before restore on failure.
- Integration: sessiond emits normal restore/readiness events after a pre-spawn failure.
- Edge case: no pre-spawn hooks preserves current managed-launch behavior.
- Error path: force-terminate during a slow pre-spawn allocation aborts the allocation and rolls back acquired seats.
- Error path: input-seat hook failure preserves `input-unavailable` or `input-ambiguous` in the launch result instead of reporting generic host-unavailable.

**Verification:**
- sessiond has a focused pre-spawn input readiness seam without adding a broad new plugin lifecycle abstraction.

---

### U3. Define runtime adapter ports for virtual seats and remote input sources

**Goal:** Define the adapter boundary that keeps sessiond lifecycle policy separate from uinput/InputPlumber/Sunshine mechanics.

**Requirements:** R1, R3, R5, R6

**Dependencies:** U1

**Files:**
- Create: `product/platform/input-seat/remote-input-source.ts`
- Create: `product/platform/input-seat/seat-runtime-port.ts`
- Test: `product/platform/input-seat/remote-input-source.test.ts`
- Test: `product/platform/input-seat/seat-runtime-port.test.ts`

**Approach:**
- Define a runtime port for allocating, verifying, and releasing emulator-visible virtual seat devices.
- Include an explicit gamepad-only capability profile in the port contract so seat devices cannot declare keyboard, mouse, relative-pointer, or other host-control capabilities.
- Define a remote input source adapter that can bind a launch-scoped remote source identity to a stable seat and report connected/disconnected/left transitions.
- Provide in-memory configurable implementations for tests with behaviors for success, failure, partial allocation, delayed readiness, cancellation, disconnect, reconnect, and explicit leave.
- Specify readiness as a domain signal: the runtime adapter must not report ready until the device is present, readable by the intended session user, and matches expected name/identity facts verified against the created device rather than a stale `eventN` guess.
- Treat partial allocation as all-or-nothing for the first slice: any required seat failure rolls back already-created seats and blocks launch.
- Require state transitions and bind/release operations to run through one serialized command path so racing disconnect, leave, and cleanup signals produce one observable transition.

**Execution note:** Implement the in-memory ports before production adapters so sessiond tests can be deterministic.

**Patterns to follow:**
- `product/plugins/cdp-input-bridge/src/bridge-process.ts`
- `product/platform/input/native/discover-devices.ts`
- `product/platform/input/native/inputplumber-virtual-gamepad.ts`

**Test scenarios:**
- Happy path: in-memory runtime allocates N seats and returns ready identities in deterministic order.
- Error path: delayed readiness beyond timeout returns an unavailable result without leaking allocated seats.
- Error path: partial allocation failure releases previously allocated seats.
- Error path: allocation whose resolved capability profile includes keyboard or relative-pointer capabilities is rejected.
- Error path: cancellation during delayed readiness releases already-created seats and returns a non-success outcome.
- Edge case: ambiguous discovered device identity produces an ambiguous result rather than choosing arbitrarily.
- Edge case: duplicate device names appearing during readiness verification are treated as ambiguous rather than silently selected.
- Happy path: remote input source reports connected, disconnected-reserved, reconnected, and explicit-leave transitions for a bound launch-scoped source identity.
- Error path: adapter failure after allocation reports a seat event and leaves emulator-visible seats intact until session cleanup.

**Verification:**
- All later sessiond/input-seat service units can depend on ports rather than concrete Sunshine/uinput details.

---

### U4. Implement the sessiond input-seat service and hook

**Goal:** Wire the input-seat domain and runtime ports into sessiond so managed launches can allocate seats before emulator spawn and release them at session end.

**Requirements:** R1, R3, R4, R6

**Dependencies:** U0, U1, U2, U3

**Files:**
- Create: `product/services/device/sessiond-input-seat.ts`
- Test: `product/services/device/sessiond-input-seat.test.ts`
- Modify: `product/services/device/sessiond-plugin-composition.ts`
- Test: `product/services/device/sessiond-plugin-composition.test.ts`
- Test: `product/services/device/sessiond.test.ts`

**Approach:**
- Create a sessiond-owned `@korri:input-seat` lifecycle service that decodes policy from launch companions and allocates the resolved seat pool in the new pre-spawn phase.
- Store the active launch's seat snapshot and pre-spawn handles in sessiond-owned state so status and event emission can read one source of truth.
- Keep seats alive for the whole managed game session, including child exit handling and restore attempts for the same launch id, then release them during final cleanup.
- Fail closed when the required pool is missing, ambiguous, unreadable, or only partially allocated.
- Wire the service unconditionally through sessiond composition rather than gating it behind `KORRI_ENABLED_PLUGINS`; the policy still decides whether any seats are allocated for a given launch. Use gamescope/steam lifecycle factory wiring as the plugin-hook precedent, but keep input-seat as a core sessiond capability.

**Execution note:** Use the in-memory runtime port in tests; production uinput/Sunshine details come later.

**Patterns to follow:**
- `product/plugins/gamescope/src/session/lifecycle-hook.ts`
- `product/plugins/steam/src/session-lifecycle-hook.ts`
- `product/services/device/sessiond-plugin-composition.ts`
- `product/plugin-host/index.ts` first-party lifecycle factory pattern, while keeping input-seat registration unconditional in sessiond composition

**Test scenarios:**
- Happy path: launch with input-seat policy allocates P1-P4 before spawn and releases all seats after terminal cleanup.
- Happy path: opt-down policy allocates only the requested seats.
- Error path: allocation failure prevents emulator spawn and emits/logs a clear input-seat failure.
- Error path: partial allocation failure rolls back all seats and prevents spawn.
- Edge case: disabled input-seat policy skips allocation and does not affect launch.
- Integration: seats remain allocated while a session-lifecycle launch is anchored and release on managed terminate.
- Integration: seats are released exactly once even when restore retries occur.
- Integration: the input-seat lifecycle service is present regardless of `KORRI_ENABLED_PLUGINS`, while disabled launch policy performs no allocation.
- Error path: concurrent leave, disconnect, and cleanup signals for one seat emit exactly one release transition.

**Verification:**
- A managed launch can be made input-seat-gated without touching emulator-specific code.

---

### U5. Resolve input-seat policy through the launch cascade

**Goal:** Make seat pool defaults and opt-down settings available at launcher, release, profile, and override layers using the existing provider-keyed launch companion cascade.

**Requirements:** R2, R3

**Dependencies:** U1

**Files:**
- Modify: `product/platform/library/config/inheritable-fields.ts`
- Modify: `product/platform/library/config/cascade-resolver.ts`
- Test: `product/platform/library/config/cascade-resolver.test.ts`
- Test: `product/apps/portal/api/stream/prepare.rpc-handler.test.ts`

**Approach:**
- Use `launch.with["@korri:input-seat"]` as the first-slice authoring surface so existing cascade precedence applies without adding a new top-level field.
- Ensure remote prepare preserves resolved input-seat launch companions in the one-shot stream launch intent sent to the source machine.
- Name the defaulting owner explicitly: either remote prepare overlays `launch.with["@korri:input-seat"]` when the resolved runtime declares safe extra-seat support, or built-in runtime/launcher descriptors carry that companion. Do not leave defaulting implicit in sessiond.
- Provide a default policy for validated remote-capable emulator launches that creates P1-P4 unless a more-specific release or release profile opts down. Unknown runtimes default conservatively until they declare safe extra-seat support.
- Keep launcher/plugin capability as a bound on resolved player count; release intent can override within those limits, and release profile can override release.
- Document that future neutral `preferences.input` can translate into this same companion policy instead of replacing it.

**Patterns to follow:**
- `launchCompanionsFromLaunch` in `product/platform/library/config/inheritable-fields.ts`
- `foldLaunchCompanions` behavior in `product/platform/library/config/cascade-resolver.ts`
- `product/apps/portal/api/stream/prepare.rpc-handler.ts`

**Test scenarios:**
- Happy path: launcher/runtime default P1-P4 is present in resolved launch companions for a remote emulator launch whose runtime declares safe extra-seat support.
- Edge case: local launches do not receive remote-seat defaults unless explicitly configured.
- Edge case: unknown runtimes do not silently receive P1-P4 defaults.
- Happy path: release-level opt-down overrides launcher default.
- Happy path: release-profile opt-down overrides release-level setting.
- Edge case: unrelated launcher policies do not affect a launch whose resolved launcher differs.
- Error path: invalid input-seat companion policy fails configuration resolution with a clear config error.
- Integration: `prepareStreamLaunch` writes a launch intent containing the resolved input-seat policy.

**Verification:**
- The same cascade path that currently carries launch companions can carry input-seat policy end-to-end to sessiond.

---

### U6. Integrate stable seat identities with RPCS3 input config

**Goal:** Make RPCS3 consume Korri seat identities so the emulator profile points at stable Korri seats instead of transient Sunshine device names.

**Requirements:** R1, R2, R7

**Dependencies:** U1, U5

**Files:**
- Modify: `product/plugins/rpcs3/src/input-policy.ts`
- Modify: `product/plugins/rpcs3/src/input-mapping.ts`
- Modify: `product/plugins/rpcs3/src/materializer.ts`
- Create: `product/plugins/rpcs3/src/input-seat-policy.ts`
- Test: `product/plugins/rpcs3/src/input-seat-policy.test.ts`
- Test: `product/plugins/rpcs3/src/materializer.test.ts`

**Approach:**
- Add a translation path from resolved input-seat policy to RPCS3 player input config defaults.
- Render RPCS3 player device bindings using deterministic Korri seat descriptors for the active seat pool, including any backend/VID/PID/capability fields RPCS3 actually uses for enumeration.
- Keep the ownership boundary clear: RPCS3 writes the profile file; sessiond/input-seat creates and verifies the runtime devices.
- Preserve explicit RPCS3 plugin input config as the more-specific override when a release needs hand-authored mappings.
- Keep `Keep pads connected` handling in RPCS3 config as a compatibility guard, but do not rely on it to solve boot-time absence.

**Execution note:** Start from existing RPCS3 input profile tests so the diff proves no regression for manually authored input configs.

**Patterns to follow:**
- `work/items/active/01KWM7Q408P6VW6RWR66SE6R3R-rpcs3-input-config-authoring/convergence-note.md`
- `product/plugins/rpcs3/src/preferences-mapping.ts`
- `product/plugins/rpcs3/src/input-config-render.ts`

**Test scenarios:**
- Happy path: input-seat P1-P4 policy produces an RPCS3 input profile with four deterministic player device bindings.
- Happy path: release opt-down to one seat renders only P1 seat defaults.
- Edge case: explicit RPCS3 input policy overrides generated seat defaults for a specific player.
- Error path: invalid generated seat identity is rejected before writing an input config.
- Error path: seat names containing newlines, quotes, backslashes, or other config-injection characters are rejected at the identity boundary before RPCS3 config render.
- Integration: RPCS3 input config is written through an atomic tmpfile-and-rename path so a concurrent emulator read cannot observe a partial profile.
- Integration: materialization writes the RPCS3 input profile and launch spec references it without hand-edited Sunshine device names.
- Hardware/probe: RPCS3 enumerates the created Korri seats exactly as the generated config references them, including duplicate-seat handling and enumeration order.

**Verification:**
- RPCS3 can be configured to scan the same stable seat names that sessiond creates before spawn.

---

### U7. Add the first Sunshine/Moonlight remote input source adapter

**Goal:** Provide the first remote input source that binds Sunshine/Moonlight controller events into Korri-managed seats without making Sunshine the owner of emulator-visible devices.

**Requirements:** R5, R6, R7

**Dependencies:** U0, U3, U4

**Files:**
- Create: `product/platform/input-seat/sunshine-remote-input-source.ts`
- Test: `product/platform/input-seat/sunshine-remote-input-source.test.ts`

**Approach:**
- Implement the TypeScript adapter that consumes decoded Sunshine mirror frames and updates launch-scoped seat state.
- Report `OccupiedConnected` on source-connected or first validated remote controller state for a launch-scoped source identity.
- Keep this unit transport-agnostic: it should accept already-decoded frames and return seat-state/forwarding decisions. U11 and U14 wire the live socket and virtual-seat writer.
- Enforce per-seat event-rate ceilings and validate event type/code pairs against the declared gamepad capability profile before writing to the virtual device; invalid writes are dropped with structured warnings, not adapter crashes.
- Treat a source disappearance or stream disconnect as a reservation transition, not as destruction of the emulator-visible seat.
- Provide an explicit leave command path at the service layer later in U8; do not infer all clean disconnects as leave.
- Keep the adapter swappable so a later Korri-native protocol can feed the same seats.

**Execution note:** The concrete transport mechanism is expected to require close reading of the vendored Moonlight/Sunshine integration. Keep the adapter contract stable even if the first mechanism changes during implementation.

**Patterns to follow:**
- `product/plugins/moonlight/src/stream-control/runtime-session.ts`
- `product/apps/portal/stream/moonlight-launcher.ts`
- `product/services/device/overlay-intercept.ts`

**Test scenarios:**
- Happy path: adapter binds a remote controller source to P1 and reports occupied-connected.
- Happy path: source disconnect reports occupied-disconnected-reserved while the virtual seat remains allocated.
- Happy path: reconnect reuses the reserved seat when the same launch-scoped source identity returns.
- Error path: adapter failure does not tear down the emulator-visible seat before session cleanup.
- Edge case: second remote source binds to the next available seat rather than stealing an occupied or disconnected-reserved seat.
- Error path: event floods above the configured per-seat ceiling are rate-limited without growing an unbounded queue.
- Error path: event codes outside the seat's capability profile are dropped and logged without crashing the adapter.
- Integration: chosen source-host adapter preserves existing Sunshine/Moonlight input-device behavior while enabling the input-seat adapter when policy is active.

**Verification:**
- Decoded Sunshine controller frames can be launch-filtered, rate-limited, and mapped to input-seat state without relying on Sunshine's lazy pad as the emulator-visible device.

---

### U8. Expose seat status, events, and explicit leave control

**Goal:** Make input-seat state operable and debuggable without building UI.

**Requirements:** R4, R6

**Dependencies:** U1, U4

**Files:**
- Modify: `product/platform/library/sessiond-managed-launch-protocol.ts`
- Modify: `product/platform/library/sessiond-managed-launch-protocol.test.ts`
- Modify: `product/platform/library/sessiond-lifecycle-projections.ts`
- Modify: `product/services/device/sessiond.ts`
- Test: `product/services/device/sessiond.test.ts`
- Create: `product/apps/portal/api/session/leave-seat.rpc.ts`
- Create: `product/apps/portal/api/session/leave-seat.rpc-handler.ts`
- Test: `product/apps/portal/api/session/leave-seat.rpc-handler.test.ts`

**Approach:**
- Add optional input-seat capability/status fields to managed-launch status following the protocol's additive evolution rules. Use `inputSeats` as the capability flag name.
- Add a structured wire-safe seat payload for seat events/status, carrying slot/player index, public state, public seat name/descriptor key, reason, and launch id correlation while excluding raw device paths, permission diagnostics, and unredacted source identities from public status/SSE.
- Name and add the seat event literals before any daemon path emits them: `seat-allocated`, `seat-ready`, `seat-connected`, `seat-disconnected-reserved`, `seat-reconnected`, `seat-left`, `seat-released`, and `seat-allocation-failed`.
- Follow the managed-launch protocol rule that schemas update before daemon emission; schema additions and strict-decode tests land before sessiond starts producing seat events/status fields.
- Add seat-state lifecycle events to the existing managed-launch SSE stream rather than a separate stream.
- Emit structured logs for allocation, readiness, bind, disconnect-reserved, explicit leave, release, and cleanup.
- Add an API-level command for explicit seat leave or seat release. The command must be scoped to the launch id and authorized for either the bound launch-scoped source identity or an operator identity; it must distinguish source self-leave from operator-forced release.
- Do not add user-facing UI in this unit.

**Patterns to follow:**
- `product/platform/library/sessiond-managed-launch-protocol.ts` capability flag pattern
- `product/services/device/overlay-remote-stop.ts` for launch-scoped operator command plumbing, not stop semantics
- Existing `product/apps/portal/api/session/*.rpc.ts` RPC module/handler/test layout

**Test scenarios:**
- Happy path: managed-launch status includes input-seat capability and active seat summary when seats are allocated.
- Happy path: seat allocation, disconnect, reconnect, leave, and release events decode through the strict client schema with structured seat payloads.
- Edge case: older status without seat fields still decodes.
- Error path: explicit leave for an unknown or already-released seat returns a non-destructive response.
- Error path: unauthenticated or wrong-launch leave attempts cannot release an occupied seat.
- Error path: source-scoped leave cannot release another source identity's occupied seat unless the caller is an operator.
- Error path: public status/SSE omits raw device paths, broad permission diagnostics, and unredacted source identifiers.
- Integration: explicit leave releases P2 while keeping the game session and other seats active.
- Integration: terminal session cleanup emits release events for all still-allocated seats.

**Verification:**
- Operators and agents can inspect and manipulate seat state headlessly through existing session surfaces.

---

### U9. Add NixOS/device-access support for session-owned virtual seats

**Goal:** Ensure target systems can create and expose uinput-based seats safely and reproducibly.

**Requirements:** R1, R3, R7, R12

**Dependencies:** U3, U4

**Files:**
- Modify: `product/systems/nixos/modules/korri-input.nix`
- Modify: `product/systems/nixos/modules/korri-sessiond.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify: `product/systems/nixos/flake/checks.nix` if U9 creates a new sibling Nix check rather than extending an already-registered one
- Test: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Test: create or extend a sibling check under `tools/testing/nix/` if module assertions need coverage beyond the SM8550 config check.

**Approach:**
- Ensure `/dev/uinput` exists with least-privilege ownership and mode before the sessiond/input-seat runtime needs it. Prefer a dedicated helper-only `uinput` group over the broad `input` group; if the target image cannot support that narrower grant, require an explicit opt-in warning that documents read-all-input risk.
- Do not add the runtime/session user to the raw `uinput` group. sessiond reaches `/dev/uinput` through the privileged helper wrapper, while foreground children inherit only the permissions needed to read Korri-created event nodes.
- Add udev/device-access rules for the created `Korri Seat P*` event nodes so RPCS3/emulators running as the session user can read those virtual gamepad devices through a separate event group. This is separate from `/dev/uinput` write access; do not rely on adding the service user to the broad `input` group unless explicitly accepted with a warning.
- Add module assertions/checks so an enabled input-seat path fails evaluation when the device-access contract is impossible.
- Include environment/runtime-dir wiring for any adapter sockets or runtime state needed by sessiond and the source adapter.
- Add startup diagnostics for leftover Korri-named virtual devices so orphaned seats are detected before accepting a new launch.
- Keep this Nix work focused on the input-seat substrate; do not broaden into local-controller routing.

**Patterns to follow:**
- `docs/solutions/integration-issues/steam-uinput-permissions-block-virtual-xinput-2026-06-13.md`
- `product/systems/nixos/modules/korri-input.nix`
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`

**Test scenarios:**
- Happy path: NixOS module evaluation exposes helper-only `/dev/uinput` permissions, a privileged helper wrapper for sessiond, and readable `Korri Seat P*` event-node access for the emulator/session user without raw uinput group membership.
- Error path: enabling input-seat support with an invalid service user or missing group configuration fails module assertions.
- Error path: accidental broad `input` group access is rejected or requires an explicit documented opt-in.
- Integration: SM8550/source-machine config checks verify the input-seat device-access contract without requiring a full image build.
- Edge case: disabled input-seat support does not alter existing inputd-only configuration.

**Verification:**
- A deployed source host has the permissions and runtime wiring required for session-owned virtual seats before any hardware validation begins.

---


### U11. Add the Sunshine mirror socket seam

**Goal:** Define the live local IPC contract that the native Sunshine packet mirror publishes into and the TypeScript adapter consumes.

**Requirements:** R5, R6, R8

**Dependencies:** U7

**Files:**
- Create: `product/platform/input-seat/sunshine-input-seat-mirror-socket.ts`
- Test: `product/platform/input-seat/sunshine-input-seat-mirror-socket.test.ts`

**Approach:**
- Use bounded newline-delimited JSON over a Unix socket so the native patch can emit simple frames and the TypeScript side can own strict decode, launch filtering, mirror-token verification, and diagnostics.
- Require an absolute socket path, unlink stale socket files before bind, set `0600` permissions, and provide cleanup that closes the server and removes the socket.
- Extend or envelope the socket frame contract so callers can provide an opaque authorization field and the server can use an injected verifier before adapter binding, source identity updates, or writer calls. U14/U16 provide the production active-token verifier.
- Decode each complete frame with `decodeSunshineInputSeatFrame` before passing it to the U7 adapter; authorization verification may happen in the socket envelope before the decoded gamepad payload reaches U7.
- Treat malformed JSON, schema failures, authorization failures, oversized frames, stale-launch drops, and adapter drops as observable diagnostics, not process crashes.
- Keep the socket contract local and launch-scoped; do not expose it as a network API or UI surface.

**Patterns to follow:**
- `product/plugins/moonlight/src/stream-control/runtime-session.ts`
- `product/platform/input-seat/sunshine-remote-input-source.ts`

**Test scenarios:**
- Happy path: chunked NDJSON frames decode and reach the adapter in order.
- Happy path: a live Unix socket client can connect, send a valid frame, and receive accepted diagnostics.
- Error path: relative socket paths are rejected before server start.
- Error path: malformed JSON, non-gamepad schema failures, authorization failures, oversized frames, stale launch ids, and rate-limit drops are reported without crashing or growing an unbounded buffer.
- Integration: socket cleanup closes the listener and removes the socket path.

**Verification:**
- The native Sunshine patch has a stable local frame contract to write into, independent of hardware validation.

---

### U12. Patch Sunshine to mirror controller packets into the socket

**Goal:** Add the native Sunshine-side producer for sanitized controller-domain input-seat frames, with a deployment-safe activation contract for a long-running Sunshine service.

**Requirements:** R5, R6, R8, R10

**Dependencies:** U0, U11

**Files:**
- Create/modify: `product/vendor/sunshine-korri/patches/0015-add-korri-input-seat-event-mirror.patch`
- Modify: `product/vendor/sunshine-korri/package.nix`
- Modify: `product/vendor/sunshine-korri/README.md`
- Test: `tools/testing/nix/korri-sunshine-input-seat-mirror-patch-check.nix`
- Update: `docs/acceptance/remote-input-event-source-spike.md` if native packet details require contract clarification

**Approach:**
- Patch Sunshine controller passthrough seams identified in U0 to mirror only controller-domain events: source-connected, source-state, source-disconnected, and any explicitly supported controller metadata frames.
- Preserve Sunshine as an event source only: the patch must not read Korri uinput seats, create emulator-visible devices, or depend on Sunshine's lazy evdev pads for the launch readiness contract.
- Own and document the native-reader sidecar contract used by later production wiring: Sunshine reads a stable startup-time `KORRI_INPUT_SEAT_MIRROR_SOCKET` path from the service environment and reads only the active launch id/generation plus mirror token from a fixed sessiond-owned sidecar under the input-seat runtime dir. Do not read a per-launch socket path or `KORRI_INPUT_SEAT_LAUNCH_ID` from process env.
- Define the sidecar contract here for both native and TypeScript implementers: fixed filename under `KORRI_INPUT_SEAT_RUNTIME_DIR`, payload fields (`launchId`, generation/timestamp, `mirrorToken`), missing/malformed behavior, and the rule that sidecar data never contains an arbitrary socket path.
- Derive mirrored source identity from Sunshine's controller/session context and the active launch contract; do not trust arbitrary source identifiers supplied by socket JSON.
- Emit bounded NDJSON frames matching U11's schema; invalid, unsupported, inactive-launch, or non-controller packet shapes should be dropped with local diagnostics rather than widening the public contract.
- Preserve Sunshine's existing virtual-pad behavior while adding the mirror as a side-effect; missing mirror configuration disables only Korri mirroring.

**Execution note:** Characterize the patch at the package/build level before hardware proof; hardware validation belongs to U10.

**Patterns to follow:**
- `docs/acceptance/remote-input-event-source-spike.md`
- `product/vendor/sunshine-korri/package.nix`
- Existing downstream Sunshine patches in `product/vendor/sunshine-korri/patches/`

**Test scenarios:**
- Happy path: Sunshine package applies the new patch and still includes the existing downstream patch series.
- Happy path: controller arrival/state/disconnect packet paths write bounded NDJSON frames to the stable socket when the stable mirror configuration and active launch-id/token sidecar are present.
- Edge case: active launch sidecar is absent, empty, malformed, has the wrong generation, or lacks the mirror token, so controller packets produce no input-seat frames while Sunshine's existing input path continues.
- Error path: spoofed source identifiers in mirrored JSON are ignored or rejected in favor of producer-derived controller identity.
- Edge case: active launch id/generation changes between launches, so subsequent frames carry the new launch id and stale-launch filtering remains meaningful.
- Error path: missing socket/runtime configuration disables mirroring without affecting Sunshine's existing input path.
- Error path: socket write failures are bounded/local diagnostics and do not crash Sunshine's input handling path.
- Error path: keyboard, mouse, text, pen, and non-controller packets produce no input-seat frames.

**Verification:**
- A built Korri Sunshine package can emit the U11 frame contract from controller packet seams without changing emulator-visible device ownership, and its activation mechanism is compatible with Sunshine staying alive across multiple game launches.

---

### U13. Implement the production virtual-seat runtime and writer

**Goal:** Replace the test-only/injected backend seam with a production `UinputSeatBackend` backed by a packaged Python uinput helper that creates emulator-visible gamepad-only Korri seats and writes forwarded gamepad state through real Linux uinput devices on the AKA/source host.

**Requirements:** R1, R3, R5, R7, R9, R12

**Dependencies:** U3, U9

**Files:**
- Modify: `product/platform/input-seat/uinput-seat-runtime.ts`
- Create: `product/platform/input-seat/uinput-seat-backend.ts`
- Create: `product/platform/input-seat/uinput-seat-backend-helper.py`
- Test: `product/platform/input-seat/uinput-seat-runtime.test.ts`
- Test: `product/platform/input-seat/uinput-seat-backend.test.ts`
- Modify: `product/platform/input/native/button-codes.ts`
- Modify: `product/services/device/sessiond-input-seat.ts`
- Test: `product/services/device/sessiond-input-seat.test.ts`
- Modify: `product/services/device/nix/sessiond.nix` or create a dedicated helper derivation under the existing Nix package layout
- Modify: `product/systems/nixos/flake/packages.nix`
- Modify: `product/systems/nixos/overlays/korri-packages.nix`
- Modify: `product/systems/nixos/modules/korri-sessiond.nix`
- Modify: `product/systems/nixos/flake/checks.nix`
- Test: `tools/testing/nix/korri-input-seat-backend-helper-check.nix`

**Approach:**
- Backend strategy is resolved at planning time: implement a long-running Python subprocess helper following the remap bridge pattern. The TypeScript wrapper implements `UinputSeatBackend`, spawns/supervises the helper, sends line-oriented or NDJSON commands for create/write/release, and treats helper crash/missing binary as `input-unavailable` before emulator spawn.
- The Python helper owns the raw `/dev/uinput` mechanics: open `/dev/uinput`, set capability bits, configure uinput user device fields, issue `UI_DEV_CREATE`/`UI_DEV_DESTROY`, emit input-event structs, and close every descriptor on release or helper shutdown. It should be started once for the gate/backend lifetime, not once per input event.
- Package the helper and Python interpreter into the sessiond service closure before U15 consumes it. Either install the helper into the `korri-sessiond` package output or expose it as a dedicated immutable Nix package. Expose the packaged helper as the source for a fixed NixOS privileged wrapper (`/run/wrappers/bin/korri-uinput-seat-helper`); production must not rely on host-global Python, mutable path lookup, or `PATH` discovery.
- Ensure all helper-owned uinput file descriptors are close-on-exec so emulator or Sunshine child processes cannot keep devices alive after sessiond releases them.
- Create Xbox-style gamepad-only devices with deterministic identity: `name = Korri Seat P<N>`, `phys = korri/input-seat/p<N>`, and `uniq = korri-seat-p<N>` set before device creation. The readiness matcher must require all expected identity fields, not name-only matching.
- Add any missing native input constants needed by the backend, including `EV_SYN`, `SYN_REPORT`, `ABS_Z`, `ABS_RX`, `ABS_RY`, and `ABS_RZ`.
- Decode the Sunshine/Moonlight XInput-style `buttons` bitmap into Linux evdev gamepad controls. Map d-pad bits to both the declared d-pad capability strategy and emitted state consistently; prefer `ABS_HAT0X`/`ABS_HAT0Y` for broad emulator compatibility while keeping `BTN_DPAD_*` use explicit if implementation discovers a stronger RPCS3 requirement.
- Require helper-side allowlisting in addition to TypeScript-side validation. The Python helper must reject unknown commands, invalid slots, malformed or oversized command frames, and non-gamepad event types/codes before issuing any uinput ioctl or write.
- Declare a complete gamepad capability profile needed by RPCS3/Evdev and common emulators: action buttons, shoulders, select/start/mode, thumb clicks, d-pad hat axes, sticks, triggers, and `EV_SYN`; do not expose keyboard, mouse, text, touch, relative-pointer, or multitouch capabilities.
- Discover readiness through kernel/device facts rather than event-number prediction: poll `/proc/bus/input/devices` by name+phys+uniq and verify the resulting event node is readable by the session user.
- Detect stale pre-existing Korri seat identities before or during allocation and fail clearly rather than binding a new launch to an orphaned device.
- Keep allocation all-or-nothing, release already-created devices on partial failures, stop the helper on terminal cleanup, and ensure zombie helper processes cannot survive gate cleanup.

**Execution note:** Start with adapter-level tests against an injectable helper/process seam so lifecycle, protocol, and failure behavior are proven before hardware validation.

**Patterns to follow:**
- `product/plugins/remap/packages/korri-remap-bridge/native-driver.py`
- `product/plugins/remap/nix/remap-bridge.nix`
- `product/platform/input/native/discover-devices.ts`
- `product/platform/input/native/inputplumber-virtual-gamepad.ts`
- `product/platform/input-seat/uinput-seat-runtime.ts`
- `docs/solutions/integration-issues/steam-uinput-permissions-block-virtual-xinput-2026-06-13.md`

**Test scenarios:**
- Happy path: TypeScript backend wrapper starts the helper, creates P1, and discovery reports `Korri Seat P1` with matching `phys` and `uniq` before runtime allocation succeeds.
- Happy path: production runtime requests P1-P4 seats and reports deterministic ready identities after discovery verifies matching devices.
- Happy path: forwarded gamepad state writes allowed button, axis, trigger, hat, and sync events to the selected seat.
- Happy path: created `Korri Seat P*` event nodes are readable by the emulator/session user through the U9 virtual-seat udev rules without broad physical-input read access.
- Edge case: `/dev/input/eventN` numbering changes across launches, but readiness still succeeds because identity matching uses name+phys+uniq rather than event number.
- Edge case: upper/unknown Sunshine button bits are ignored or rejected according to the bounded gamepad contract, without emitting keyboard/mouse events.
- Edge case: a stale same-name or partial-identity orphan exists before allocation, so launch fails as unavailable/ambiguous instead of selecting arbitrarily.
- Error path: `/dev/uinput` is missing or not writable by the privileged helper wrapper, so allocation fails before emulator spawn with a clear local diagnostic and redacted managed-launch failure.
- Error path: helper binary path is absent from env/service closure, is neither the fixed privileged wrapper path nor an allowed immutable Nix-store test/helper path, or the helper crashes during device creation, so the pre-spawn gate propagates `input-unavailable` and leaves no zombie helper process.
- Error path: helper receives an unknown command, invalid slot, malformed frame, oversized frame, or non-gamepad event code, so it rejects the command before any uinput write/ioctl and reports a bounded diagnostic.
- Error path: readiness times out when the created device cannot be uniquely discovered or read by the session user.
- Error path: unsupported event types/codes are rejected before reaching uinput.
- Error path: partial allocation failure releases already-created devices and destroys helper-owned uinput devices.
- Integration: sessiond input-seat gate can use the production runtime through the same `SeatRuntimePort`/writer contract tested with the memory backend.
- Integration: the packaged helper and Python interpreter are present in the sessiond runtime closure used by the NixOS module, and the new backend-helper check is exported from `product/systems/nixos/flake/checks.nix`.

**Verification:**
- sessiond has a production-safe writer target for live mirrored Sunshine state, and allocated Korri seats appear on the AKA/source host as real gamepad-only input devices with stable identities before emulator spawn.

---

### U15. Wire production sessiond composition from runtime-dir environment

**Goal:** Make production sessiond construct the real input-seat runtime, backend helper, mirror socket options, and diagnostics when the AKA/source-host deployment enables input-seat support.

**Requirements:** R1, R3, R4, R8, R9, R12

**Dependencies:** U4, U9, U11, U12, U13

**Files:**
- Modify: `product/services/device/sessiond-plugin-composition.ts`
- Test: `product/services/device/sessiond-plugin-composition.test.ts`
- Modify: `product/services/device/sessiond.ts`
- Test: `product/services/device/sessiond.test.ts`
- Modify: `product/services/device/sessiond-input-seat.ts`
- Test: `product/services/device/sessiond-input-seat.test.ts`
- Modify: `product/systems/nixos/modules/korri-sessiond.nix`
- Modify: `product/systems/nixos/modules/korri-input.nix`
- Modify: `product/systems/nixos/images/source-machine.nix`
- Modify: `product/systems/nixos/flake/checks.nix`
- Test: `tools/testing/nix/korri-input-seat-sessiond-composition-check.nix`
- Test: `tools/testing/nix/korri-input-seat-source-machine-check.nix`

**Approach:**
- Read `KORRI_INPUT_SEAT_RUNTIME_DIR` in `sessiondPreSpawnGatesFromEnv`. A missing or blank value keeps the unavailable runtime so launches without `@korri:input-seat` remain unaffected and launches that request seats fail closed.
- Add an explicit production helper-path contract, such as `KORRI_INPUT_SEAT_BACKEND_HELPER`, populated by the NixOS module with the fixed privileged helper wrapper path (`/run/wrappers/bin/korri-uinput-seat-helper`) whose source is the packaged U13 helper in the sessiond closure. Missing, relative, unresolved, or unexpected helper paths with input-seat enabled must fail closed before emulator spawn rather than silently falling back to test seams. Production must not discover the helper through `PATH`.
- Keep production construction inside `sessiondPreSpawnGatesFromEnv` when the runtime dir and helper path are present, so the normal `sessiond.ts` `main()` call builds a non-unavailable gate without requiring ad-hoc test-only injection. `sessiond.ts` still needs coverage because it is the production entry point currently calling `sessiondPreSpawnGatesFromEnv(process.env)`.
- When the runtime dir is present, require a concrete absolute path as seen by sessiond. The NixOS/user-service layer should expand `%t` before process start; TypeScript should reject unresolved specifiers or relative paths instead of guessing.
- Derive one stable mirror socket path under the runtime dir, plus the U12-defined sidecar path that U16 writes. The socket path must stay inside the canonical runtime dir and use `0600` socket mode.
- Construct `createUinputSeatRuntime` with the production backend from U13 and pass `sunshineMirror` options into `createSessiondInputSeatPreSpawnGate`.
- Opt the AKA/source-machine image into `services.korri.input.inputSeat.enable = true` so `korri-sessiond` receives the runtime-dir/helper environment, the privileged helper wrapper is installed, `/dev/uinput` remains helper-only, and the runtime user receives readable virtual-seat event-node access. This is source-host work; Bandai/client images do not create emulator-visible RPCS3 devices.
- Wire mirror diagnostics and backend allocation failures to structured local logs. Public managed-launch failures remain redacted and input-specific.
- Keep composition tests injectable: avoid opening `/dev/uinput` in unit tests by allowing the backend factory, helper path, and path helpers to be substituted.

**Patterns to follow:**
- `product/services/device/sessiond-plugin-composition.ts`
- `product/services/device/sessiond-plugin-composition.test.ts`
- `product/services/device/sessiond.ts`
- `product/systems/nixos/modules/korri-sessiond.nix`
- `product/systems/nixos/modules/korri-input.nix`
- `product/systems/nixos/flake/checks.nix`
- `product/systems/nixos/images/source-machine.nix`
- `tools/testing/nix/korri-input-seat-device-access-check.nix`

**Test scenarios:**
- Happy path: env contains absolute `KORRI_INPUT_SEAT_RUNTIME_DIR` and packaged helper path, so the composition installs an input-seat pre-spawn gate backed by a writable runtime and configured mirror options.
- Happy path: mirror diagnostics such as frame drops are routed to a structured logger without exposing raw device paths in public status.
- Edge case: env value is blank, so composition uses the unavailable runtime and does not attempt socket/backend creation.
- Edge case: runtime dir has a trailing slash or already exists, so socket/control path derivation remains stable and under the runtime dir.
- Error path: runtime dir is relative, contains an unresolved `%t`, or cannot be created/accessed, so an input-seat launch fails before spawn as input-unavailable with local diagnostics.
- Error path: helper path env is missing, relative, unresolved, neither the fixed privileged wrapper path nor an allowed immutable Nix-store helper path, or points outside the packaged service closure, so the gate fails closed instead of constructing a partial runtime.
- Integration: production `sessiond.ts` wiring constructs a non-unavailable input-seat gate when both runtime-dir and helper-path env values are present, verified through a no-op/stub helper path without invoking OS uinput calls.
- Integration: Nix eval proves `korri-sessiond` and the backend helper are configured with the intended input-seat runtime-dir/helper contract and service closure, and each new check is exported from `product/systems/nixos/flake/checks.nix`.
- Integration: `product/systems/nixos/images/source-machine.nix` enables the input-seat module for AKA/source-host deployments, including helper-only `/dev/uinput`, separate event-node read access, the privileged helper wrapper, and runtime-dir environment.
- Integration: a runtime/unit harness or systemd-rendered environment check proves the actual sessiond process sees expanded absolute `KORRI_INPUT_SEAT_RUNTIME_DIR` and helper path values with no unresolved `%t`.
- Integration: a managed launch with `@korri:input-seat` activates the gate in an env-configured sessiond harness, while a launch without the companion still skips allocation.

**Verification:**
- A production-shaped AKA/source-host sessiond process with `KORRI_INPUT_SEAT_RUNTIME_DIR` and backend helper env no longer uses `createUnavailableSeatRuntime` for requested input-seat launches.

---

### U16. Deliver active launch mirror configuration to long-running Sunshine

**Goal:** Replace the dead `sourceEnv` path with a deployment-safe contract that lets a long-running Korri Sunshine service discover the active input-seat launch and mirror socket.

**Requirements:** R5, R8, R10

**Dependencies:** U12, U15

**Files:**
- Modify: `product/services/device/sessiond-input-seat.ts`
- Modify: `product/services/device/sessiond-pre-spawn.ts`
- Test: `product/services/device/sessiond-input-seat.test.ts`
- Test: `product/services/device/sessiond.test.ts`
- Modify: `product/vendor/sunshine-korri/README.md`
- Modify: `product/systems/nixos/modules/korri-daemon.nix`
- Test: `tools/testing/nix/korri-sunshine-input-seat-env-check.nix`
- Test: `tools/testing/nix/korri-sunshine-input-seat-mirror-patch-check.nix` if the U12 patch check needs contract fixture updates

**Approach:**
- Implement the U12-defined sidecar contract: `korri-sunshine.service` receives startup-time `KORRI_INPUT_SEAT_MIRROR_SOCKET` and `KORRI_INPUT_SEAT_RUNTIME_DIR` values, while sessiond writes the active-launch sidecar before emulator spawn and removes it on cleanup.
- Leave `mirrorTokenFactory` absent from production composition intentionally; `sessiond-input-seat.ts` should use its secure default token factory for production, while tests may inject deterministic tokens.
- Enforce the U12 contract's filename, payload fields (`launchId`, generation/timestamp, and unguessable `mirrorToken`), file owner, mode, stale-file behavior, and prohibition on arbitrary socket paths.
- Write sidecar state via restrictive temp file in the same directory plus atomic rename. The parent runtime dir must be mode `0700`, and sidecar/temp files containing the mirror token must be same-owner mode `0600`; no group-readable token file is allowed unless a later reviewed design changes the service identity model. Cleanup may remove only the canonical expected path under the runtime dir.
- Reject symlinks, hardlink surprises where detectable, unresolved `%t`, relative paths, and paths escaping the canonical runtime dir.
- Missing sidecar disables Korri mirroring without affecting Sunshine input.
- Remove the `sourceEnv` field from the pre-spawn gate handle type in `product/services/device/sessiond-pre-spawn.ts` and from the corresponding return value in `product/services/device/sessiond-input-seat.ts` once the stable sidecar path is authoritative. This was the per-launch env-injection path for an emulator child, not a valid path for long-running Sunshine. Verify that `product/services/device/sessiond.ts` does not read or merge `sourceEnv` into the emulator `LaunchSpec`.
- Add NixOS module wiring so the long-running Sunshine service has the stable mirror runtime/socket path in its environment when input-seat support is enabled, and prove sessiond and Sunshine resolve the same concrete runtime namespace/user contract.
- On launch stop, failure, force terminate, or pre-spawn rollback, clear the sidecar/control state before or alongside stopping the socket so stale Sunshine frames cannot target the next launch.

**Patterns to follow:**
- `product/systems/nixos/modules/korri-daemon.nix`
- `product/systems/nixos/modules/korri-sessiond.nix`
- `product/services/device/sessiond-input-seat.ts`
- `product/vendor/sunshine-korri/README.md`

**Test scenarios:**
- Happy path: pre-spawn gate start creates the active-launch sidecar with the expected launch id/generation and mirror token before child spawn, and the socket path remains the stable service-env path.
- Happy path: gate stop removes the active-launch sidecar and unlinks/stops the socket.
- Happy path: the NixOS Sunshine unit environment contains only stable runtime/socket configuration, not a per-launch launch id, and matches sessiond's concrete runtime namespace.
- Edge case: a stale sidecar from a previous crash exists; a new launch overwrites it before accepting controller frames.
- Edge case: Sunshine connects before the sidecar exists or after it is cleared; frames are absent or stale and do not write to seats.
- Error path: sidecar write fails, so the gate releases allocated seats and fails before emulator spawn.
- Error path: symlink, escaping, world-readable, or wrong-owner sidecar/control paths are rejected or repaired before Sunshine can consume them.
- Error path: frames missing the active mirror token or carrying a bad token are rejected before seat binding or writer calls.
- Error path: stale-launch frames from a previous launch are dropped by the TypeScript socket even if Sunshine reconnects late.
- Integration: Nix eval proves sessiond and `korri-sunshine.service` are configured to run as the same Unix user under this `0600` sidecar/token design, with the same intended input-seat runtime-dir contract/specifier.
- Integration: a runtime/unit harness or systemd-rendered environment check proves both actual processes see matching expanded absolute runtime paths with no unresolved `%t`.
- Error path: bad/missing-token diagnostics, structured logs, public status/SSE payloads, and committed acceptance artifacts do not include the mirror token value.

**Verification:**
- A long-running Sunshine service can discover the active launch mirror contract without being restarted per game and without relying on `sourceEnv` or emulator child environment variables.

---

### U14. Wire live Sunshine mirror frames to the active seat writer

**Goal:** Connect the U11 socket, U7 adapter, and U13 virtual-seat writer under sessiond's foreground launch lease without relying on unconsumed `sourceEnv` child-environment plumbing.

**Requirements:** R1, R4, R5, R6, R8, R10

**Dependencies:** U4, U7, U11, U12, U13, U16

**Files:**
- Modify: `product/services/device/sessiond-input-seat.ts`
- Modify: `product/services/device/sessiond.ts`
- Modify: `product/services/device/sessiond-pre-spawn.ts`
- Modify: `product/platform/input-seat/sunshine-input-seat-mirror-socket.ts`
- Test: `product/services/device/sessiond-input-seat.test.ts`
- Test: `product/services/device/sessiond.test.ts`
- Test: `product/platform/input-seat/sunshine-input-seat-mirror-socket.test.ts`

**Approach:**
- Start the Sunshine mirror socket only for an active launch whose input-seat policy selects the Sunshine source adapter.
- Treat `sourceEnv` as a dead-end for a long-running Sunshine process. The live path should be the production mirror configuration from U16 plus the session-owned socket and active-launch sidecar/control state, not env merged into the emulator child spec.
- For each accepted source-state frame, require the active mirror token, revalidate launch id, derive/bind source identity from trusted Sunshine controller context, and confirm current seat ownership before writing the validated gamepad state into the active seat writer.
- Drop or clear input during pre-spawn rollback, restore gaps, child exit, terminate, cleanup, explicit leave, and launch-id rollover. Stale queued frames must not write into a released seat or a newer launch's seat.
- Translate adapter seat transitions into managed-launch seat events/status using the redacted payload contract from U8.
- Stop the socket, clear active-launch control state, and release/clear writer state during terminal cleanup, pre-spawn rollback, and failed launch paths.

**Patterns to follow:**
- `product/services/device/sessiond-input-seat.ts`
- `product/services/device/sessiond.ts`
- `product/platform/input-seat/sunshine-input-seat-mirror-socket.ts`
- `product/platform/input-seat/sunshine-remote-input-source.ts`

**Test scenarios:**
- Happy path: a valid source-connected plus source-state frame reaches the writer for P1 while the launch is active.
- Happy path: source-disconnected transitions P1 to disconnected-reserved and stops writing new state without releasing the virtual seat.
- Happy path: reconnect for the same source resumes writing to the same seat.
- Edge case: a second source binds to P2 and writes independently without stealing P1.
- Edge case: queued accepted frames are dropped if the source leaves or the seat is rebound before the writer drains them.
- Error path: frames for a stale launch id are dropped and cannot affect the active launch.
- Error path: frames arriving after child exit, during restore, or after active-launch sidecar cleanup are dropped or converted into safe neutral state; they do not write into a new launch's seats.
- Error path: socket or adapter failure emits diagnostics and leaves emulator-visible seats alive until session cleanup.
- Error path: missing or bad mirror token is rejected before adapter binding or writer calls, and diagnostics do not include the token value.
- Error path: a frame cannot spoof another occupied or reserved source identity by supplying arbitrary source fields.
- Error path: a second connection cannot claim an already-bound source identity unless it satisfies the authenticated reconnect contract for the same token-bound Sunshine controller identity.
- Integration: explicit leave releases one seat while other seats and the foreground game session remain active.

**Verification:**
- A live source-host controller frame can flow through the socket and adapter into the correct active Korri virtual seat under sessiond ownership, and stale queued frames cannot cross leave/rebind/launch boundaries.

---

### U17. Author and verify the first deployed `@korri:input-seat` launch opt-in

**Goal:** Ensure Skate 3/RPCS3 validation exercises the new service instead of silently launching without the input-seat companion.

**Requirements:** R2, R6, R7, R11

**Dependencies:** U6

**Files:**
- Modify: `product/plugins/rpcs3/nix/nixos-module.nix`
- Test: `product/plugins/rpcs3/nix/module-check.nix`
- Test: `product/plugins/rpcs3/src/materializer.test.ts`
- Test: `product/apps/portal/api/stream/prepare.rpc-handler.test.ts` or `product/services/device/sessiond.test.ts` to prove the resolved companion reaches sessiond
- Update: `docs/acceptance/sessiond-remote-input-seats.md`

**Approach:**
- Prefer explicit cascade policy over emulator-name heuristics. The first code-owned opt-in should live in the RPCS3 launcher/platform default when `services.korri.input.inputSeat.enable = true`, with release/profile opt-down precedence preserved.
- Verify the resolved launch companions reach both RPCS3 materialization and sessiond managed launch. RPCS3 should write Evdev device names for `Korri Seat P*`, and sessiond should run the input-seat pre-spawn gate rather than skipping it.
- Keep hardware proof separate from code proof: U17 can prove that the companion is authored and propagated; U10 must still prove that the real AKA backend runs and creates seats.
- Record the exact config location and resolved policy in the acceptance document so future hardware validation cannot accidentally test the dormant path.

**Patterns to follow:**
- `product/plugins/rpcs3/nix/nixos-module.nix`
- `product/plugins/rpcs3/nix/module-check.nix`
- `product/platform/library/config/cascade-resolver.ts`
- `product/platform/library/config/cascade-resolver.test.ts`
- `product/plugins/rpcs3/src/materializer.ts`
- `product/plugins/rpcs3/src/materializer.test.ts`
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`

**Test scenarios:**
- Happy path: resolved Skate 3/RPCS3 launch companions include `@korri:input-seat` with `runtimeSupportsExtraSeats: true` when input-seat support is enabled.
- Happy path: RPCS3 materialization without explicit input config derives Evdev players bound to `Korri Seat P1` through `Korri Seat P4` when the companion is present.
- Edge case: release/profile opt-down to fewer players overrides the launcher-level default and materializes only the requested seats.
- Error path: missing companion is reported in the acceptance checklist as a no-go for input-seat E2E validation rather than a successful launch.
- Integration: a prepared remote launch carries the resolved companion through to sessiond so the pre-spawn gate is exercised.
- Integration: Nix module check proves the RPCS3 launcher includes `@korri:input-seat` only when the input-seat module is enabled.

**Verification:**
- Code verification: materializer tests derive `Korri Seat P*` Evdev names from the companion; cascade/prepare tests prove the companion reaches launch/sessiond surfaces; the RPCS3 Nix module check confirms module-level opt-in when input-seat support is enabled.
- Hardware pre-flight for U10: before Skate/RPCS3 validation begins on AKA, confirm that a managed launch status body contains a non-empty `inputSeats` section from the real backend, not a skipped gate or `input-unavailable` fallback.

---

### U10. Prove end-to-end behavior on RPCS3 and a second runtime

**Goal:** Validate the generic seat service on the AKA/source host against the original Skate 3/RPCS3 failure and one additional emulator/runtime.

**Requirements:** R7, R11, R12

**Dependencies:** U4, U6, U8, U9, U12, U13, U14, U15, U16, U17

**Files:**
- Update: `docs/acceptance/sessiond-remote-input-seats.md`
- Modify: `work/items/active/01KWTZ3DDBRFV3GAJFFDRR7Z57-sessiond-remote-input-seats/work.md`

**Approach:**
- Define a reproducible device validation checklist that records launch id, resolved `@korri:input-seat` policy, created seat identities, active-launch sidecar/control facts, mirror socket facts, managed-launch events, RPCS3 input profile facts, and observed controller behavior.
- Add an AKA deployment pre-flight section to the acceptance checklist. It must prove source-host readiness before any Skate/RPCS3 result counts: `services.korri.input.inputSeat.enable = true` is deployed, `korri-sessiond` sees an absolute `KORRI_INPUT_SEAT_RUNTIME_DIR`, `korri-sunshine` sees matching `KORRI_INPUT_SEAT_RUNTIME_DIR`/`KORRI_INPUT_SEAT_MIRROR_SOCKET`, `KORRI_INPUT_SEAT_BACKEND_HELPER` points to `/run/wrappers/bin/korri-uinput-seat-helper`, that wrapper is root-owned/setuid with an immutable Nix-store source in the sessiond service closure, the session user is not in the dedicated raw `uinput` group, created `Korri Seat P*` event nodes are readable by the emulator/session user through the separate event group, the `uinput` kernel module is loaded, and no stale `Korri Seat P*` devices exist before launch.
- Treat missing `@korri:input-seat` in the resolved launch as a validation failure, even if the game launches through the old path.
- Treat `input-unavailable` caused by a missing backend helper, missing runtime dir, or missing uinput permissions as a deployment/backend failure, not an E2E controller validation result.
- Before launch, verify `/dev/uinput` ownership/mode, absence of runtime-user raw `uinput` membership, privileged helper wrapper presence/source, `uinput` kernel module presence, absence of stale `Korri Seat P*` devices, created-seat event-node readability, and Sunshine service environment for stable mirror configuration.
- During pre-spawn, verify Korri seats exist before emulator spawn and the mirror socket/control state exists under the runtime dir.
- Validate Skate 3/RPCS3 remote launch with no controller wiggle, no emulator restart, and P1 input working on first boot.
- Validate session cleanup: sidecar removed, socket unlinked, and `Korri Seat P*` devices disappear before a second launch reallocates fresh seats.
- Validate one second emulator/runtime that exercises a different startup input path enough to prove the service boundary is generic. Candidate runtimes: RetroArch with a startup-scanning console core, PPSSPP, or Dolphin; record the chosen runtime in the acceptance document before validation begins.
- Capture any remaining runtime limitations as follow-up backlog items rather than expanding this plan.

**Execution note:** Device validation is the final gate, not a substitute for the unit/integration tests in earlier units.

**Patterns to follow:**
- `docs/acceptance/runtime-settings-protocol-contract.md`
- `docs/acceptance/sessiond-remote-input-seats.md`
- `work/items/parking-lot/01KWK4BCJ2BDM1JTVF7B3T2JF0-codify-all-skate-3-stream-fidelity-hacks-once-rpcs3-plugin-c.md`
- Device validation notes in existing work items under `work/items/active/`

**Test scenarios:**
- Hardware pre-flight: AKA's source-machine generation has input-seat enabled, `korri-sessiond` and `korri-sunshine` expose matching expanded runtime env, `KORRI_INPUT_SEAT_BACKEND_HELPER` points to `/run/wrappers/bin/korri-uinput-seat-helper`, the wrapper is root-owned/setuid with an immutable Nix-store source, the session user is not in `uinput`, created virtual seat event nodes are readable by the emulator/session user, the kernel module is loaded, and no stale `Korri Seat P*` devices exist before launch.
- Hardware proof: resolved Skate 3/RPCS3 launch includes `@korri:input-seat`, RPCS3 config names `Korri Seat P1`, and remote launch shows P1 controller input on first boot without manual input/restart.
- Hardware proof: `/proc/bus/input/devices` shows `Korri Seat P*` before emulator spawn and no stale `Korri Seat P*` devices after cleanup.
- Hardware proof: Moonlight controller input produces events on the Korri seat event node and reaches the game through RPCS3's Evdev binding.
- Hardware proof: remote disconnect reserves the same seat; reconnect restores control to that seat.
- Hardware proof: explicit leave releases P2 and a later player/source can take P2.
- Hardware proof: a second emulator/runtime launches with pre-created seats and no boot-scan controller race.
- Error path: temporarily disable or break the privileged helper wrapper or otherwise block `/dev/uinput`, attempt a managed RPCS3/Skate launch, and confirm launch fails with `input-unavailable` in managed-launch status before any emulator process spawns; restore permissions before continuing.
- Error path: missing backend helper env/path fails before emulator spawn and does not leave a helper process or virtual seats behind.
- Error path: missing active-launch sidecar or stale Sunshine frames do not write to any seat and produce local diagnostics.

**Verification:**
- The original controller boot race is fixed end-to-end on AKA/source host, and the generic seat service is proven outside RPCS3.

---

## System-Wide Impact

- **Interaction graph:** remote stream prepare, library cascade resolution, launch companion composition, game-stream runner, sessiond, input-seat runtime adapters, RPCS3 materialization, Moonlight/Sunshine source adapter, Sunshine service environment, active-launch sidecar/control state, and NixOS device-access modules all participate.
- **Error propagation:** seat allocation failures should propagate as input-unavailable/input-ambiguous launch failures with clear seat-specific messages and structured logs. Adapter disconnects during a live session should become seat state changes, not automatic process termination unless policy later requires it.
- **State lifecycle risks:** seats, mirror socket, and active-launch sidecar/control state must be correlated by launch id and released exactly once. Partial allocation, session-anchor, restore retries, force termination, and sessiond crashes must not leak virtual devices or tear down a newer launch's seats. Runtime adapters should keep uinput file descriptors owned by sessiond-owned processes with close-on-exec semantics so child processes cannot keep devices alive, and startup diagnostics should fail clearly if Korri-named orphan devices are detected.
- **API surface parity:** managed-launch status, managed-launch SSE events, session leave controls, and any CLI/agent status readers must all decode optional seat data consistently, using the same public/redacted payload contract. Public payloads must not include sidecar paths, socket paths, event nodes, raw source IDs, permission diagnostics, mirror tokens, or full environment values.
- **Integration coverage:** unit tests prove policy/state; sessiond integration tests prove ordering and cleanup; hardware validation proves uinput/Sunshine/RPCS3 timing.
- **Unchanged invariants:** LaunchSpec remains command/argv/env only; emulator plugins still own emulator profile authoring; sessiond remains the lifecycle authority; local physical-controller routing remains unchanged.

```mermaid
flowchart TB
    Cascade[Library cascade + launch.with]
    Prepare[Remote prepare intent]
    Runner[game-stream runner]
    Sessiond[sessiond lifecycle]
    SeatService[Input-seat service]
    Runtime[Seat runtime adapter]
    Sunshine[Sunshine native mirror]
    Socket[Mirror socket]
    Source[Sunshine/Moonlight source adapter]
    Writer[Virtual-seat writer]
    Emulator[Emulator plugin/profile]
    Status[Managed status/events]
    Nix[NixOS device access]

    Cascade --> Prepare
    Prepare --> Runner
    Runner --> Sessiond
    Sessiond --> SeatService
    SeatService --> Runtime
    Sunshine --> Socket
    Socket --> Source
    Source --> SeatService
    Source --> Writer
    Runtime --> Writer
    Cascade --> Emulator
    SeatService --> Status
    Nix --> Runtime
```

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Sunshine cannot eagerly create pads | Do not rely on Sunshine pad creation for emulator-visible seats; use Korri-owned uinput seats and treat Sunshine as an event source. |
| Pre-spawn hook changes sessiond lifecycle API | Make the hook optional and additive; preserve existing after-child/cleanup behavior with characterization tests. |
| RPCS3 device names diverge from runtime-created seat names | Define one stable seat identity contract and have both RPCS3 materialization and sessiond allocation consume it. |
| Extra P2-P4 seats affect a single-player game | Default full pool for reliability but allow release/profile opt-down through the cascade. |
| Partial allocation leaks devices | Treat required seat allocation as atomic: rollback successful seats on any failure. |
| `eventN` paths are unstable | Never persist event-node numbers as identity; resolve and report them as runtime facts only. |
| `/dev/uinput` permissions fail after deployment | Add NixOS assertions/checks and explicit hardware validation for `/dev/uinput` ownership, helper-only group access, and privileged wrapper installation. |
| Broad input-device permissions expose host keystrokes or raw injection | Prefer a dedicated helper-only uinput group, keep the runtime user out of that group, and expose only Korri Seat event nodes through a separate read group. |
| Remote input adapter can synthesize non-gamepad events or flood the host | Restrict virtual seat capability profiles to gamepad-only events and enforce per-seat rate limits plus event-code validation before writes. |
| Other local user or stale process injects mirror frames | Keep the socket under a private runtime dir and require the per-launch mirror token from U16/U14 before accepting frames. The token never appears in public payloads, logs, or committed acceptance artifacts. Same-UID appliance code is trusted and explicitly outside this feature's security boundary. |
| Sunshine mirror emits stale or malformed frames | Gate by launch id, strict-decode bounded NDJSON at the socket, and drop malformed/stale frames before adapter or writer state changes. |
| Socket seam exists but no native producer or writer is wired | Treat U12, U13, U14, U15, and U16 as ship blockers for the full boot-race fix; U11 alone is only the contract seam. |
| Production composition remains unavailable | U15 must replace `createUnavailableSeatRuntime()` when `KORRI_INPUT_SEAT_RUNTIME_DIR` is configured and must retain fail-closed behavior otherwise. |
| Python helper binary absent from sessiond closure in production deployment | Package the helper and Python interpreter into the NixOS sessiond service closure in U13/U15; add Nix eval checks that assert the helper path env/closure is present when input-seat is enabled. |
| AKA/source-machine profile does not enable input seats | U15 must opt `product/systems/nixos/images/source-machine.nix` into `services.korri.input.inputSeat` so source-host sessiond gets runtime-dir, the privileged helper wrapper, helper-only `/dev/uinput`, and event-node read access. |
| Long-running Sunshine never receives per-launch env | U16 uses stable service-start configuration plus active-launch sidecar/control state; do not rely on emulator child env or `sourceEnv`. |
| E2E launch silently skips input seats | U17 makes the `@korri:input-seat` companion explicit and U10 treats a missing resolved companion as a no-go. |
| Uinput devices survive or collide after crashes | U13 requires close-on-exec fd ownership, identity collision detection, and cleanup validation before hardware proof. |
| Seat leave endpoint can be abused to kick players | Scope leave requests to launch id and caller authority, and require bound launch-scoped source identity or operator identity before releasing an occupied seat. |
| Seat reservation without user identity is incomplete | Use launch-scoped source identity for this slice; preserve disconnect-vs-leave semantics while deferring richer cross-device participant/user identity. |
| Scope balloons into local-controller routing | Keep local physical routing explicitly deferred and isolated in the already-captured backlog item. |

---

## Documentation / Operational Notes

- Add an acceptance document for the hardware validation contract because the final proof depends on physical devices and a remote stream.
- Log detailed diagnostic information locally where needed, but define explicit public/redacted fields for wire status, SSE events, CLI output, and agent-readable status. Raw device paths, broad permission diagnostics, and unredacted source identifiers stay local-only unless a caller has an operator diagnostic path.
- Device validation should record the resolved cascade policy, launch id, redacted active-launch sidecar/control state, redacted mirror socket fact, seat event sequence, emulator-visible input facts, uinput permission mode/group, Sunshine service mirror environment presence, and any orphan-seat startup diagnostics so future regressions can be diagnosed without repeating the full investigation. Committed acceptance docs must not include host-local absolute paths, raw event nodes, raw source identifiers, mirror tokens, or full Sunshine environment dumps.
- If a second-runtime validation reveals emulator-specific profile work, capture it separately unless it blocks proving the generic seat service.

---

## Alternative Approaches Considered

- **Wait for Sunshine's virtual pad before launching RPCS3:** rejected as the product architecture because Sunshine pads are lazy and connection-timing-dependent; it also fails disconnect reservation.
- **RPCS3-specific delay/wiggle/restart workaround:** rejected because it fixes one symptom while preserving the timing race for other boot-scan emulators.
- **Persistent host-level P1-P4 pool:** rejected based on user preference for per-game session ownership and lower always-present device side effects.
- **Default one seat with opt-up:** rejected because drop-in multiplayer and boot-scan emulators should work unless a release opts down, not only when metadata opts up.
- **Decide local physical-controller routing now:** rejected as scope expansion; the separate backlog item preserves the question.
- **Direct Bun FFI ioctl backend inside sessiond:** rejected for the first production slice because the repo already has a proven Python uinput helper pattern and no existing Bun-owned uinput ioctl layer. Keeping raw uinput mechanics in a helper lowers sessiond coupling and closure surprises.

---

## Success Metrics

- Skate 3/RPCS3 remote launch has working P1 input on first boot with no manual wiggle and no emulator restart.
- Managed-launch status/events show the input-seat lifecycle from allocation through cleanup for every remote launch using the service.
- Seat allocation failures are visible before emulator spawn and leave no lingering virtual devices.
- A second emulator/runtime validates that the service is a generic sessiond capability, not a hidden RPCS3 special case.

---

## Sources & References

- **Origin item:** `work/items/active/01KWTZ3DDBRFV3GAJFFDRR7Z57-sessiond-remote-input-seats/item.md`
- Related backlog: `work/items/parking-lot/01KWK4BCJ2BDM1JTVF7B3T2JF0-codify-all-skate-3-stream-fidelity-hacks-once-rpcs3-plugin-c.md`
- Deferred local/remote routing item: `work/items/parking-lot/01KWTW9DBY5NN34BVN7CMXQ8W3-explore-unified-local-and-remote-controller-routing-through-.md`
- RPCS3 input convergence note: `work/items/active/01KWM7Q408P6VW6RWR66SE6R3R-rpcs3-input-config-authoring/convergence-note.md`
- sessiond lifecycle: `product/services/device/sessiond.ts`
- production sessiond composition: `product/services/device/sessiond-plugin-composition.ts`
- uinput helper precedent: `product/plugins/remap/packages/korri-remap-bridge/native-driver.py`
- uinput helper packaging precedent: `product/plugins/remap/nix/remap-bridge.nix`
- source-machine deployment profile: `product/systems/nixos/images/source-machine.nix`
- input-seat NixOS module: `product/systems/nixos/modules/korri-input.nix`
- lifecycle hooks: `product/platform/plugin/session-lifecycle.ts`
- managed-launch protocol: `product/platform/library/sessiond-managed-launch-protocol.ts`
- input discovery: `product/platform/input/native/discover-devices.ts`
- InputPlumber resolver: `product/platform/input/native/inputplumber-virtual-gamepad.ts`
- cascade fields: `product/platform/library/config/inheritable-fields.ts`
- RPCS3 input materialization: `product/plugins/rpcs3/src/materializer.ts`
- Sunshine input-seat source adapter: `product/platform/input-seat/sunshine-remote-input-source.ts`
- Sunshine mirror socket seam: `product/platform/input-seat/sunshine-input-seat-mirror-socket.ts`
- Linux uinput docs: `https://www.kernel.org/doc/html/latest/input/uinput.html`
- libevdev docs: `https://www.freedesktop.org/software/libevdev/doc/latest/`
