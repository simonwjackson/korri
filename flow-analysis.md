# Flow Analysis: `@korri:cdp-input-bridge` → `@korri:remap`

_Generated against trunk @ 2f27d32d. Reviewer role: UX / architecture gap analysis._

---

## Codebase Context

Before mapping flows, key constraints surfaced from Phase 1:

| Component | Location | What it does |
|---|---|---|
| `cdp-input-bridge` session hook | `product/plugins/cdp-input-bridge/src/session-lifecycle-hook.ts` | Spawns `korri-cdp-input-bridge` sidecar in `afterChildRunning` |
| Policy / annotation source | `launchMetadata.annotations["@korri:cdp-input-bridge"]` | Not in `launch.with` |
| Named mapping table | `product/plugins/cdp-input-bridge/src/mapping.ts` | `"yfs-default"` and `"none"` presets |
| Launch companion seam | `product/platform/plugin/launch-companion.ts` | `launch.compose` operation; returns a mutated `LaunchSpec` |
| Gamescope companion | `product/plugins/gamescope/src/launch-companion/` | Wraps command; does spec-transformation, not sidecar spawning |
| Session hook registry | `product/plugins/index.ts → firstPartySessionLifecycleHookFactories` | Hooks are registered by plugin id; enabled via env |
| Hook start contract | `product/platform/plugin/session-lifecycle.ts → KorriSessionLifecycleHookStartRequest` | Receives `spec`, `launchMetadata` — **not `launch.with`** |
| `composeLaunchCompanions` call site | `product/platform/control/korri-control-live.ts:298` | Runs at launch-config time; receives `resolved.launchCompanions` (= `launch.with` map) |
| Safety contract | `product/plugins/cdp-input-bridge/README.md` | Forbids `ydotoold`, `/dev/uinput`, raw source gamepads, profile switching |

**The single most load-bearing architectural fact:** `KorriSessionLifecycleHookStartRequest` receives `launchMetadata` but _not_ `launch.with` / `launchCompanions`. There is **no existing seam** that delivers `launch.with` config to a session lifecycle hook. This is the central gap the plan must resolve before any other design decision is meaningful.

---

## User Flows

### Flow 1: Current CDP Bridge (authoritative baseline)

```
Author config ──► launchMetadata.annotations["@korri:cdp-input-bridge"]
                   │ { enable: true, cdpPort: 9333, mapping: "yfs-default", … }
                   │
                   ▼
korri-control-live: composeLaunchCompanions
   (skips CDP bridge — it has no launch.compose handler)
                   │
                   ▼
sessiond: runManagedLaunch → spawn game child
                   │
                   ▼ afterChildRunning
CDP bridge lifecycle hook reads launchMetadata.annotations
   → resolveInputPlumberVirtualGamepad (single device)
   → spawn korri-cdp-input-bridge
       ├─ waitForBridgeReady (stdout "korri-cdp-input-bridge: ready")
       ├─ evtest --grab /dev/input/eventN  ← grabs InputPlumber virtual controller
       └─ WebSocket → Chromium CDP → Input.dispatchKeyEvent
                   │
                   ▼ stopBeforeCleanup
   bridge.stop() → SIGTERM → evtest exits → releaseAll keys
```

**Terminal states:** bridge ready (nominal), bridge exits unexpectedly → `terminateLaunch()` (fail-closed), bridge never becomes ready → timeout → fail-launch.

---

### Flow 2: Proposed `@korri:remap` — Happy Path (as described)

```
Author config ──► launch.with["@korri:remap"]
                   │ { enable: true,
                   │   p1: { dpad: { down: "key.down" },
                   │         stick: { left: "key.left" } } }
                   │
                   ▼
composeLaunchCompanions
   → @korri:remap launch.compose handler
   → ???  (what does the spec mutation look like?)
                   │
                   ▼
sessiond: spawn game
                   │
                   ▼ (if remap is a session lifecycle hook)
How does the hook read launch.with config?
   (current contract: no seam for this)
```

This flow has **no defined terminal state** for the runtime side — the plan must specify whether the remap process is:
- (A) A launch-compose wrapper injected into the `LaunchSpec` command
- (B) A session lifecycle sidecar that reads config from a new seam
- (C) Both (like gamescope: compose + session hook)

---

### Flow 3: Multiple Controllers

```
launch.with["@korri:remap"]:
   p1: { dpad: { down: "key.down" } }
   p2: { dpad: { down: "key.x" } }
                   │
                   ▼
resolveInputPlumberVirtualGamepad() ← currently returns ONE device
How are two device slots resolved?
   - By index among all InputPlumber virtual gamepads?
   - By named preference per slot?
   - By stable slot assignment from InputPlumber?
```

---

### Flow 4: Gamepad-to-Gamepad Binding

```
launch.with["@korri:remap"]:
   p1: { btn: { south: "p1.btn.east" } }  ← remap A → B
                   │
                   ▼
Output target is a virtual gamepad, not a keyboard key.
Current mechanism to emit to a gamepad device: uinput (FORBIDDEN)
                   │
                   ▼
???
```

No existing mechanism in this codebase produces virtual gamepad output without uinput or InputPlumber profile switching, both of which are banned by the current safety contract.

---

### Flow 5: Kebab-Case Dot-Path Binding Parsing

```
"p1.dpad.down: key.down"
             │
             ▼
Parse source: player slot (p1) → input type (dpad) → direction (down)
  → resolve to evdev code: BTN_DPAD_DOWN? ABS_HAT0Y negative? Both?

Parse target: key → direction (down)
  → resolve to output: ArrowDown? KEY_DOWN? CDP event? uinput?
```

The current bridge has a pre-built mapping table (BTN_DPAD_DOWN → action-id → CDP key binding). The new dot-path syntax must define a canonical vocabulary and a resolution algorithm that doesn't fall back to the named-preset model.

---

## Gaps

### Critical — Blocks Implementation or Creates Architectural Incoherence

**Gap C-1: Missing seam between `launch.with` and session lifecycle hooks.**

`KorriSessionLifecycleHookStartRequest` carries `launchMetadata` but not `launchCompanions` (i.e., `launch.with`). If `@korri:remap` stores its policy in `launch.with`, the lifecycle hook cannot read it without a new field in the start request. The plan must specify one of:
- Extend `KorriSessionLifecycleHookStartRequest` with `launchCompanions?: LaunchCompanionMap`
- Have the launch.compose handler inject the policy into `launchMetadata.annotations` (a compile-time-to-runtime bridge)
- Make `@korri:remap` purely a `launch.compose` wrapper (no sidecar lifecycle hook), which changes the runtime model fundamentally

Without resolving this, the config location and the activation model cannot both be changed at once without a new contract on the hook start request.

---

**Gap C-2: Gamepad-to-gamepad output has no permitted mechanism.**

The spec requires `gamepad-to-gamepad bindings`. The only mechanisms for emitting gamepad events are:
- `uinput` virtual device — explicitly forbidden by the existing safety contract
- InputPlumber profile switching — explicitly forbidden
- Forwarding to an already-running virtual device that InputPlumber owns — not a defined API

The plan must either:
1. Define a specific permitted mechanism (e.g. InputPlumber's emit-event IPC, if it exists)
2. Narrow the scope: gamepad-to-gamepad only works if the target is the InputPlumber virtual gamepad the game already reads (i.e. "passthrough with remap")
3. Explicitly relax the safety contract for this case and document why it is still isolated

Leaving this unspecified means the implementation team will either violate the safety contract or discover the feature is impossible and revert it late.

---

**Gap C-3: Non-browser keyboard injection mechanism is undefined.**

The current CDP bridge sends keyboard events only to a Chromium page via WebSocket — it is browser-scoped by design. If `@korri:remap` targets non-browser games (native emulators, native PC games), `key.down` must reach the X11/Wayland focus window or the application's input event node. The only known mechanisms are:
- `ydotool` / `xdotool` (host-seat virtual keyboard) — explicitly **forbidden**
- `uinput` virtual keyboard — explicitly **forbidden**
- CDP (browser-only, and the spec bans CDP terms in authored config)

If `@korri:remap` is genuinely general-purpose (not browser-only), the plan must name a permitted keyboard injection path for native targets. If it is still browser-only under the hood, that constraint must be stated so authors know `key.*` targets only work for Chromium-launched games.

---

### Important — Significantly Affects UX or Implementation Consistency

**Gap I-1: Execution model of `@korri:remap` as a launch.compose companion.**

Gamescope as a `launch.compose` companion returns a mutated `LaunchSpec` (wraps the command). Input remapping is a runtime side-process that must start _after_ the game child launches. These two requirements are incompatible if `@korri:remap` is purely a `launch.compose` companion.

Likely resolution: `@korri:remap` uses a wrapper-binary model — the compose step injects `korri-remap <binding-args> -- <game-command>` so the remap binary is the top-level process, which forks the game. But this has implications:
- The game's PID is a child of `korri-remap`, not a direct child of sessiond. Does sessiond's process-group-id tracking and cleanup still work correctly?
- `korri-remap` must survive the game exiting long enough to release all keys (the current bridge does `releaseAll` in `evtestProcess.once("exit")`). Is that guaranteed?
- If `korri-remap` crashes before the game, does the game also exit? Under what conditions?

The plan must specify which execution model is chosen (wrapper vs sidecar), because they have different contracts with sessiond.

---

**Gap I-2: Multi-controller source resolution.**

`resolveInputPlumberVirtualGamepad` returns a single device. The spec says "support multiple controllers" with `p1`, `p2` slots. The plan must specify:
- How many InputPlumber virtual gamepads can exist simultaneously on the target hardware (Sobo/SM8550)
- How `p1` vs `p2` is assigned — by index among virtual gamepads? by explicit preference per slot in config? by a stable InputPlumber slot ID?
- Whether the "ambiguous" error state changes meaning (two gamepads found is now expected for p2 support, not an error)

Without this, multi-controller config cannot be authored correctly.

---

**Gap I-3: Dot-path vocabulary is not defined.**

The binding syntax `p1.dpad.down: key.down` requires a canonical vocabulary for both the source (input) side and the target (output) side. Missing:
- **Source paths:** Does `p1.dpad.down` map to `BTN_DPAD_DOWN`? To `ABS_HAT0Y < 0`? To both simultaneously (current bridge does both for "arrow-down")?
- **Axis paths:** What is `p1.stick.left`? Does it mean the left analog stick leftward direction? What is the threshold model (press/release hysteresis)?
- **Target keyboard paths:** Does `key.down` mean `ArrowDown`? Does `key.z` mean the Z key? Is the vocabulary the DOM key names (`ArrowDown`, `KeyZ`) or the Korri-defined action IDs?
- **Target gamepad paths:** What is `p1.btn.south`? The Xbox A button? The evdev `BTN_SOUTH`?

Without this vocabulary, authors cannot write correct bindings and validators cannot check them at decode time. The plan must produce a schema-checkable enum or pattern for both sides.

---

**Gap I-4: YFS authored-config migration is not addressed.**

YFS currently uses `launchMetadata.annotations["@korri:cdp-input-bridge"]` with `mapping: "yfs-default"`. The plan says "no profiles/presets" — meaning `yfs-default` must be expanded into explicit dot-path bindings in the new format. But:
- Who updates the YFS plugin config?
- Does `@korri:cdp-input-bridge` remain registered alongside `@korri:remap` during a transition period?
- What is the cutover plan if both exist? Does `@korri:remap` take precedence?
- If `@korri:cdp-input-bridge` is deleted, `KORRI_ENABLED_PLUGINS` env vars on deployed devices that include it will fail (unknown plugin id). Is there a graceful fallback?

---

**Gap I-5: Fail-closed contract for new execution models.**

The current bridge's fail-closed behavior is well-specified: if the bridge exits while `failClosed: true` and the game is still running, `terminateLaunch()` is called. For a wrapper-binary model, the remap process _is_ the parent — if it exits, the child game exits automatically. But:
- For gamepad-to-gamepad: if the remap side-process exits while the game continues, the gamepad state may be stuck (button held, axis deflected). The plan must specify what "fail-closed" means when the output target is a virtual gamepad rather than a browser keyboard.
- The `releaseAll()` path (release all held keys on shutdown) — does this concept extend to releasing held gamepad buttons on a virtual device?

---

**Gap I-6: Diagnostics capability for `@korri:remap`.**

The current plugin exposes `diagnostics.collect` with CDP-specific fields (host, port, mapping name). The new plugin's diagnostics surface must be defined. At minimum:
- What policy fields are surfaced (bound slots, binding count, mechanism)?
- What does "enabled" look like in the new format?
- Does the diagnostics handler read from `launch.with` config or from something else?

---

### Minor — Has a Reasonable Default but Worth Confirming

**Gap M-1: Binary name and env override convention.**

The current bridge binary is `korri-cdp-input-bridge`, overridable via `KORRI_CDP_INPUT_BRIDGE_COMMAND`. The new plugin needs a binary name (`korri-remap`?) and env override key (`KORRI_REMAP_COMMAND`?). This is a naming decision but must be made before Nix packaging.

**Gap M-2: `enable: false` short-circuit placement.**

The current bridge checks `policy.enabled` in the lifecycle hook body before spawning. If `@korri:remap` is a `launch.compose` companion, the `enable: false` check must happen inside the handler so the `LaunchSpec` is returned unchanged. The `isDisabledLaunchCompanionPolicy` helper in `launch-companion.ts` already handles this at the `composeLaunchCompanions` loop level — confirm whether that's sufficient or whether the handler also needs its own guard.

**Gap M-3: Axis thresholds in dot-path syntax.**

The current bridge exposes `axis.pressThreshold` and `axis.releaseThreshold` as top-level policy fields. In the new format, per-binding or per-axis threshold control must either be dropped (always default), exposed as optional fields per binding, or surfaced as top-level policy knobs. The hysteresis model (press ≠ release threshold) is important for jitter suppression and must not silently disappear.

**Gap M-4: `attachTimeoutMs` equivalent.**

The current bridge has an `attachTimeoutMs` for waiting for the CDP WebSocket. If the new execution model is a wrapper binary, there may be no "attach" — the binary starts before the game. But if there is still an "attach" step (e.g., waiting for an InputPlumber virtual gamepad to appear), the timeout policy must be preserved or explicitly removed.

**Gap M-5: Strict excess-property policy.**

The current bridge policy decoder uses `{ onExcessProperty: "error" }`. The new schema must carry this forward — authors should get loud failures on typos, not silent strips.

---

## Questions

**Q1 (blocks all other work): What is the execution model?**
Is `@korri:remap` a `launch.compose` command-wrapper, a session lifecycle hook that reads `launch.with` via a new seam, or both? The answer determines the entire module structure, the sessiond contract extension, and the Nix package shape.

_Stakes:_ Without this, two teams can independently implement two incompatible models. The `KorriSessionLifecycleHookStartRequest` contract extension (or absence) is a merge conflict waiting to happen.

_Default assumption:_ Hybrid (launch.compose wrapper + session lifecycle hook cleanup), mirroring the Gamescope pattern, but this needs explicit sign-off.

---

**Q2 (blocks gamepad-to-gamepad): What mechanism produces virtual gamepad output?**
The existing safety contract forbids `uinput` and InputPlumber profile switching. What is the permitted path for emitting gamepad button/axis events to a virtual device?

_Stakes:_ If no answer exists, the feature is unimplementable without relaxing the safety contract, which has security/isolation implications.

_Default assumption:_ Gamepad-to-gamepad is deferred to a follow-on iteration; the v1 `@korri:remap` only supports keyboard output.

---

**Q3 (blocks non-browser keyboard output): What mechanism emits keyboard events to non-browser targets?**
For native games that are not Chromium-backed, `key.down` needs a host-level injection path. All known mechanisms are currently forbidden.

_Stakes:_ If unresolved, `@korri:remap` silently works only for Chromium-launched games, and authors of native-game entries will write configs that do nothing.

_Default assumption:_ `@korri:remap` v1 retains CDP as the keyboard injection mechanism (under the hood) for browser-backed games; the CDP terms are hidden from authored config but still required for the target selector (URL pattern, page type). If this is the answer, the `target:` field must re-appear in the schema under a non-CDP name.

---

**Q4 (blocks multi-controller): How is `p1` vs `p2` mapped to physical devices?**
Does the `p<N>` slot correspond to the N-th InputPlumber virtual gamepad in `/proc/bus/input/devices` order? Or is each slot explicitly configured with a device preference (name, event node)?

_Stakes:_ Authors cannot write correct multi-controller configs without knowing the slot-to-device mapping rule. A wrong assumption leads to reversed inputs or ambiguous device errors.

_Default assumption:_ Each slot has an optional `source` sub-key (like the current `sourcePreference`) — `p1.source.names: ["Microsoft Xbox Series S|X Controller"]`. If absent, slots are assigned in device enumeration order.

---

**Q5 (blocks schema work): What is the canonical dot-path vocabulary?**
Specifically: what are the valid source paths (buttons, axes, dpad directions, stick directions) and valid target paths for keyboard and gamepad outputs? Are axis bindings expressed as directional paths (`p1.stick.left`) or as axis-plus-sign (`p1.axis.left-x.negative`)?

_Stakes:_ Without a spec'd vocabulary, two implementers will produce incompatible schemas. Schema validation at decode time (which is the safety guarantee) cannot be implemented without the vocabulary.

_Default assumption:_ Source vocabulary mirrors the DOM Gamepad API (dpad, buttons a/b/x/y/l1/r1/l2/r2/etc., stick left/right with directional suffixes). Target keyboard vocabulary mirrors DOM key names (kebab-cased: `arrow-down`, `key-z`). Axis thresholds remain top-level `axis` policy knobs, not per-binding.

---

**Q6 (blocks YFS migration): Does `@korri:cdp-input-bridge` remain registered while `@korri:remap` is being built?**
Is this a rename-in-place (old id removed, new id added, YFS config updated atomically) or a parallel existence period?

_Stakes:_ Deployed Sobo devices have `KORRI_ENABLED_PLUGINS` referencing `@korri:cdp-input-bridge`. A hard cutover without device reflash will leave those devices with an unknown plugin id in the env var (currently a no-op via `parseEnabledPluginIds`, but worth confirming).

_Default assumption:_ Parallel existence: `@korri:cdp-input-bridge` stays registered but is deprecated. YFS config is updated in the same PR that ships `@korri:remap`. The old plugin is removed in a follow-on after device images are updated.

---

**Q7 (important for safety): Does the `releaseAll` / stuck-input guarantee extend to gamepad output?**
For keyboard output, the bridge releases all held keys on shutdown. For gamepad output, an equivalent must be defined — otherwise a held virtual button survives across sessions.

_Stakes:_ If a session exits abnormally without cleanup, a stuck virtual gamepad button in the InputPlumber layer would affect the next launched game.

_Default assumption:_ The plan should specify that `stopBeforeCleanup` on the remap sidecar must ensure all held inputs are released, regardless of output type, before returning.

---

## Test Scenarios the Plan Must Cover

These are scenarios the existing test suite does not cover and that the plan should explicitly commission:

| # | Scenario | Why it matters |
|---|---|---|
| T-1 | Single controller, keyboard output (happy path migration from `yfs-default`) | Core regression test for existing YFS behavior |
| T-2 | `enable: false` in `launch.with` → game launches without remap | Smoke-test for disabled policy short-circuit at the compose step |
| T-3 | Malformed dot-path (typo, unknown slot name, unknown key) → policy decode error at launch time, not runtime | Fail-loud at the correct phase |
| T-4 | Excess property in `launch.with` config → schema error | Strict whitelist mode |
| T-5 | `p1` source device missing (no InputPlumber virtual gamepad) → fail-launch | Existing behavior must be preserved |
| T-6 | `p1` source device ambiguous without preference → fail-launch | Existing behavior |
| T-7 | `p1` source ambiguous, preference resolves it → succeed | Existing behavior |
| T-8 | Remap sidecar exits unexpectedly, `fail-closed: true` → `terminateLaunch()` called | Fail-closed isolation contract |
| T-9 | Remap sidecar stops during cleanup → no `terminateLaunch()` | The `stoppingForCleanup` guard must carry over |
| T-10 | Axis direction switch with hysteresis (both negative and positive triggered in sequence) → correct release/press order | Core input correctness |
| T-11 | Multiple bindings share the same output key → only one `rawKeyDown` until all sources release | Source-set deduplication |
| T-12 | `@korri:remap` composes alongside `@korri:gamescope` → `composeLaunchCompanions` applies both in order | Companion composition ordering |
| T-13 | `p2` slot configured, two InputPlumber virtual gamepads present → each maps to correct device | Multi-controller happy path |
| T-14 | `p2` slot configured but only one InputPlumber virtual gamepad → defined error (fail-launch or warn) | Multi-controller degraded mode |
| T-15 | Wrapper binary (if execution model A) forks game child → game exit causes wrapper exit → sessiond observes clean exit | Process-group accounting with wrapper model |
| T-16 | Wrapper binary crashes before game starts → sessiond observes failed launch | Fail-closed at wrapper startup |
| T-17 | Diagnostics collect with enabled config → correct fields reported (no CDP terms) | Diagnostics surface correctness |
| T-18 | Diagnostics collect with invalid config → surfaced as `"invalid"` without throwing | Diagnostics fault tolerance |

---

## Recommended Next Steps

**Before any code is written:**

1. **Resolve Q1 (execution model)** in a single design document with the sessiond and plugin owners. The answer propagates to the `KorriSessionLifecycleHookStartRequest` contract (needs `launchCompanions` field or not), the Nix package shape (wrapper binary or sidecar binary), and the process-group contract with sessiond. This is the load-bearing decision.

2. **Resolve Q2 and Q3 (output mechanisms)** as a paired decision. If the answer to Q2 is "defer gamepad-to-gamepad," say so in the plan so the schema can omit gamepad targets from the first schema version. If the answer to Q3 is "CDP stays under the hood," the `target:` selector must reappear in the schema under a renamed key (e.g., `window.url-pattern`) and that must be spec'd before the schema is written.

3. **Write the dot-path vocabulary** (Q5) as a formal table before implementing the schema decoder. The vocabulary is the contract between authors and the runtime — it cannot be discovered experimentally after the feature ships.

4. **Plan the YFS migration** (Q6) atomically with the new schema. The YFS plugin config update and the `@korri:remap` plugin registration should ship in the same commit so there is no window where YFS config points to a non-existent annotation key.

5. **Gate T-5 through T-9** (source resolution, fail-closed, cleanup guard) as first-class acceptance criteria before marking the session lifecycle hook work done. These are the scenarios where the existing CDP bridge has been most carefully tested, and they are the hardest to recover from if broken silently.
