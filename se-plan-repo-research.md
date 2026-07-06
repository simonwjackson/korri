# Repository Research Summary — Bandai/SM8550 Fake-Suspend Ownership

> **Scope:** technology, architecture, patterns  
> **Date:** 2026-07-05  
> **Repos surveyed:** `korri` (this repo) and `nix-on-rocks` at `~/code/sandbox/nix-on-rocks`  
> All paths are repo-relative; the owning repo is noted in brackets when ambiguous.

---

## Technology & Infrastructure

### korri

| Dimension | Detail |
|-----------|--------|
| Language | TypeScript 67 %, TSX 16 %, Nix 9 %, CSS 5 %, Shell 1 % |
| Runtime | Bun (`@effect/platform-bun`, `bun:ffi`) |
| Effect version | Effect v4 (`@effect/atom-react`, `@effect/platform-bun`) |
| Web framework | Hono + Vite + TanStack Router |
| UI | React 19, Tailwind v4, Framer Motion |
| Formatter/linter | Biome (2-space, double-quotes) |
| Test runner | `bun test` for unit; Playwright for E2E/component |
| Build system | `justfile` recipes delegating to `bun`/`nix build` |
| Toolchain management | Nix flakes + direnv |
| TypeScript | strict mode, path aliases `@app/*` → `product/*`, `@platform/*` → `product/platform/*` |
| Deployment model | NixOS rootfs images (ROCKNIX-hosted nspawn guest for SM8550) |
| Module boundary | `product/` = product code; `product/platform/` = shared runtime; `tools/` = tooling |

### nix-on-rocks

| Dimension | Detail |
|-----------|--------|
| Language | Pure Nix flake |
| Purpose | Substrate rootfs images for handheld devices; SM8550 / RK3566 |
| Guest model | systemd-nspawn container; guest is a full NixOS system |
| Module surface | `guest/modules/*.nix`, `guest/profiles/*.nix` |
| Checks | `nix/tests/*.nix` — pure Nix evaluation + `pkgs.runCommand` script tests |

---

## Architecture & Structure

### Ownership contract at a glance

The flip was designed on 2026-06-10 (validated live on Bandai) and is **already implemented and committed** across both repos. The following describes the current code state, not a future proposal.

```
physical button (pmic_pwrkey event0 / gpio-keys lid event5)
  │  ← passes through kernel to guest via nspawn device access (ACL-granted)
  ▼
korri-inputd (TypeScript, Bun, korri user session)
  KEY_POWER → "power-suspend" action
  EV_SW SW_LID value=1 → "lid-closed" action
  EV_SW SW_LID value=0 → "lid-opened" action
  │  ← dispatched via KORRI_INPUTD_{POWER_SUSPEND,LID_CLOSED,LID_OPENED} env vars
  ▼
korri-fakesuspend-toggle (shell script, inline in rocknix-sm8550.nix, runs as korri user)
  toggle/suspend:  swaymsg "output * power off"  [korri's own sway socket]
                   freeze *.scope user units      [game scopes only, not services]
                   touch <requestDir>/enter.request
  resume:          touch <requestDir>/exit.request
                   thaw *.scope user units
                   swaymsg "output * power on"
  │  ← request dir group-writable by rocknix.power.requestGroup = runtime.group
  ▼
rocknix-powerstate-watcher (root systemd service, nix-on-rocks, 1s poll)
  │  ← reads enter.request / exit.request, calls rocknix-powerstate verb
  ▼
rocknix-powerstate enter|exit (shell script, root, nix-on-rocks)
  enter: snapshot CPU governors + devfreq governors + wifi state + wifi profile + BT state
         → cpufreq powersave → devfreq powersave → rfkill block BT → nmcli radio wifi off (LAST)
  exit:  restore CPU/devfreq → rfkill unblock BT → nmcli radio wifi on
         → wait ≤14s for wifi:connected; if stalled, nmcli con up <snapshot profile> (×4)
         → consume snapshot (rm active marker + all snapshot files)
```

### What nix-on-rocks retains ("dumb substrate")

| Capability | File (nix-on-rocks) |
|-----------|---------------------|
| Substrate power verb | `guest/modules/powerstate.nix` → `rocknix-powerstate enter\|exit` |
| Request watcher | `guest/modules/powerstate.nix` → `rocknix-powerstate-watcher.service` (root, `multi-user.target`) |
| Request directory provisioning | `systemd.tmpfiles.rules` (d `${runtimeDir}/requests`, group-writable when `requestGroup` is set) |
| Wi-Fi watchdog (opt-in) | `guest/modules/powerstate.nix` → `rocknix-powerstate-wifi-watchdog.timer` (default off) |
| Kill switch | `/storage/.guest/lid-suspend.disabled` — host-reachable over bind-mount |
| logind button/lid ignores | `services.logind.settings.Login` in `powerstate.nix` config block |
| Neutral input event names | `guest/modules/device-interface.nix` → `rocknix.device.input.powerEventNames`, `volumeUpLidEventNames` |
| Guest ACL convergence | `guest/modules/input.nix` → `systemd.services.rocknix-guest-hide-raw-gamepad`, InputPlumber wiring |

### What korri owns

| Capability | File (korri) |
|-----------|--------------|
| Power/lid/volume button policy | `product/systems/nixos/images/platforms/rocknix-sm8550.nix` → `services.korri.input.inputd.environment` |
| Fake-suspend toggle script | `rocknix-sm8550.nix` (let `korriFakesuspendToggle`) — inline `pkgs.writeShellScript` |
| Display blanking | toggle script: `swaymsg "output * power off/on"` via korri's own sway socket |
| Session freeze/thaw | toggle script: `systemctl --user freeze/thaw *.scope` |
| Request file write | toggle script: `touch ${powerRequestDir}/enter.request` |
| Request group wiring | `rocknix-sm8550.nix` line `rocknix.power.requestGroup = runtime.group;` |
| inputd action dispatch | `product/services/device/inputd.ts` → `systemKeyAction`, `handlePolicyEvent` |
| Action-to-command mapping | `product/services/device/inputd-actions.ts` → `commandFromEnv("KORRI_INPUTD_*", ...)` |
| Device node ACLs | `product/systems/nixos/modules/korri-rocknix-guest-device-access.nix` → `setfacl -m u:korri:rw /dev/input/%k` via udev; `korri-rocknix-seat-device-trigger.service` |

---

## Implementation Patterns

### Pattern 1: Env-command dispatch (inputd-actions.ts)

All platform-specific action commands flow through env-var overrides. Default fallbacks exist for every action so inputd runs safely on non-SM8550 platforms.

```typescript
// product/services/device/inputd-actions.ts
powerSuspend: commandFromEnv("KORRI_INPUTD_POWER_SUSPEND", "systemctl", ["suspend"]),
lidClosed:    commandFromEnv("KORRI_INPUTD_LID_CLOSED",   "systemctl", ["suspend"]),
lidOpened:    commandFromEnv("KORRI_INPUTD_LID_OPENED",   "true",      []),
```

Platform adapter sets in `rocknix-sm8550.nix`:
```nix
services.korri.input.inputd.environment = {
  KORRI_INPUTD_POWER_SUSPEND = "${korriFakesuspendToggle}";
  KORRI_INPUTD_LID_CLOSED    = "${korriFakesuspendToggle} suspend";
  KORRI_INPUTD_LID_OPENED    = "${korriFakesuspendToggle} resume";
  PULSE_SERVER               = korriPulseServer;
};
```

The `commandFromEnv` function whitespace-splits the env value: `"${korriFakesuspendToggle} suspend"` becomes `{ command: "/nix/store/…-korri-fakesuspend-toggle", args: ["suspend"] }`.

### Pattern 2: Shell script packaging — `writeShellScript` vs `writeShellApplication`

Two Nix patterns are used in the same file:

```nix
# Non-interactive, minimal PATH, no runtimeInputs wrapper needed:
korriFakesuspendToggle = pkgs.writeShellScript "korri-fakesuspend-toggle" ''
  set -u
  export PATH=${lib.makeBinPath (with pkgs; [coreutils gawk gnugrep sway systemd])}
  …
'';

# Interactive-friendly, runtimeInputs injects packages automatically:
korriBandaiBottomKeyboardToggle = pkgs.writeShellApplication {
  name = "korri-bandai-bottom-keyboard-toggle";
  runtimeInputs = with pkgs; [coreutils findutils gnugrep procps sway wvkbd];
  text = ''…'';
};
```

`writeShellScript` is preferred for compact system scripts; `writeShellApplication` for scripts needing `set -euo pipefail` + automatic `runtimeInputs`.

### Pattern 3: Request-channel via file-drop + poll loop

```nix
# nix-on-rocks/guest/modules/powerstate.nix
watcher = pkgs.writeShellScript "rocknix-powerstate-watcher" ''
  while true; do
    if [ -e "$request_dir/enter.request" ]; then
      rm -f "$request_dir/enter.request"
      ${powerstate} enter || true
    fi
    if [ -e "$request_dir/exit.request" ]; then
      rm -f "$request_dir/exit.request"
      ${powerstate} exit || true
    fi
    sleep "$interval"   # default 1s
  done
'';
```

**Critical constraint documented in the file:** Never use systemd `PathExists` or path units for this channel — they multi-trigger per request (5–6 service starts), trip `unit-start-limit-hit`, and permanently kill the watcher.

### Pattern 4: First-wins snapshot with idempotent apply

```sh
# Substrate verb enter():
if [ ! -e "$active_marker" ]; then
  # snapshot wifi, bt, governors
  : > "$active_marker"   # guard ALL subsequent enter calls
fi
# Apply low-power state (idempotent — safe to repeat)
apply_cpu_low_power
```

A duplicate `enter.request` (e.g. from autorepeat) replays the low-power actions without overwriting the snapshot. This prevents the `wifi.state=disabled` clobber that caused two "dead until reboot" incidents during prototyping.

### Pattern 5: Nix config-check testing (pure evaluation)

Korri's NixOS module tests use pure evaluation — no NixOS VM, no actual boot. The pattern:

```nix
# tools/testing/nix/korri-rocknix-sm8550-config-check.nix
(check "${name}: inputd owns power/lid buttons via the product fake-suspend toggle" (
  lib.hasSuffix "korri-fakesuspend-toggle" (inputdEnv.KORRI_INPUTD_POWER_SUSPEND or "")
  && lib.hasSuffix "korri-fakesuspend-toggle suspend" (inputdEnv.KORRI_INPUTD_LID_CLOSED or "")
  && lib.hasSuffix "korri-fakesuspend-toggle resume" (inputdEnv.KORRI_INPUTD_LID_OPENED or "")
  && (cfg.rocknix.power.requestGroup or null) == runtime.group
))
```

The nix-on-rocks counterpart is a `pkgs.runCommand` script test that exercises the verb binary with a fake sysfs tree:

```nix
# nix-on-rocks/nix/tests/powerstate-script-contract.nix
ROCKNIX_POWER_SYSFS_ROOT="$root" \
ROCKNIX_POWER_STATE_DIR="$state" \
ROCKNIX_POWER_RESULT_DIR="$results" \
  "$powerstate" enter
grep -q '^powersave$' "$root/devices/system/cpu/cpufreq/policy0/scaling_governor"
```

### Pattern 6: Neutral substrate → product consumption

The substrate exposes neutral option paths that product code reads without knowing implementation details:

```nix
# Device interface (nix-on-rocks) exposes:
rocknix.device.input.powerEventNames     # ["pmic_pwrkey"]
rocknix.device.input.volumeUpLidEventNames  # ["gpio-keys"]
rocknix.device.audio.route.kind          # "wireplumber-ucm" | "manual-pcm" | "none"
rocknix.power.runtimeDir                 # default "/run/rocknix-power"
rocknix.power.requestGroup               # set by product to runtime.group

# Korri reads the neutral facts:
powerRequestDir = "${config.rocknix.power.runtimeDir}/requests";
# korri-fakesuspend-toggle hardcodes this path inside the script at build time
```

### Pattern 7: Boundary lint enforcement

nix-on-rocks has a `scripts/check-boundary-lint` script that enforces:
1. No substrate source may name product session units by name (`korri-compositor`, `korri-inputd`, `korri-sessiond`, etc. — only `main-space-*` shapes are allowed).
2. `powerstate.nix` specifically must not reference `korri-kiosk`, `korri-compositor`, `main-space-pipewire`, or `sway-ipc.0.*` patterns (the symbols from the old `lid.nix` that caused the ownership bug).

---

## Key Files Reference

### korri

| File | Role |
|------|------|
| `product/systems/nixos/images/platforms/rocknix-sm8550.nix` | SM8550 platform adapter; contains `korriFakesuspendToggle` script definition and inputd env wiring |
| `product/services/device/inputd.ts` | Event dispatch: `KEY_POWER → "power-suspend"`, `SW_LID value=1 → "lid-closed"`, `SW_LID value=0 → "lid-opened"` |
| `product/services/device/inputd-actions.ts` | Command dispatch: `commandFromEnv("KORRI_INPUTD_POWER_SUSPEND", ...)` etc. |
| `product/services/device/inputd.test.ts` | Unit test: SW_LID and KEY_POWER produce correct action ids |
| `product/services/device/inputd-actions.test.ts` | Unit test: power-suspend/lid-closed/lid-opened run correct commands (lines ~400–425) |
| `product/systems/nixos/modules/korri-input.nix` | `services.korri.input.inputd.environment` option definition; `korri-inputd.service` unit |
| `product/systems/nixos/modules/korri-rocknix-guest-device-access.nix` | ACL setup for guest device nodes including `/dev/input/event*` |
| `tools/testing/nix/korri-rocknix-sm8550-config-check.nix` | Nix config-check covering fake-suspend toggle wiring and `requestGroup` (lines ~755–768) |

### nix-on-rocks

| File | Role |
|------|------|
| `guest/modules/powerstate.nix` | Substrate power verb (`rocknix-powerstate enter\|exit`) + watcher + Wi-Fi watchdog + logind ignores + `rocknix.power.*` options |
| `guest/modules/device-interface.nix` | Neutral `rocknix.device.input.*EventNames` option schema |
| `guest/modules/chipsets/sm8550/default.nix` | Default `input.powerEventNames = ["pmic_pwrkey"]`, `input.volumeUpLidEventNames = ["gpio-keys"]` |
| `guest/profiles/rocknix-guest-base.nix` | Imports `../modules/powerstate.nix` (line ~101) |
| `nix/tests/powerstate-script-contract.nix` | Script contract: CPU/GPU governor powersave on enter, restore on exit, first-wins, battery-facts |
| `scripts/check-boundary-lint` | Lint: substrate must not name product units; `powerstate.nix` must not reference korri-unit or uid-0 socket patterns |

---

## Open Items Relevant to the Plan

These are gaps identified from the handoff doc and current code state. Not yet codified; each is a decision point for the implementation plan.

### 1. Toggle script is inline — no standalone Nix test for its behavior

`korriFakesuspendToggle` is a `pkgs.writeShellScript` inline in `rocknix-sm8550.nix`. The Nix config check only verifies the wiring (that `KORRI_INPUTD_POWER_SUSPEND` has suffix `korri-fakesuspend-toggle`), not the script's behavior.

The `nix-on-rocks` counterpart (`powerstate-script-contract.nix`) is a `pkgs.runCommand` test that exercises the verb with a fake sysfs. A similar test for `korri-fakesuspend-toggle` would need to mock:
- A sway socket responding to `swaymsg "output * power off/on"` (or a mock socket)
- `systemctl --user freeze/thaw` (or `SYSTEMD_UNIT_PATH` fake)
- The request directory and file assertions

**Decision point for plan:** Extract the toggle script into a derivation (e.g. `korri-rocknix-fakesuspend-toggle` package) so a `pkgs.runCommand` script test can exercise it with injectable paths. The existing `korriFakesuspendToggle` already embeds `request_dir="${powerRequestDir}"` and `runtime_dir="${korriRuntimeDir}"` as build-time constants — a packaged version would accept them as env vars (matching `ROCKNIX_POWER_STATE_DIR` pattern from the substrate verb).

### 2. Bare evdev node ACL coverage (inputd EACCES retry loop)

The BANDAI_SLEEP_HANDOFF identifies that pmic_pwrkey (event0), pmic_resin (volume), and gpio-keys (lid) are host-bound with host gid 104 and no guest mapping. Current `korri-rocknix-guest-device-access.nix` with `aclNodeGlobs = ["/dev/input/event*"]` applies `setfacl -m u:korri:rw` to these nodes at boot. The udev rule (`setfacl -m u:korri:rw /dev/input/%k`) covers newly-appearing nodes.

**Status:** Covered by existing module but not specifically tested against the bare-node scenario. The config check at line 365 of `korri-rocknix-sm8550-config-check.nix` asserts:
```nix
lib.hasInfix "setfacl -m u:korri:rw /dev/input/%k" cfg.services.udev.extraRules
```

A targeted validation would verify pmic_pwrkey/gpio-keys specifically appear in the `retriggerSubsystems` and `aclNodeGlobs` lists, and that `korri-rocknix-seat-device-trigger` runs before greetd.

### 3. Volume button ownership (no longer overridden in SM8550)

After the flip, `KORRI_INPUTD_VOLUME_UP` / `KORRI_INPUTD_VOLUME_DOWN` are **intentionally absent** from the SM8550 inputd env. inputd falls back to its built-in `pactl set-sink-volume @DEFAULT_SINK@ ±5%` default. This works because `PULSE_SERVER = korriPulseServer` is set in the inputd environment, routing pactl to the korri user's PipeWire graph.

The Nix config check asserts the absence:
```nix
&& !(inputdEnv ? KORRI_INPUTD_VOLUME_UP)
&& !(inputdEnv ? KORRI_INPUTD_VOLUME_DOWN)
```

No action needed — this is correct and tested. Documenting it here because it's counterintuitive (a missing env var is intentional product policy, not a gap).

### 4. `rocknix-guest-hide-raw-gamepad.service` fails every boot

Mentioned in the BANDAI_SLEEP_HANDOFF open backlog. Unrelated to fake-suspend ownership, but blocks clean device operation. The service is in `nix-on-rocks/guest/modules/input.nix`.

### 5. `lid.nix` is deleted; no migration residual

The old `guest/modules/lid.nix` (which contained `main-space-hardware-button-handler`) was removed via commit "refactor(power): replace lid.nix with product-agnostic powerstate verb". No references to `main-space-hardware-button-handler` appear in current nix-on-rocks source. The boundary lint in `scripts/check-boundary-lint` now actively rejects any new reference to the old patterns.

---

## Verification Commands

### korri
```bash
# TypeScript unit tests covering inputd event dispatch and action commands:
just test-unit -- product/services/device/inputd.test.ts
just test-unit -- product/services/device/inputd-actions.test.ts

# Nix config check covering the entire SM8550 platform adapter:
nix build .#checks.aarch64-linux.korri-rocknix-sm8550-config-check
# (or via CI: just test-nix)
```

### nix-on-rocks
```bash
# Powerstate verb script contract:
nix build .#checks.x86_64-linux.powerstate-script-contract

# Boundary lint:
bash scripts/check-boundary-lint

# Guest profile contract (covers rocknix.power.* option defaults):
nix build .#checks.x86_64-linux.guest-profile-contract
```

---

## Recommendations

1. **Extract `korriFakesuspendToggle` into a standalone derivation** (`korri-fakesuspend-toggle` package under `product/systems/nixos/` or a new module). This enables a `pkgs.runCommand` script test that exercises the toggle's three modes (`toggle`, `suspend`, `resume`) with injectable paths (`ROCKNIX_POWER_REQUEST_DIR`, `KORRI_RUNTIME_DIR`) — mirroring how `powerstate-script-contract.nix` injects `ROCKNIX_POWER_SYSFS_ROOT`. Without this, toggle behavior is only validated by manual on-device testing.

2. **Add a targeted ACL contract check** for pmic_pwrkey / gpio-keys in `korri-rocknix-sm8550-config-check.nix` — asserting that the `rocknixGuestDeviceAccess.retriggerSubsystems` includes `"input"` and that the `korri-rocknix-seat-device-trigger` is ordered before `greetd.service`. This would make the bare-evdev-node coverage observable from CI.

3. **Keep `rocknix.power.requestGroup = runtime.group` as the gating contract** — this single Nix option is the boundary between substrate and product. The Nix config check already asserts it. Any refactor must preserve this assertion.

4. **No changes needed in TypeScript inputd** — the `commandFromEnv` seam is complete. The env wiring in `korri-input.nix` (`services.korri.input.inputd.environment` option) handles injection cleanly. The action ids (`power-suspend`, `lid-closed`, `lid-opened`) are tested at the dispatch layer.

5. **Preserve the boundary lint rule in nix-on-rocks** (`scripts/check-boundary-lint`) — specifically the guard that `powerstate.nix` must not name korri units or uid-0 socket patterns. This rule is the machine-enforced contract that prevents the ownership regression that caused the original silent-no-op bug.
