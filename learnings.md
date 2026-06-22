# Institutional Learnings — `@korri:remap` Refactor Planning

## Search Context
- **Feature/Task**: Refactor the just-landed CDP input bridge API into a general launch-scoped `@korri:remap` launch companion. Preserve strong isolation, adopt the `launch.with` provider-map convention used by gamescope, hide CDP/Chrome implementation details, and support multi-controller bindings + gamepad-to-keyboard / gamepad-to-gamepad outputs.
- **Keywords Used**: plugin composition, launch lifecycle, launch.with, provider-map, launch companion, session-lifecycle-hook, input bridge, gamescope, browser runtime, CDP, isolation, uinput, controller, gamepad, sessiond, cascade policy, explicit intent
- **Files Scanned**: 47 files across `docs/solutions/{architecture-patterns,design-patterns,best-practices,integration-issues,runtime-errors,tooling-decisions,workflow-issues}` plus live plugin source
- **Relevant Matches**: 9 files

---

## Critical Patterns

`docs/solutions/patterns/critical-patterns.md` does not exist in this repo.

---

## Relevant Learnings

### 1. Gamescope as Plugin-Owned Composition (`launch.with` is the canonical companion convention)
- **File**: `docs/solutions/architecture-patterns/gamescope-as-plugin-owned-composition-2026-06-17.md`
- **Module**: plugins + launch-composition + nix-composition
- **Problem Type**: `architecture_boundary`
- **Relevance**: `@korri:remap` must use exactly this convention. This is the team's documented and landed pattern for launch companions — the gamescope plugin is the reference implementation.
- **Key Insight**:

  The platform owns: generic provider maps, plugin registries, launch companion dispatch, session lifecycle hook points, and structured diagnostics.

  The plugin owns: the provider id, the policy payload shape, the launch-wrapping behaviour, the runtime-control protocol, and its Nix artifacts.

  Config authors compose through `launch.with` entries keyed by provider id:

  ```yaml
  launch:
    with:
      "@korri:gamescope":
        enable: true
        backend:
          type: wayland
  ```

  The platform decodes that map generically. Provider-specific validation and folding belong to the enabled plugin. **Generic Korri code (platform, services, apps, themes, Nix modules) must not name the plugin.**

  When an authored launch references a provider that is absent, disabled, or rejects its payload, dry-run and actual launch return structured `LaunchCompanionDiagnostic` before process spawn. The `composeLaunchCompanions` function in `product/platform/plugin/launch-companion.ts` is the dispatch surface — it already handles `PluginMissing`, `PluginDisabled`, `CapabilityMissing`, `OperationFailed`, and `InvalidOperationResult` with typed diagnostics.

  **The current CDP bridge uses `launchMetadata.annotations["@korri:cdp-input-bridge"]`** — not `launch.with`. The refactor to `@korri:remap` is specifically about migrating from the annotations-at-runtime pattern to the `launch.with` config-layer pattern. This is a meaningful seam change: `launch.with` entries are evaluated at compose time (preflight, dry-run) while annotations are only read at `afterChildRunning`.

  Keep multi-plugin control coordination out of examples until Korri has a generic authored-control model; authors express desired plugin composition directly.

- **Severity**: high

---

### 2. Explicit Cascade-Folded Policy Over Wrapper-Side Env/Argv Heuristics
- **File**: `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`
- **Module**: korri/shared/library/config + launch composition
- **Problem Type**: `design_pattern`
- **Relevance**: The `@korri:remap` policy schema should make all binding intent explicit — no inferring controller type from device names at compose time, no sniffing argv/env to decide which target to use. This pattern has bitten three separate subsystems (gamescope flags, input-bus source inference, focus-style inference).
- **Key Insight**:

  **Make intent explicit in cascade policy fields.** When a wrapper or companion needs to know something about the child it launches, add that knowledge as a named, cascade-folded field on the policy. The component that knows a fact records it in the policy at construction time; the companion emits strictly from resolved policy.

  ```
  Caller knows fact → sets field in policy → companion emits from policy
  (never: composer infers fact from argv/env/device name at compose time)
  ```

  For `@korri:remap`, this means:
  - Each binding explicitly names its `source` (device selector) and `target` (output type + parameters).
  - The output type (`cdp-key`, `uinput-gamepad`, future types) is a declared field, not an inference from the game's launch argv.
  - The "mapping preset" is a named string in policy, resolved by the plugin. The cascade can override it per-game, per-launcher, or globally via inheritable fields.
  - Provide a correct-for-typical-deployment default at the floor of the cascade. Callers in the common case need not specify anything beyond `enable: true`.

  **Delete the old heuristic when you ship the new field.** Leaving an inference path alongside a new explicit policy field creates a parallel universe where both can disagree and the loser is silent.

- **Severity**: medium

---

### 3. Session Lifecycle Hook Contract — `afterChildRunning` + `stopBeforeCleanup`
- **File**: `product/platform/plugin/session-lifecycle.ts` (live source) + `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`
- **Module**: product/platform/plugin + tools/device/sessiond
- **Problem Type**: `architecture_pattern`
- **Relevance**: The `@korri:remap` bridge process (whether CDP or uinput) must integrate via `KorriSessionLifecycleHook`. The existing CDP bridge's integration shape is the reference — the refactor should keep this integration point and extend it, not replace it.
- **Key Insight**:

  The `KorriSessionLifecycleHook` interface provides:
  - `afterChildRunning({ launchId, spec, launchMetadata, terminateLaunch })` — start the bridge after the game process is running. Returns a handle with `label`, `resource`, and `stopBeforeCleanup`.
  - `cleanup({ launchId, processGroupId, launchMetadata })` — post-exit cleanup.
  - `failurePolicy: "fail-launch" | "warn"` — the current CDP bridge uses `"fail-launch"` (fail closed). Keep this for `@korri:remap`.

  The sessiond foreground event sequence is:
  ```
  child-running → (game runs) → child-exited → restoring → home-ready|idle-ready
  ```
  The bridge process must be stopped in `stopBeforeCleanup` so it does not outlive the session and does not convert input events after the game has exited (critical for returning to the Korri UI without phantom key events).

  **Important distinction**: the `launch.with` compose operation happens at preflight/dry-run time (wraps the LaunchSpec); the session lifecycle hook fires at `afterChildRunning` time. `@korri:remap` with uinput output needs **both**: compose-time validation (does uinput access exist? is the mapping name known?) and runtime hook (start the bridge process when the game is running).

  The protocol evolution rule (from sessiond operator model): capability flags over schema versioning. When `@korri:remap` adds a new output type (e.g. `uinput-gamepad`), encode daemon support as a capability flag, not a schema version bump.

- **Severity**: high

---

### 4. Steam Input Needs `/dev/uinput` Group Access — Handle Both Device States
- **File**: `docs/solutions/integration-issues/steam-uinput-permissions-block-virtual-xinput-2026-06-13.md`
- **Module**: korri-steam / product/systems/nixos/modules/korri-steam.nix
- **Problem Type**: `integration_issue`
- **Relevance**: `@korri:remap` with `gamepad-to-gamepad` output must create virtual input devices via uinput. This is a privilege-escalation relative to the current CDP-only bridge (which deliberately avoids uinput). The permission pattern has an established form in this repo.
- **Key Insight**:

  Virtual input device creation is a two-part path: (1) physical input visible → (2) permission to open `/dev/uinput` and issue ioctls. A plugin that can enumerate the physical device but cannot create the virtual one will fail silently from the game's perspective.

  The durable fix shape from the Steam case:
  ```sh
  # Ensure uinput is accessible to the korri group
  chgrp input /dev/uinput 2>/dev/null || true
  chmod 0660 /dev/uinput 2>/dev/null || true
  ```

  Handle both device states: the character device may already exist (normal boot) or may need to be created from the kernel-reported major/minor pair (stale/missing node). Both paths must end with the same ownership/mode policy.

  The NixOS module approach: use `services.udev.extraRules` or `boot.extraModprobeConfig` to set uinput group membership at boot. Do not rely on a pre-exec shell script alone.

  **For `@korri:remap`**: the `@korri:remap` Nix module should declare a `capabilities.uinput` flag (or similar) that enables the uinput permission wiring. Image compositions that do not need gamepad-to-gamepad output should evaluate cleanly without it. The platform generic code should not know which capability gates uinput — the plugin's Nix module declares it.

  **Validation checklist**:
  1. Build the module check: `nix build .#checks.x86_64-linux.korri-remap-module`
  2. Verify node ownership: `ls -l /dev/uinput` (expect `crw-rw---- root input`)
  3. Confirm no new virtual devices persist after session ends
  4. Confirm the selected source is the InputPlumber virtual controller, not a raw source device

- **Severity**: high

---

### 5. Input Isolation at Compositor/Session Boundaries — Per-Game Gamescope Wrapping Breaks Input
- **File**: `docs/solutions/architecture-patterns/steam-inside-gamescope-preserves-steam-input-2026-06-15.md`
- **Module**: Bandai Steam launches
- **Problem Type**: `architecture_pattern`
- **Relevance**: `@korri:remap` runs as a sidecar that dispatches synthesized input to a specific process. The bridge must remain in the same session scope as the game. Compositor/session boundaries that move the game to a different input domain will silently break the bridge. This is the same failure topology as Steam Input + per-game Gamescope.
- **Key Insight**:

  Steam Input is part of the Steam session architecture — not just an input device visible to the game. Per-game nested Gamescope moves the game across a focus/input boundary that Steam Input does not bridge reliably. The A/B isolation was definitive:

  - normal Steam/no Korri wrapper: controls worked
  - Korri wrapper with inline Gamescope (per-game): **controls failed**
  - Steam inside Gamescope (session-level): controls worked

  **For `@korri:remap`**: the CDP keyboard dispatch sends events to a specific page via the Chrome DevTools Protocol over localhost — this is session-agnostic as long as the Chromium process is alive and addressable. But the evdev source path (reading `/dev/input/event*` via evtest) and the uinput sink path (writing `/dev/uinput`) are kernel-seat-scoped. If `@korri:gamescope` and `@korri:remap` are composed together (game inside Gamescope, remap bridge as sidecar), verify that the uinput device created by the remap bridge lands in the seat the game reads from. A uinput device created outside a Gamescope session may not appear inside it.

  **Prevention**: When `launch.with` composes both `@korri:gamescope` and `@korri:remap`, document which output types are safe across the Gamescope boundary (`cdp-key` over localhost TCP — safe; `uinput-gamepad` seat injection — verify per-target).

- **Severity**: high

---

### 6. Boot-Scoped Isolation Contract — Plugin Processes Must Not Escape Session Scope
- **File**: `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`
- **Module**: nix/modules/korri-server
- **Problem Type**: `architecture_pattern`
- **Relevance**: The `@korri:remap` bridge process is a session-scoped sidecar. The lessons about fail-closed trust contracts, private runtime dirs, and explicit ownership are directly applicable to designing the bridge's lifecycle boundaries.
- **Key Insight**:

  When a sidecar process must share private runtime state with a session runner, model the lifecycle as an explicit option and derive paths/ownership from a single authoritative source. Fail closed at **evaluation** (Nix assertions), not at **runtime** (service startup errors).

  Key patterns for `@korri:remap`:

  1. **Explicit process ownership**: the bridge process is owned by the session lifecycle hook. The hook starts it in `afterChildRunning` and stops it in `stopBeforeCleanup`. The hook holds the only reference; no orphan processes can linger.

  2. **Conservative hardening for long-lived bridge processes**: if `@korri:remap` runs as a separate binary (like `korri-cdp-input-bridge` does today), apply systemd-level sandboxing to it: `NoNewPrivileges = true`, `PrivateNetwork = true` (for CDP-only; uinput targets need network off), `RestrictSUIDSGID = true`, `LockPersonality = true`. The bridge runs for the full game session — it has a larger attack surface than a one-shot command.

  3. **Fail closed on missing preconditions**: If the mapping name is unknown, the source device is missing, or the CDP target doesn't respond within `attachTimeoutMs`, fail the launch (if `failClosed: true`) rather than letting the game start without input. The current CDP bridge already does this; preserve it in `@korri:remap`.

  4. **The env injection seam**: if the bridge command is configurable via env var (`KORRI_CDP_INPUT_BRIDGE_COMMAND` in the current implementation), keep that seam for `@korri:remap`'s binary — it allows the NixOS module to inject the store path without hardcoding it in the plugin source.

- **Severity**: medium

---

### 7. Gamescope Runtime Control Contract — Socket Protocol Shape for Sidecar Bridges
- **File**: `docs/solutions/architecture-patterns/gamescope-runtime-control-contract-2026-06-02.md`
- **Module**: korri/shared/gamescope-control
- **Problem Type**: `architecture_pattern` (inferred — no explicit `problem_type` in frontmatter)
- **Relevance**: If `@korri:remap` eventually needs a live-control protocol (pause, remap swap, diagnostics) analogous to Gamescope's control bridge, this is the established shape. Also relevant because a remap companion co-composed with Gamescope must not race writes to compositor state.
- **Key Insight**:

  The Gamescope control contract rules that apply to any sidecar bridge:

  - The socket (or channel) is **local-only and owner-only by default**.
  - **Mutations serialize through a FIFO queue** — no concurrent writes from multiple clients.
  - A command reports `applied` only after required readback matches (not just after send).
  - Explicit non-success states: `unsupported`, `unimplemented`, readback mismatch, timeout, backend absence.
  - Events are first-class server pushes with monotonic sequence numbers.
  - Sessiond remains the lifecycle truth. The bridge reports control-plane readiness and state; it does not decide foreground session ownership.

  For `@korri:remap` v1, a runtime control protocol is likely out of scope. But when it arrives, model it as a local Unix socket or loopback TCP (not a shared bus), and serialize binding changes through a single queue to prevent input state corruption.

  **Current bridge diagnostic shape** (from `diagnostics.ts` in the CDP bridge): structured diagnostics with typed reasons, not log lines. Extend this for `@korri:remap` — the policy violation, device selection, and bridge attachment diagnostics should all be typed and reportable through `LaunchCompanionDiagnostic`.

- **Severity**: medium

---

## Recommendations

### 1. Adopt `launch.with` but preserve the session lifecycle hook

The refactor has two independent seams to move:

- **Config seam**: migrate from `launchMetadata.annotations["@korri:cdp-input-bridge"]` to `launch.with."@korri:remap"` with an Effect Schema-decoded policy. This makes `@korri:remap` visible at preflight and dry-run time (the `launch.compose` operation validates the policy and checks capability before any process spawns).
- **Runtime seam**: keep `KorriSessionLifecycleHook.afterChildRunning` as the process launch point. This is correct — the bridge process needs a live game process before it can attach to a CDP page or open a source device.

Do not collapse these into one. The compose operation validates; the lifecycle hook runs.

### 2. Define the `@korri:remap` policy schema in abstract terms — hide transport details

The policy schema should not expose CDP vocabulary. Instead:

```yaml
launch:
  with:
    "@korri:remap":
      enable: true
      bindings:
        - source:
            preference:
              names: ["Microsoft Xbox Series S|X Controller"]
          mapping: "yfs-default"
          target:
            type: cdp-key        # ← abstract output type, not "CDP"
            urlPattern: "index.html"
            port: 9333
        - source:
            preference:
              names: ["Player 2 Controller"]
          mapping: "gamepad-mirror"
          target:
            type: uinput-gamepad  # ← second output type
```

The plugin schema owns what `type: "cdp-key"` means internally. Generic platform code, Nix modules, and docs only see the `@korri:remap` provider id and `enable: true/false`.

### 3. For `uinput-gamepad` output, declare uinput capability in the plugin's Nix module

Follow the pattern from `korri-steam.nix`. The `@korri:remap` Nix module should:

1. Declare a `capabilities.uinput` opt-in option (or derive it from the presence of any `uinput-gamepad` target in the default config).
2. Add a udev rule that sets `/dev/uinput` to `crw-rw---- root:input` at boot.
3. Ensure the bridge process runs as a user in the `input` group.
4. Add Nix assertions that `capabilities.uinput = true` is required when any enabled launch config uses `type: "uinput-gamepad"`.

Fail at Nix evaluation, not at runtime.

### 4. Apply the explicit cascade policy rule to multi-controller bindings

Each binding in the `bindings` array is a fully-specified intent: source selector + mapping name + output type. No component downstream of the policy resolver infers any of these from device names, argv, or environment variables. The plugin is the only component that reads the evdev device characteristic file — it reads it to *select* among candidates, not to *infer* the output type.

### 5. Verify the seat boundary when composing with `@korri:gamescope`

Before shipping multi-plugin composition of `@korri:remap` + `@korri:gamescope`:

- For `cdp-key` output: safe — CDP is loopback TCP, not seat-scoped. The Chromium process is inside Gamescope and still reachable on localhost.
- For `uinput-gamepad` output: **verify**. A uinput device created by a process outside the Gamescope session may not be visible inside it. This may require creating the uinput device before Gamescope starts (i.e., in `launch.compose` not `afterChildRunning`) or finding a Gamescope-aware injection path.

Capture this as a validation gate in the acceptance criteria before multi-binding + gamescope ships.

### 6. Keep `failClosed: true` and `stopBeforeCleanup` as defaults

The current CDP bridge fails launch on bridge startup failure (`failurePolicy: "fail-launch"`) and stops cleanly before session cleanup. Both must survive the rename. The remap bridge must not leave synthetic input events firing after the game exits — the first input event on the Korri UI after a session ends would otherwise produce phantom key presses.

### 7. Preserve the `KORRI_REMAP_BRIDGE_COMMAND` env seam

The NixOS module will inject the store path of the remap bridge binary via env. Keep this seam for test doubles — the session lifecycle hook tests can inject `false` (the `processManager === false` branch) to exercise the hook logic without spawning a real process.
