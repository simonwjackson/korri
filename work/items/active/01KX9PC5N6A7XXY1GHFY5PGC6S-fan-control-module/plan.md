---
title: "feat: Systemic NixOS fan-control module with per-device curves"
type: feat
status: active
date: 2026-07-12
origin: work/items/active/01KX9PC5N6A7XXY1GHFY5PGC6S-fan-control-module/item.md
verify_command: "nix build .#checks.x86_64-linux.korri-fan-control-module --no-link"
---

# feat: Systemic NixOS fan-control module with per-device curves

## Summary

Add one shared NixOS module (`korri-fan-control.nix`) providing a root systemd service that polls a temperature sensor and drives the fan PWM along a declarative curve. The module ships a conservative generic default curve; device images opt in and may override the curve. SM8550 (Bandai/Thor) is the first consumer with its gaming curve. Fan and temp hardware are resolved by identity, never by hwmon index.

---

## Problem Frame

The SM8550 guest kernel maps its maximum cooling state to pwm 70/255 (~3,100 RPM), so gaming loads reach ~90°C while the OS believes cooling is maxed. Manually forcing pwm 255 (~7,600 RPM) dropped the same load to ~66–71°C — the hardware is fine; the fan curve is the bug. Manual overrides don't survive reboots, the hwmon index shifts across boots, and the fix must protect every fan-equipped Korri device, not just Bandai. (See origin: `work/items/active/01KX9PC5N6A7XXY1GHFY5PGC6S-fan-control-module/item.md`.)

---

## Requirements

- R1. One declarative NixOS module shared across all Korri device images (systemic, not per-device one-offs).
- R2. A sensible generic temp→PWM curve applied by default once a device image declares its fan hardware identity — no curve or tuning config required for generic protection.
- R3. Devices can optionally override with their own curve; Bandai/Thor overrides with a gaming curve ≈ 45°C→45%, 65°C→70%, 85°C→100%.
- R4. Hardware discovery is robust: both the PWM device and the temperature source are resolved by identity (hwmon `name` attribute / thermal-zone `type` attribute), never by index.
- R5. Fail-safe: restores automatic/default fan control on stop; a dead service must never leave the fan pinned low under load.
- R6. Fanless devices or devices without writable PWM controls opt out cleanly (module present, no-op).
- R7. Runtime telemetry exposes current temp, PWM, RPM, and selected profile (generic vs device override).

---

## Scope Boundaries

- No portal/GUI fan controls and no per-game fan behavior via launch hooks — the loop is temperature-driven only.
- No kernel/devicetree thermal fix upstreaming (noted as future work; this module is the userspace remedy).
- No changes to the Wonder underclock/launch-hooks profile.
- No clock-based passive throttling policy — cooling only.
- The module never disables or modifies kernel thermal zones or their critical trip points; the kernel's thermal shutdown remains the ultimate backstop.

### Deferred to Follow-Up Work

- Suspend-aware quiet policy (observe `KORRI_FAKESUSPEND_ACTIVE_MARKER` to select a silent profile during fake-suspend): future iteration. In v1 the temp-driven loop self-quiets as the device cools, which is thermally correct after a hot gaming session.
- Runtime mode selector (gaming/quiet profiles switchable per session): future iteration, only if a real need appears.
- Secondary identity selector for disambiguating same-name hwmon nodes: only if a real device exhibits the ambiguity (v1 fails loudly instead — no path-based escape hatch, which would reintroduce the index-fragility this module removes).
- Surfacing telemetry in the portal UI via korrid: future iteration — v1 only guarantees the status file exists and is well-formed.
- Enabling the module on RK3566/RK3326/x86 images: only after those device families are confirmed fan-equipped.

---

## Context & Research

### Relevant Code and Patterns

- `product/systems/nixos/modules/korri-rocknix-audio-bootstrap.nix` — canonical module anatomy (options under `services.korri.*`, `mkEnableOption`, poll loop in `pkgs.writeShellScript`).
- `product/systems/nixos/modules/korri-rocknix-guest-device-access.nix` — the sysfs-writing precedent (backlight): omits `ProtectKernelTunables`, repairs node access as root.
- `product/systems/nixos/modules/korri-removable-media.nix` — persistent-loop service shape; per-device opt-in module (not in the `korri` aggregate).
- `product/systems/nixos/flake/modules.nix` — module registration; `product/systems/nixos/flake/checks.nix` — check registration (`korri-standard-native` owner matrix).
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix` — platform adapter that will import and enable the module.
- `tools/testing/nix/` — pure-Nix `evalConfig` module checks and per-platform config checks to mirror.
- Repo convention: image-layer service logic is bash via `pkgs.writeShellScript`/`writeShellApplication` with explicit `PATH`; no Python/compiled loops in images.

### Institutional Learnings

- `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md` — `ProtectSystem=strict` silently blocks writes (EROFS) unless paths are in `ReadWritePaths`; runtime drop-ins/remounts are not a stable config surface on ROCKNIX. Bake everything into the image.
- `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md` — module defaults stay conservative (`enable = false`); the image layer owns fleet posture (enables + locks the curve).
- `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md` — boot-scoped system service, `tmpfiles` for runtime dirs, eval-time assertions for invariants, bounded restart budget.
- `docs/solutions/performance-issues/ryubing-sm8550-turnip26-openal-2026-06-11.md` — SM8550 governor state resets across fake-suspend/resume without notice → curves must key on measured temperature, never on assumed load/governor state.
- `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md` — the guest shares the host kernel; hwmon nodes are host hardware reached from the guest; deploys target the guest.
- Live session evidence (this work item's origin): pwm 70 → ~90°C, pwm 255 → ~66–71°C; `/sys` observed read-only from interactive guest shells (root remount worked); hwmon index observed at 40 but known to shift.

### External References

- None used — local patterns cover the risky parts. nixpkgs' `hardware.fancontrol` was considered and rejected (see Key Technical Decisions).

---

## Key Technical Decisions

- **Bespoke bash control loop, not nixpkgs `hardware.fancontrol`**: `fancontrol` pins generated device paths (fragile against index shifts), offers no JSON telemetry, and can't express our guest-specific safety behaviors; a small `writeShellScript` loop matches every existing image-layer pattern and avoids lm-sensors pin/rebuild concerns on aarch64.
- **Root system service on `multi-user.target`** (no `User=`): hwmon nodes are root-owned host hardware; the backlight precedent's group-ACL trick doesn't generalize, and root is the simplest honest posture for a hardware-control loop.
- **Sandbox posture (initial)**: `ProtectSystem = "strict"` + `ReadWritePaths = [ "/sys/class/hwmon" "/run/korri" ]`, with `ProtectKernelTunables` omitted (the sysfs-writer precedent). Whether this carve-out suffices inside the ROCKNIX guest (where interactive shells saw `/sys` read-only) is a device fact — proven in U5, with relaxing the sandbox (documented) as the fallback. No runtime `mount -o remount` from inside the unit.
- **Temperature-driven curve only**: read millidegrees each poll; never infer load from governor state (resets silently across fake-suspend).
- **Re-assert manual mode (`pwm_enable=1`) at the top of every loop iteration**: any external actor (host policy, resume hook) that flips the fan back to auto is corrected within one poll. Cheap and removes a whole class of silent-takeover bugs.
- **Invalid-reading policy**: readings outside a plausibility window (≤0°C or >120°C) are invalid → hold last valid PWM; after 3 consecutive invalid readings, escalate to 100% PWM and keep polling. Never drive the fan down on garbage input.
- **Curve semantics**: points sorted strictly ascending by temp; linear interpolation between points, rounded to integer PWM; below the first point → configurable idle floor (`idlePwmPercent`, module default 0); above the last point → clamp to the last point's PWM; 2°C hysteresis on input temp to stop boundary oscillation.
- **Temperature is identity-resolved too**: the temp source is selected by identity — either a temp channel on the resolved fan hwmon, or a thermal zone matched by its `type` attribute — never by `thermal_zoneN`/`hwmonN` index. Both halves of R4 get the same robustness.
- **Ambiguous identity fails loudly**: if multiple hwmon nodes match the configured name, the service logs the conflicting paths and exits with an error. No path-override escape hatch in v1 (it would reintroduce index/path fragility); a stable secondary identity selector is deferred until a real device exhibits ambiguity.
- **Small public option surface**: poll interval (5s), hysteresis band (2°C), and the telemetry path are internal constants, not options — no consumer needs to vary them yet. `idlePwmPercent` stays public (Bandai needs a non-zero idle floor near its stock quiet level).
- **Fanless/no-hardware contract**: `enable = false` (the module default) is the primary opt-out. When enabled but no matching hwmon appears within a bounded discovery window (~30s of 1s probes), the service logs, writes degraded telemetry, and exits cleanly (success, no restart churn) — covering shared images on fan-less hardware variants.
- **Fail-safe restore via `ExecStopPost`** (runs on crash and SIGKILL, unlike `ExecStop`): restore automatic mode (`pwm_enable=2`). Residual accepted risk: if the hwmon node itself vanished, restore is impossible and the last PWM holds until reboot — the kernel's critical trip remains the backstop; documented, not hidden.
- **Telemetry**: JSON at `/run/korri/fan-control-status.json` (fixed path) written via temp-file + atomic rename; `rpm` is `null` when no tach (`fan1_input`) exists; `profile` is the value of a `profileName` option (default `"generic"`; SM8550 sets its own name) — deterministic, never inferred from curve equality; telemetry failures never stop the control loop. Directory guaranteed by the module's own `tmpfiles` rule.
- **Testability seam**: the script reads its sysfs root from an env var (default `/sys`) and honors a bounded-iteration env var (run N loop iterations, then exit) so discovery/curve/safety logic — including multi-iteration behaviors like re-assertion and 3-strikes escalation — is exercised hermetically against a mock sysfs tree in a pure build-sandbox check. No device needed for logic coverage.
- **Registration (systemic)**: module exported from `modules.nix` AND imported by the shared image composition (`product/systems/nixos/images/headless.nix` or `common.nix` builders) with `enable = false` default — every Korri image carries it ("module present" per R1/R6); fan-equipped devices flip `enable` and declare hardware identity. The generic curve is the module-level default of the `curve` option, so enabling with only identity config = generic protection (R2).

---

## Open Questions

### Resolved During Planning

- Where does the generic curve live? — As the module default of the `curve` option; images that enable without overriding get it (R2). The module itself stays `enable = false` by default.
- Bash vs other languages for the loop? — Bash; it is the only language used for image-layer service scripts in this repo.
- Hysteresis in v1? — Yes, 2°C band; trivial in the loop and prevents audible chirping at curve knees.
- Should the loop watch governor/load state? — No; temperature only (institutional learning: governor state resets silently on SM8550).
- Fan behavior during fake-suspend? — v1 keeps the temp-driven loop running (it self-quiets as the device cools); a silent-profile policy is a deferred follow-up.

### Deferred to Implementation

- Actual hwmon `name` and best temperature source on Bandai/Thor: must be read from the device (`/sys/class/hwmon/hwmon*/name`, thermal zones) before hardcoding in the image config — U5 records them.
- Whether `ReadWritePaths` suffices for hwmon writes inside the ROCKNIX guest: interactive shells saw `/sys` read-only; a root systemd unit may differ. U5 proves the minimal write first, then layers hardening. Fallback: relax `ProtectSystem` for this unit with a comment explaining why.
- Whether the host/substrate resets `pwm_enable` during fake-suspend/resume: observed on device in U5 (`watch cat .../pwm_enable` across a suspend cycle). The per-iteration re-assertion mitigates regardless of the answer.
- Exact generic default curve values: start conservative (quieter than Bandai's gaming curve); tune only if a second fan-equipped device materializes.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
startup:
  resolve hwmon dir by name (bounded wait ~30s)
    none found  -> log + degraded telemetry + clean exit (no-op contract)
    >1 found    -> log conflicts + fail (unless explicit path override set)
  probe pwm node writable + pwm_enable present
    missing pwm controls -> log "no PWM control" + clean exit

loop (every pollIntervalSeconds):
  re-assert pwm_enable = 1            # win back manual mode if anything reset it
  read temp (millidegrees)
    implausible -> hold last PWM; 3 strikes -> PWM 100%; continue
  apply 2°C hysteresis; interpolate curve (idle floor below, clamp above)
  write pwm; write telemetry JSON atomically (failures non-fatal)

on stop/crash (ExecStopPost, always runs):
  restore pwm_enable = 2 (automatic)  # kernel policy resumes
```

---

## Implementation Units

### U1. Fan-control module: options, assertions, unit wiring

**Goal:** Create `korri-fan-control.nix` with the option vocabulary, eval-time validation, systemd unit shape (hardening + `ExecStopPost` restore), tmpfiles rule, and fleet-wide registration — with a placeholder loop that U2 fills in.

**Requirements:** R1, R2 (generic default curve as option default), R5 (unit-level restore), R6 (`enable=false` default)

**Dependencies:** None

**Files:**
- Create: `product/systems/nixos/modules/korri-fan-control.nix`
- Modify: `product/systems/nixos/flake/modules.nix`
- Modify: `product/systems/nixos/images/headless.nix` (or the common builder — wherever shared modules compose) to import the module default-disabled
- Test: `tools/testing/nix/korri-fan-control-module-check.nix` (authored in U3)

**Approach:**
- Options under `services.korri.fanControl`: `enable` (default false), `hwmonName` (str, required when enabled), `tempSource` (identity selector: temp channel on the fan hwmon, or a thermal zone matched by `type` — required when enabled), `curve` (list of `{ tempC, pwmPercent }` submodules, default = generic conservative curve), `idlePwmPercent` (default 0), `profileName` (default `"generic"`). Poll interval, hysteresis, and telemetry path are internal constants.
- Assertions: non-empty `hwmonName` when enabled; curve non-empty, strictly ascending `tempC`, no duplicate temps; `pwmPercent` and `idlePwmPercent` within 0–100; warning (not assertion) when the curve's top point is below 85°C or never reaches 100%.
- Unit: `Type=simple`, `wantedBy multi-user.target`, `after systemd-udevd`, `Restart=on-failure` with `RestartSec` and a bounded start-limit budget; `ExecStopPost` restore script; `ProtectSystem=strict` + `ReadWritePaths` for `/sys/class/hwmon` and `/run/korri`; `ProtectKernelTunables` omitted; module `key` set; own `systemd.tmpfiles` rule for the status directory.
- Register as `korri-fan-control` in `modules.nix` and import it in the shared image composition so every image carries it default-disabled (the systemic contract of R1/R6); fan-equipped adapters enable and configure it.
- Honor the module identity audit: no literal usernames, no `/run/user/<n>` paths, no audio service mutations.

**Patterns to follow:**
- `product/systems/nixos/modules/korri-rocknix-audio-bootstrap.nix` (module anatomy), `korri-rocknix-guest-device-access.nix` (sysfs hardening posture), `korri-removable-media.nix` (opt-in registration).

**Test scenarios:** covered by the U3 eval check (disabled → no unit; invalid configs → assertions fire; valid config → unit shape). Test expectation in this unit alone: none — validation lands with U3.

**Verification:**
- Module evaluates cleanly in a NixOS eval with `enable=false` (no unit emitted) and with a minimal valid enabled config (unit present with restore hook and carve-outs).

---

### U2. Control-loop and restore scripts

**Goal:** Implement the bash control loop (identity discovery, curve evaluation, safety behaviors, telemetry) and the idempotent restore script.

**Requirements:** R2, R4, R5, R6, R7

**Dependencies:** U1

**Files:**
- Modify: `product/systems/nixos/modules/korri-fan-control.nix`
- Test: `tools/testing/nix/korri-fan-control-module-check.nix` (behavioral scenarios authored in U3)

**Approach:**
- Loop implements the High-Level Technical Design: bounded discovery wait; ambiguity → loud failure listing conflicting paths; missing hwmon/PWM controls → clean no-op exit with degraded telemetry; identity-based temp source resolution (fan hwmon channel or thermal zone by `type`); per-iteration `pwm_enable=1` re-assertion; plausibility window with hold-last / 3-strikes-to-max; hysteresis; linear interpolation with idle floor and top clamp; atomic telemetry writes that never kill the loop; `rpm: null` without a tach; `profile` from `profileName`.
- Test contract: sysfs root from an env var defaulting to `/sys`, plus a bounded-iteration env var (run N iterations then exit cleanly) — the hermetic-test seam U3's behavioral checks drive, including multi-iteration scenarios.
- Restore script shared by `ExecStopPost` and the loop's exit trap: best-effort `pwm_enable=2`, never fails the unit.
- Explicit `PATH` via `lib.makeBinPath` (coreutils and friends only).

**Execution note:** Build the loop against a mock sysfs tree from the start (the env-var seam), so every safety behavior lands with a hermetic scenario rather than requiring the device.

**Test scenarios:** enumerated in U3 (the check harness executes this script against mock sysfs trees).

**Verification:**
- Against a mock sysfs tree: correct node chosen by name, curve outputs match expected PWM values at boundary temps, invalid readings never lower PWM, no-op paths exit 0.

---

### U3. Eval + behavioral checks, CI registration

**Goal:** A pure-Nix module-eval check plus a build-sandbox behavioral check that runs the loop script against mock sysfs trees; both registered in CI.

**Requirements:** R1–R7 (verification vehicle)

**Dependencies:** U1, U2

**Files:**
- Create: `tools/testing/nix/korri-fan-control-module-check.nix`
- Modify: `product/systems/nixos/flake/checks.nix` (register check + `korri-standard-native` owner entry)

**Approach:**
- Eval half (evalConfig pattern, no build graph): disabled module emits no unit; enabled valid config emits the expected unit shape (restore hook, ReadWritePaths, restart policy); each invalid config (empty hwmonName, unsorted/duplicate curve temps, out-of-range percents) trips its assertion.
- Behavioral half (`pkgs.runCommand`): construct mock sysfs trees and run the loop script (env-var sysfs root, single-iteration/test mode) asserting the scenarios below.

**Patterns to follow:**
- Existing module checks in `tools/testing/nix/` (audio-bootstrap module check; SM8550 config check) and the `checks.nix` registration/owner matrix.

**Test scenarios:**
- Happy path: hwmon matching name → correct node selected; temp 65°C on the Thor curve → pwm ≈ 70%; telemetry JSON contains temp/pwm/rpm/profile.
- Edge: temp below first curve point → idle floor PWM; temp above last point → clamped to last PWM; temp exactly on a knee → deterministic value; oscillation ±1°C around a knee with 2°C hysteresis → PWM stable.
- Error: zero/negative/>120°C reading → PWM unchanged; 3 consecutive invalid readings (multi-iteration run) → PWM 100%; two hwmons matching the name → non-zero exit naming both paths.
- Identity: temp source resolved via thermal zone matched by `type` in a mock tree with shuffled zone indexes → correct zone chosen.
- No-op: no matching hwmon after bounded wait → exit 0 + degraded telemetry; hwmon present but no `pwm1`/`pwm_enable` → exit 0 with "no PWM control" log.
- Integration (script-level, multi-iteration): `pwm_enable` externally flipped to 2 between iterations → re-asserted to 1 on the next iteration; telemetry path unwritable → loop continues and PWM still written; telemetry `profile` equals the configured `profileName`.
- Eval: all assertion cases above fail eval with their messages; disabled module contributes nothing.

**Verification:**
- `nix build .#checks.x86_64-linux.korri-fan-control-module --no-link` passes; the check appears in the `korri-standard-native` matrix.

---

### U4. SM8550 enablement with the Thor gaming curve

**Goal:** Bandai/Thor image imports the module and enables it with the gaming curve; the platform config check pins the posture.

**Requirements:** R1, R3

**Dependencies:** U1, U2, U5 (U5 supplies the verified `hwmonName`, temp-source identity, and idle floor — this unit lands last with real values)

**Files:**
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix` (or the platform's existing config check)

**Approach:**
- Set `services.korri.fanControl` in the SM8550 adapter with `enable = true`, the U5-verified `hwmonName` and `tempSource`, `curve = [45→45, 65→70, 85→100]`, `profileName = "thor-gaming"`, and an idle floor near the stock quiet level (~27%, per U5). The module import already arrives via the shared image composition (U1).
- Extend the SM8550 config check to assert the module is enabled and the curve matches the gaming profile (fleet-posture lock per the image-defaults learning).

**Test scenarios:**
- Config check: SM8550 eval has `fanControl.enable = true`; curve equals the expected gaming profile; regression guard fails eval if someone silently drops the module import.

**Verification:**
- SM8550 platform config check passes with the new assertions; other platform images build unchanged (module untouched by them).

---

### U5. On-device validation and hardware facts

**Goal:** Prove the three device-dependent unknowns on Bandai and feed real values back into U4.

**Requirements:** R3, R4, R5

**Dependencies:** U1, U2 (deployable build); U4 consumes this unit's measured values

**Files:**
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix` (final `hwmonName`/idle floor if adjustments needed)
- Modify: `work/items/active/01KX9PC5N6A7XXY1GHFY5PGC6S-fan-control-module/work.md` (record measured facts)

**Approach:**
- Record hwmon identity (`/sys/class/hwmon/hwmon*/name`) and the temperature-source identity (fan-hwmon temp channel or thermal-zone `type`); confirm tach presence for RPM telemetry.
- Prove the sysfs write posture via an explicit ladder, stopping at the first rung that works and documenting it in module comments: (1) hardened unit with `ReadWritePaths` carve-out; (2) relaxed `ProtectSystem` for this unit only; (3) if the guest's sysfs mount is itself read-only (as interactive shells suggested), declare the required writable-sysfs mount policy at the substrate layer (nix-on-rocks) or a narrow `ExecStartPre` remount helper; (4) if none is acceptable, stop and escalate — fan control may need to live host-side, which is a design revision, not a workaround.
- Observe `pwm_enable` across a fake-suspend/resume cycle and a service stop: manual mode re-asserted within one poll; `ExecStopPost` restores automatic mode.
- Crash semantics (two states, matching `Restart=on-failure`): after `kill -9`, `ExecStopPost` restores automatic mode during the stop transition, then the restarted loop re-enters manual mode; only an explicit `systemctl stop` or an exhausted restart budget leaves automatic mode as the steady state.
- Thermal acceptance: under a Wonder-class gaming load at stock clocks, temperature stabilizes well below the ~90°C baseline (target ≤75°C sustained); at idle the fan is not louder than stock.

**Test scenarios:** Test expectation: none — this unit is live-device verification; its outcomes are recorded in work.md and encoded as U4 config values/assertions.

**Verification:**
- Service survives reboot with correct node discovery (no index dependence); kill -9 exhibits the two-state crash semantics above; explicit stop leaves the fan in automatic mode; telemetry file readable and accurate against manual sensor reads.

---

## System-Wide Impact

- **Interaction graph:** New root system service on `multi-user.target`; no interaction with korri user daemons, launch hooks, or sessiond. Potential external writer conflict on `pwm_enable` (host/substrate policy) is absorbed by per-iteration re-assertion.
- **Error propagation:** Loop failures restart within a bounded budget; exhaustion triggers `ExecStopPost` restore to kernel-automatic mode; kernel critical trips remain the terminal backstop. Telemetry failures are explicitly non-fatal.
- **State lifecycle risks:** Residual gap — hwmon node vanishing after a crash leaves the last PWM value until reboot (documented, kernel trip still active). Status file is tmpfs-backed and rebuilt each poll.
- **API surface parity:** None — no RPC/portal surface in v1; telemetry file is the only contract (schema documented in the module).
- **Integration coverage:** Mock-sysfs behavioral checks cover script logic; the U5 device pass covers the guest-kernel seam that sandboxed checks cannot (real sysfs write posture, suspend interference).
- **Unchanged invariants:** Kernel thermal zones and trip points untouched; non-SM8550 images unchanged (opt-in module, `enable=false` default); no modification to existing korri modules beyond registration lists.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Guest sysfs may be unwritable regardless of unit hardening (mount-level read-only, not just sandboxing) | U5's explicit fallback ladder: hardened carve-out → relaxed sandbox → substrate-level writable-sysfs mount policy or narrow `ExecStartPre` remount → escalate to host-side design revision. No silent workarounds |
| Host/substrate thermal policy fights the guest loop for `pwm_enable` | Per-iteration re-assertion; U5 observes a suspend cycle to characterize the writer; if a persistent host daemon owns the node, escalate to a design revision (host-side exclusion) |
| Service death leaves fan pinned low | `ExecStopPost` (runs on crash/SIGKILL) restores automatic mode; restart budget prevents flapping; kernel critical trip is the terminal backstop; residual node-vanished gap documented |
| Sensor glitches drive the fan down under load | Plausibility window + hold-last + 3-strikes-to-max policy; never reduce PWM on invalid input |
| hwmon name ambiguity selects the wrong device | Loud failure listing conflicts; identity-based secondary selector deferred until a real device needs it |
| Wrong generic curve harms an unknown future device | Generic default is conservative; images own their curves; eval warning when a curve can't reach 100% |

---

## Documentation / Operational Notes

- Module option descriptions are the primary documentation surface (NixOS convention); the telemetry JSON schema is documented in the module next to the fixed status-file path constant.
- Operational check on device: `cat /run/korri/fan-control-status.json` and `systemctl status korri-fan-control`.
- Deploys target the ROCKNIX guest (established `nixos-rebuild` path via build host), not the host.

---

## Sources & References

- **Origin document:** `work/items/active/01KX9PC5N6A7XXY1GHFY5PGC6S-fan-control-module/item.md`
- Related code: `product/systems/nixos/modules/korri-rocknix-guest-device-access.nix`, `product/systems/nixos/modules/korri-rocknix-audio-bootstrap.nix`, `product/systems/nixos/images/platforms/rocknix-sm8550.nix`, `product/systems/nixos/flake/modules.nix`, `product/systems/nixos/flake/checks.nix`
- Institutional learnings: `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md`, `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`, `docs/solutions/performance-issues/ryubing-sm8550-turnip26-openal-2026-06-11.md`, `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md`
- Alternative considered: nixpkgs `hardware.fancontrol` — rejected (path-pinned config, no telemetry, no guest-safety behaviors, lm-sensors pin risk on aarch64)
