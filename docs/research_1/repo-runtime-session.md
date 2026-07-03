# Korri Runtime-Session Contract Research

**Branch:** feat/rpcs3-aka-source-plugin  
**Date:** 2026-07-02  
**Scope:** Unified runtime-session contract across x86 source machines and Nix-on-Rocks portable devices — covering runtimeDir, DBUS_SESSION_BUS_ADDRESS, PipeWire/Pulse, sessiond, compositor, gameStream, source-machine, and ROCKNIX/Nix-on-Rocks platform modules.  
**Decision in context:** Option A — XDG_RUNTIME_DIR stays as the canonical logind/user runtime root (`/run/user/<uid>`); Korri-owned sockets and state live in named subdirectories under it.

---

## Technology & Infrastructure

- **Languages:** TypeScript 67 %, TSX 16 %, Nix 9.5 %, Shell/BASH 1.3 %, CSS 4.5 %
- **Runtime:** Effect v4 (backend + frontend), Hono, Bun, React, TanStack Router, Vite
- **System integration:** NixOS flakes + nix-on-rocks guest substrate + direnv
- **Formatter / linter:** Biome; tests run with `bun test` and `just test-nix` (Nix checks)
- **Platforms in scope:** x86\_64-linux source machine (Aka), aarch64-linux ROCKNIX SM8550 kiosk (Bandai/Sobo), ROCKNIX RK3566 kiosk (RG353M)

---

## Architecture & Structure

### Module hierarchy (session-relevant files)

```
product/systems/nixos/
  modules/
    korri-runtime.nix          ← Korri user identity, XDG_RUNTIME_DIR shell init
    korri-login.nix            ← greetd autologin, korri-session.target symlink
    korri-compositor.nix       ← Sway/Wayland session, runtimeDir, sessionBus modes
    korri-sessiond.nix         ← Foreground-session supervisor, KORRI_SESSIOND_SOCKET
    korri-game-stream.nix      ← Sunshine app wrapper, %t → /run/user/<uid> expansion
    korri-daemon.nix           ← korrid: KORRI_GAME_STREAM_RUNTIME_DIR, intent/status paths
    korri-rocknix-audio-bootstrap.nix  ← Pulse readiness gate, UCM path
    korri-rocknix-guest-profile.nix    ← ROCKNIX guest-profile activation
    korri-rocknix-guest-device-access.nix  ← udev/ACL repair
  images/
    headless.nix               ← Federation v1 baseline (all library hosts)
    source-machine.nix         ← Aka's role: compositor + Sunshine + sessiond, no kiosk GUI
    kiosk.nix                  ← Bandai/Sobo role: compositor + kiosk GUI + sessiond
    platforms/
      rocknix-sm8550.nix       ← SM8550 platform adapter (audio, display, moonlight, power)
      rocknix-rk3566.nix       ← RK3566 platform adapter (root compositor, main-space PW)
      x86.nix                  ← x86 platform: removable-media, InputPlumber, moonlight
tools/testing/nix/
  korri-source-machine-image-check.nix    ← Image eval gates
  korri-source-machine-module-check.nix   ← Exported module eval gates
  korri-sessiond-module-check.nix
  korri-compositor-module-check.nix
  korri-game-stream-module-check.nix
product/plugins/rpcs3/nix/
  nixos-module.nix             ← services.korri.rpcs3: package, gamesRoot, stateRoot, firmware
  composition.nix              ← First-party plugin composition output
  module-check.nix             ← Nix check for rpcs3 module
```

---

## Implementation Patterns

### 1. `XDG_RUNTIME_DIR` — per-platform mapping

The `korri-runtime.nix` login-shell init always sets:

```bash
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
```

but this only applies to interactive shells. The systemd user services get their `XDG_RUNTIME_DIR` from the **compositor module's `runtimeDir` option**, which is projected through `sessionEnvironment` and forwarded to sessiond via `extraEnvironment`.

| Platform | `compositor.runtimeDir` | Resolved `XDG_RUNTIME_DIR` in launched children |
|---|---|---|
| x86 source-machine (current/broken) | `%t/korri-compositor` (module default) | `/run/user/<uid>/korri-compositor` |
| **x86 source-machine (Option A fix)** | **`%t`** (set in `source-machine.nix`) | `/run/user/<uid>` |
| ROCKNIX SM8550 kiosk | `%t` (set in `rocknix-sm8550.nix`) | `/run/user/<uid>` |
| ROCKNIX RK3566 kiosk | `%t` (set in `rocknix-rk3566.nix`, compositor runs as root) | `/run/user/0` |
| base compositor default | `%t/korri-compositor` | `/run/user/<uid>/korri-compositor` |

The module expands `%t` → `$XDG_RUNTIME_DIR` at runtime via `korri-compositor-exec` shell code:

```sh
case "$configured_runtime_dir" in
  %t)   runtime_dir="$XDG_RUNTIME_DIR" ;;
  %t/*) runtime_dir="$XDG_RUNTIME_DIR/${configured_runtime_dir#%t/}" ;;
  *)    runtime_dir="$configured_runtime_dir" ;;
esac
```

**Pattern to follow:** When `runtimeDir = "%t"`, `ownsRuntimeDir` in `korri-compositor.nix` becomes `false` (the condition requires `%t/` prefix, not bare `%t`), so the compositor service does **not** declare a `RuntimeDirectory=` stanza — it relies on the logind-created `/run/user/<uid>`. When `runtimeDir = "%t/korri-compositor"`, the compositor owns and creates that subdirectory via `RuntimeDirectory = "korri-compositor"`.

---

### 2. `DBUS_SESSION_BUS_ADDRESS` — mode patterns

`korri-compositor.nix` exposes `sessionBus.mode`:

```
"private"  → dbus-run-session -- sway
             compositor creates and owns the bus; address is auto-exported
"existing" → sway (bare)
             platform provides DBUS_SESSION_BUS_ADDRESS explicitly
```

| Platform | `sessionBus.mode` | `sessionBus.address` | Where address goes |
|---|---|---|---|
| x86 source-machine | `private` (default) | `null` | dbus-run-session auto-exports; bus socket is random/ephemeral |
| x86 kiosk | `private` (default) | `null` | dbus-run-session; `korri-kiosk-session-environment` service seeds the user manager with `unix:path=$runtime_dir/bus` |
| ROCKNIX SM8550 | `existing` | `unix:path=%t/bus` | `DBUS_SESSION_BUS_ADDRESS` projected into `sessionEnvironment` |
| ROCKNIX RK3566 | `existing` | `unix:path=%t/bus` | same |

**Critical detail:** With `mode = "existing"`, the compositor module puts `DBUS_SESSION_BUS_ADDRESS` into `sessionEnvironment` (the compositor service `environment`). To carry the address to sessiond's renderer children (kiosk role), `kiosk.nix` reads `compositorCfg.sessionBus.address` and conditionally adds it to `kioskRendererEnvironment`:

```nix
// lib.optionalAttrs
  (compositorCfg.sessionBus.mode == "existing" && compositorCfg.sessionBus.address != null)
  { DBUS_SESSION_BUS_ADDRESS = compositorCfg.sessionBus.address; }
```

Under Option A on x86 source-machine, `mode = "private"` remains, so no `DBUS_SESSION_BUS_ADDRESS` wiring is needed — dbus-run-session handles it.

**The kiosk `korri-kiosk-session-environment` service** (in `kiosk.nix`) seeds the user manager before other services start:

```sh
runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
bus_address="unix:path=$runtime_dir/bus"
systemctl --user set-environment \
  XDG_RUNTIME_DIR="$runtime_dir" \
  DBUS_SESSION_BUS_ADDRESS="$bus_address" \
  DISPLAY=:0 \
  WAYLAND_DISPLAY=wayland-1 ...
```

This is kiosk-only. Source-machine currently has no equivalent seeding service.

---

### 3. PipeWire / PulseAudio — platform patterns

#### x86 source-machine (current state — root cause of RPCS3 audio failure)

The host (`Aka`) has PipeWire enabled by its Mountainous host config:

```nix
services.pipewire.enable = true;
services.pipewire.pulse.enable = true;   # socket: /run/user/1000/pulse/native
services.pipewire.alsa.enable = true;
services.pipewire.wireplumber.enable = true;
```

But korri-sessiond's children inherited `XDG_RUNTIME_DIR=/run/user/1000/korri-compositor`, which has no Pulse socket. Direct verification on Aka showed:

```sh
XDG_RUNTIME_DIR=/run/user/1000/korri-compositor pactl info          # ❌ fails
XDG_RUNTIME_DIR=/run/user/1000/korri-compositor \
  PULSE_SERVER=unix:/run/user/1000/pulse/native pactl info           # ✅ succeeds
```

Under **Option A** (compositor `runtimeDir = "%t"`), the compositor and all session children get `XDG_RUNTIME_DIR=/run/user/<uid>`, making the Pulse socket discoverable at its default path without any explicit variable.

**No `PULSE_SERVER` injection needed** in the normal source-machine path after Option A lands. The escape hatches remain available as host/plugin overrides for unusual topologies.

#### ROCKNIX SM8550 (kiosk — explicit PipeWire wiring)

Product-owned user-scope PipeWire graph. The substrate main-space graph is disabled:

```nix
systemd.services.main-space-pipewire.enable = lib.mkForce false;
systemd.services.main-space-pipewire-pulse.enable = lib.mkForce false;
systemd.services.main-space-wireplumber.enable = lib.mkForce false;
```

User services carry explicit environment:

```nix
korriPulseServer = "unix:%t/pulse/native";

systemd.user.services.pipewire.environment.ALSA_CONFIG_UCM2 = substrateAudioUcmPath;
systemd.user.services.pipewire.environment.PULSE_SERVER = korriPulseServer;
systemd.user.services.pipewire-pulse.environment = { ALSA_CONFIG_UCM2 = ...; PULSE_SERVER = ...; };
systemd.user.services.wireplumber.environment = { ALSA_CONFIG_UCM2 = ...; PULSE_SERVER = ...; };
```

`PULSE_SERVER` is threaded explicitly to **all** consumers that need it: inputd, sessiond `extraEnvironment`, and korrid (via sessiond inheritance). The bootstrap service (`korri-rocknix-audio-bootstrap`) waits for the PipeWire graph before the compositor starts.

The SM8550 uses the substrate's neutral audio facts (API, UCM package, target sink) via:

```nix
substrateAudioApi = sm8550.audio.api;        # e.g. "pulseaudio"
substrateAudioUcmPath = "${sm8550.audio.ucmPackage}/share/alsa/ucm2";
substrateAudioTargetSink = ...;              # derived from route kind (ucm/manual/default)
```

#### ROCKNIX RK3566 (kiosk — main-space PipeWire with UID remapping)

Root-owned main-space PipeWire, but its socket is placed in the korri UID's runtime dir:

```nix
rocknix.session.runtimeDir.uid = runtime.uid;  # substrate places sockets at /run/user/<korri-uid>
```

User-level PipeWire is **disabled** to avoid socket conflicts:

```nix
systemd.user.services.pipewire.enable = lib.mkForce false;
systemd.user.services.pipewire-pulse.enable = lib.mkForce false;
systemd.user.services.wireplumber.enable = lib.mkForce false;
```

The bootstrap service runs at system scope, needs `XDG_RUNTIME_DIR = rk3566RuntimeDir` and `PIPEWIRE_RUNTIME_DIR = rk3566RuntimeDir` in its environment.

**Critical difference from SM8550:** RK3566 runs its audio bootstrap at `serviceScope = "system"` and `failOnSocketUnavailable = true` (hard gate). SM8550 uses `serviceScope = "user"` and `failOnSocketUnavailable = false` (best-effort).

---

### 4. `korri-sessiond` — socket and environment wiring

**Socket path** (invariant across all roles): `%t/korri/sessiond.sock`

Systemd expands `%t` to the **service user's** `$XDG_RUNTIME_DIR`. The sessiond service creates this via:

```nix
serviceConfig.RuntimeDirectory = "korri";
serviceConfig.RuntimeDirectoryMode = "0700";
```

This is independent of the compositor's `runtimeDir` — sessiond always creates `$XDG_RUNTIME_DIR/korri/` relative to its own runtime.

**Three-way socket invariant** (enforced by assertion in `source-machine.nix`):

```nix
assertion =
  config.services.korri.sessiond.socketPath == sessiondSocketPath
  && config.services.korri.daemon.sessiond.socketPath == sessiondSocketPath
  && config.services.korri.gameStream.sessiond.socketPath == sessiondSocketPath;
```

All three must share `%t/korri/sessiond.sock`.

**sessiond `extraEnvironment` on source-machine** (from `source-machine.nix`):

```nix
services.korri.sessiond.extraEnvironment = {
  HOME = compositorCfg.home;
  XDG_RUNTIME_DIR = compositorCfg.runtimeDir;   # ← this is the key line
  XDG_STATE_HOME = compositorCfg.stateHome;
  XDG_DATA_HOME = compositorCfg.dataHome;
  XDG_CONFIG_HOME = compositorCfg.configHome;
  WAYLAND_DISPLAY = "wayland-1";
  SWAYSOCK = "${compositorCfg.runtimeDir}/sway-ipc.sock";
  XDG_SESSION_TYPE = "wayland";
  XDG_CURRENT_DESKTOP = "sway";
  DISPLAY = ":0";
  SDL_VIDEODRIVER = "wayland,x11";
  GDK_BACKEND = "wayland,x11";
  QT_QPA_PLATFORM = "wayland;xcb";
};
```

When `compositorCfg.runtimeDir` changes from `%t/korri-compositor` to `%t`, `XDG_RUNTIME_DIR` and `SWAYSOCK` in sessiond's environment automatically pick up the correct values. No other edits to `source-machine.nix` are needed for those two variables.

**Role inference:**

```nix
inferredRole = if kioskEnabled then "kiosk" else "source-machine";
```

`source-machine.nix` sets `compositor.kiosk.enable = false`, so `role = "source-machine"` is automatic.

---

### 5. `korri-compositor` — runtimeDir mechanics

The compositor module's `sessionEnvironment` includes:

```nix
sessionEnvironment = cfg.environment // seatBackendEnvironment // {
  HOME = cfg.home;
  XDG_RUNTIME_DIR = cfg.runtimeDir;          # ← projects into compositor service env
  XDG_STATE_HOME = cfg.stateHome;
  XDG_DATA_HOME = cfg.dataHome;
  XDG_CONFIG_HOME = cfg.configHome;
  SWAYSOCK = swaySocketPath;                 # = "${cfg.runtimeDir}/sway-ipc.sock"
  # WAYLAND_DISPLAY intentionally NOT set here (would break wlroots backend detection)
} // lib.optionalAttrs (mode == "existing" && address != null) {
  DBUS_SESSION_BUS_ADDRESS = cfg.sessionBus.address;
};
```

The stable Sway IPC symlink is published by the Sway config:

```nix
exec_always ${pkgs.bash}/bin/sh -c \
  'if [ -n "${SWAYSOCK:-}" ]; then ln -sf "$SWAYSOCK" "$XDG_RUNTIME_DIR/sway-ipc.sock"; fi'
```

After Option A: the symlink is at `/run/user/<uid>/sway-ipc.sock`, exactly where peer services look.

**Seat backend selection:**

```nix
seatBackend = "logind" | "direct"
# "logind" → no WLR_SESSION/LIBSEAT_BACKEND override (let wlroots autodetect logind seat0)
# "direct" → WLR_SESSION=direct, LIBSEAT_BACKEND=builtin, WLR_LIBINPUT_NO_DEVICES=1
```

Source-machine uses `logind` (the default), which requires `seatd.service` ordered before it. SM8550 also now uses `logind` (migrated from `direct`). RK3566 is still `direct` (root compositor, no logind seat management).

---

### 6. `korri-game-stream` — `%t` expansion pattern

The Sunshine app wrapper deliberately resolves `%t` paths against the **real logind runtime**, not the inherited `XDG_RUNTIME_DIR`:

```sh
korri_user_runtime_dir="/run/user/$(id -u)"
# then:
KORRI_SESSIOND_SOCKET="${korri_user_runtime_dir}/korri/sessiond.sock"
KORRI_GAME_STREAM_RUNTIME_DIR="${korri_user_runtime_dir}/korri-game-stream"
```

This is intentional: Sunshine inherits the compositor's `XDG_RUNTIME_DIR` (which may be a private subdir), but still needs to reach the canonical user-runtime socket paths. After Option A (compositor `runtimeDir = "%t"`), the inherited `XDG_RUNTIME_DIR` and the `id -u`-derived path are the same, so this double-path logic becomes a no-op.

The module check (`korri-source-machine-module-check.nix`) already verifies the wrapper expands correctly:

```nix
&& lib.hasInfix "KORRI_SESSIOND_SOCKET=\"$korri_user_runtime_dir/korri/sessiond.sock\"" firstAppWrapper
&& lib.hasInfix "KORRI_GAME_STREAM_RUNTIME_DIR:=\"$korri_user_runtime_dir/korri-game-stream\"" firstAppWrapper
&& !lib.hasInfix "%t/korri" firstAppWrapper
```

---

### 7. `korri-runtime` — the baseline identity module

Key options and their defaults:

| Option | Default | Description |
|---|---|---|
| `user` | `"korri"` | Korri runtime Unix user |
| `uid` | `2000` | Stable non-zero UID |
| `home` | `"/home/korri"` | Home directory |
| `stateRoot` | `"/var/lib/korri"` | Service state root |
| `runtimeSubdir` | `"korri"` | Subdir under XDG\_RUNTIME\_DIR for session IPC |
| `socketDir` | `"%t/korri"` | User-manager socket directory |
| `launchArtifactsDir` | `"/run/korri/launch-artifacts"` | Cross-session artifacts (root-owned) |

The login shell init auto-discovers `XDG_RUNTIME_DIR`, `WAYLAND_DISPLAY`, and `SWAYSOCK` from `/run/user/$(id -u)`. This is a fallback for interactive shells; services carry these explicitly.

The assertion `(config.users.users.${cfg.user}.linger or false) != true` is critical: Korri must not use pre-session lingering. All user services start from the real greetd/logind session.

---

### 8. `korri-rocknix-audio-bootstrap` — shared Pulse readiness gate

This service is the portable pattern for any platform that needs a Pulse graph to be ready before session services start. Options:

```nix
pulseServer   = "unix:%t/pulse/native";   # where pactl should connect
targetSink    = "alsa_output...";          # declared sink to clamp
safeVolume    = "10%";
serviceScope  = "user" | "system";
failOnSocketUnavailable = true | false;
actions = [ { kind = "clamp-target-sink"; onFailure = "fail" | "continue"; } ... ];
```

The service polls `pactl info` up to 30 s, then executes the action list. Actions include: `clamp-target-sink`, `load-alsa-sink-if-missing`, `clamp-default-sink`, `clamp-current-default-sink`.

**x86 source-machine currently has no equivalent.** After Option A, the host PipeWire graph is already up (managed by NixOS `services.pipewire.*`), so a readiness gate is optional. If launch races occur, the proposal adds a lightweight wait-for-pulse gate analogous to the ROCKNIX pattern.

---

### 9. Source-machine plugin module wiring

The `korri-source-machine` exported module (in `modules.nix`) explicitly includes:

```nix
korri-source-machine = {
  imports = [
    korri            # aggregate: runtime + compositor + daemon + input + login + tailnet
    korri-sessiond
    ../../../plugins/gamescope/nix/source-machine-module.nix
    korri-rpcs3      # ← newly added on this branch
    ../images/source-machine.nix
  ];
};
```

`korri-rpcs3` is the RPCS3 NixOS module (`nixos-module.nix`), which is **disabled by default** (`services.korri.rpcs3.enable = false`). Mountainous enables it per-host. The module-check verifies the module is declared but disabled:

```nix
(check "exported source-machine module exposes opt-in RPCS3 runtime wiring" (
  (options.services.korri.rpcs3.enable.isDefined or false)
  && cfg.services.korri.rpcs3.enable == false
  && !lib.hasInfix "@korri:rpcs3" (daemonEnv.KORRI_ENABLED_PLUGINS or "")
))
```

The `common.nix` / `mkSourceMachineModules` function also threads `sourceMachinePluginNixosModules` to allow downstream compositions.

---

## Issue Conventions

Not applicable — this research targets runtime-session architecture, not GitHub issues.

---

## Documentation Insights

### Relevant solution docs

- `docs/solutions/architecture-patterns/korri-plugin-architecture-2026-06-02.md` — plugin boundary rules
- `docs/solutions/architecture-patterns/gamescope-as-plugin-owned-composition-2026-06-17.md` — generic platform code must not name specific plugins
- `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md` — sessiond lifecycle states

### Active work item

`work/items/active/20260702-rpcs3-aka-source-plugin/x86-pipewire-audio-proposal.md` contains the full Option A decision rationale and validation plan. This research document extends it with repo-level evidence for every claim.

---

## Templates Found

Module pattern — new source-machine-safe plugin module (`nixos-module.nix`):

```nix
{ config, lib, pkgs, ... }:
let
  cfg = config.services.korri.<plugin>;
  command = "${cfg.package}/bin/<binary>";
in {
  options.services.korri.<plugin> = {
    enable = mkEnableOption "Korri <plugin> source-machine runtime wiring";
    package = mkOption { type = types.package; default = pkgs.<plugin>; };
    gamesRoot = mkOption { type = types.str; ... };
    stateRoot = mkOption {
      type = types.str;
      default = "${config.services.korri.runtime.stateRoot}/<plugin>";
    };
    firmwareSentinel = mkOption { type = types.str; ... };
  };

  config = mkIf cfg.enable {
    assertions = [{
      assertion = pkgs.stdenv.hostPlatform.isx86_64;
      message = "Korri <plugin> module currently supports only x86_64-linux.";
    }];

    environment.systemPackages = [ cfg.package ];
    systemd.user.services.korri-sessiond.path = lib.mkAfter [ cfg.package ];

    services.korri.daemon.library.platformDefaults = {
      storage."@korri:<plugin>/games" = { root = cfg.gamesRoot; };
      ...
      launchers."@korri:<plugin>/<app>" = {
        command = command;                  # must be absolute
        args = [ "--no-gui" "{content.path}" ];
        ...
        policy.allowedCommands = [ command ];
      };
    };
  };
}
```

Module check pattern (`module-check.nix`):

```nix
{ pkgs, korriPluginModule }:
let
  # Stub korri.runtime.stateRoot + daemon.library.platformDefaults options
  # so the module can be evaluated standalone.
  baseModule = { lib, ... }: {
    options.services.korri.runtime.stateRoot = lib.mkOption { type = lib.types.str; default = "/var/lib/korri"; };
    options.services.korri.daemon.library.platformDefaults = lib.mkOption { type = lib.types.attrs; default = {}; };
    config = {
      nixpkgs.hostPlatform = pkgs.stdenv.hostPlatform.system;
      boot.loader.grub.devices = [ "nodev" ];
      fileSystems."/" = { device = "/dev/null"; fsType = "ext4"; };
      system.stateVersion = "24.11";
    };
  };
  ...
```

---

## Recommendations

### What to change for Option A (x86 source-machine runtimeDir)

**File: `product/systems/nixos/images/source-machine.nix`**

Add one line to the `services.korri.compositor` block:

```nix
services.korri.compositor = {
  enable = true;
  kiosk.enable = false;
  runtimeDir = lib.mkDefault "%t";    # ← Option A: canonical logind user runtime root
  user = lib.mkDefault runtime.user;
  ...
```

`sessiond.extraEnvironment.XDG_RUNTIME_DIR` and `sessiond.extraEnvironment.SWAYSOCK` are derived from `compositorCfg.runtimeDir`, so they update automatically. No other edits needed in source-machine.nix.

**Optional but recommended: add x86 PipeWire defaults**

Either in `source-machine.nix` or a new `product/systems/nixos/modules/korri-x86-audio.nix`:

```nix
# x86 source-machine audio defaults — use mkDefault so hosts can override
services.pulseaudio.enable = lib.mkDefault false;
services.pipewire.enable = lib.mkDefault true;
services.pipewire.alsa.enable = lib.mkDefault true;
services.pipewire.alsa.support32Bit = lib.mkDefault true;
services.pipewire.pulse.enable = lib.mkDefault true;
services.pipewire.jack.enable = lib.mkDefault true;
services.pipewire.wireplumber.enable = lib.mkDefault true;
security.rtkit.enable = lib.mkDefault true;
```

Gate it on `pkgs.stdenv.hostPlatform.isx86_64` so ROCKNIX platforms never see it.

### Nix checks to add or update

#### `tools/testing/nix/korri-source-machine-image-check.nix`

Add a check that proves the source-machine compositor uses `%t` (canonical runtime):

```nix
(check "source-machine compositor uses canonical logind runtime root" (
  cfg.services.korri.compositor.runtimeDir == "%t"
  && sessiondEnv.XDG_RUNTIME_DIR == "%t"
))
```

The existing check `"sessiond foreground children inherit Wayland identity"` already uses `cfg.services.korri.compositor.runtimeDir` dynamically, so it passes without modification once `runtimeDir = "%t"`.

#### `tools/testing/nix/korri-source-machine-module-check.nix`

Add a check for the canonical runtime assertion:

```nix
(check "source-machine compositor runtimeDir is canonical logind root" (
  cfg.services.korri.compositor.runtimeDir == "%t"
))
```

The existing socket-drift check and SWAYSOCK check both use dynamic `cfg.services.korri.compositor.runtimeDir` values, so they continue to pass.

#### `product/plugins/rpcs3/nix/module-check.nix` (already exists)

No changes needed. It stubs `korri.runtime.stateRoot` and `korri.daemon.library.platformDefaults` correctly and covers all required assertions.

#### `tools/testing/nix/korri-source-machine-module-check.nix`

The existing check already covers:

```nix
(check "exported source-machine module exposes opt-in RPCS3 runtime wiring" (
  (options.services.korri.rpcs3.enable.isDefined or false)
  && cfg.services.korri.rpcs3.enable == false
  && !lib.hasInfix "@korri:rpcs3" (daemonEnv.KORRI_ENABLED_PLUGINS or "")
))
```

This will pass once `korri-rpcs3` is in the `korri-source-machine` imports.

### Architectural risks

| Risk | Evidence | Mitigation |
|---|---|---|
| **Sway socket collision if a desktop session also runs as the same user** | `wayland-1`, `sway-ipc.*.sock` created at `$XDG_RUNTIME_DIR` | Source-machine must be the sole Wayland compositor for that user. Hosts co-running a desktop can override `compositor.runtimeDir` or use a dedicated service user. |
| **`RuntimeDirectory = korri` in sessiond creates `$XDG_RUNTIME_DIR/korri`** — this is relative to sessiond's own `$XDG_RUNTIME_DIR` | `korri-sessiond.nix` `serviceConfig.RuntimeDirectory = "korri"` | After Option A, sessiond's `$XDG_RUNTIME_DIR` is `/run/user/<uid>` (same as compositor), so the socket appears at `/run/user/<uid>/korri/sessiond.sock`. Correct. |
| **dbus-run-session creates an ephemeral bus address** | With `mode = "private"`, the bus socket path is not stable or predictable | For source-machine, this is acceptable: RPCS3/games connect to the bus implicitly; no explicit `DBUS_SESSION_BUS_ADDRESS` is needed. If portals or AT-SPI are required, the kiosk seeding pattern (`korri-kiosk-session-environment`) could be adapted, but Option A defers this. |
| **ROCKNIX SM8550 `compositor.runtimeDir = "%t"` remains unchanged** | Already set in `rocknix-sm8550.nix` | No change needed; SM8550 is already on Option A semantics. |
| **ROCKNIX RK3566 compositor runs as root** | `user = "root"`, `createUser = false`, `runtimeDir = "%t"` | The root compositor's `%t` is `/run/user/0` (root logind runtime). Main-space PipeWire sockets are at `/run/user/<korri-uid>` (not `/run/user/0`). This is why RK3566 explicitly sets `PULSE_SERVER` and `PIPEWIRE_RUNTIME_DIR` and disables user-level PipeWire. Root compositor + Option A do not conflict but require explicit audio variables. |
| **gameStream wrapper `id -u` diverges from compositor user on multi-user hosts** | Sunshine can run as the compositor user or the system service user | The wrapper explicitly derives `korri_user_runtime_dir="/run/user/$(id -u)"` which is the Sunshine app user's runtime. Ensure source-machine Sunshine runs as the same user as the compositor. |
| **`services.korri.rpcs3` stateRoot default** | `${config.services.korri.runtime.stateRoot}/rpcs3` | On Aka, `runtime.stateRoot = "/var/lib/korri"`, so default is `/var/lib/korri/rpcs3`. Mountainous must override with the real Towada path. The `module-check.nix` explicitly uses a custom `stateRoot` so the default is not tested against a Towada path. |
| **No audio readiness gate for x86** | RPCS3 Cubeb error was a race: Korri launched before PipeWire was ready | After Option A, PipeWire is at the standard path. If launch races persist, add a `systemd.user.services.korri-compositor.after` dependency on `pipewire.service` and `pipewire-pulse.service`. This is not needed for the current fix but should be tracked. |

### Files to touch for the complete Option A implementation

| File | Change type | What changes |
|---|---|---|
| `product/systems/nixos/images/source-machine.nix` | **Required** | Add `services.korri.compositor.runtimeDir = lib.mkDefault "%t"` |
| `product/systems/nixos/images/source-machine.nix` | Optional | Add x86 PipeWire defaults (`mkDefault`) or extract to `korri-x86-audio.nix` |
| `tools/testing/nix/korri-source-machine-image-check.nix` | **Required** | Add `runtimeDir == "%t"` check |
| `tools/testing/nix/korri-source-machine-module-check.nix` | **Required** | Add `runtimeDir == "%t"` check |
| `product/systems/nixos/flake/modules.nix` | Already done | `korri-source-machine` already includes `korri-rpcs3` |
| `product/plugins/rpcs3/nix/module-check.nix` | No change | Existing checks cover all RPCS3 module assertions |
| `Mountainous: hosts/aka/default.nix` | Out of scope (this repo) | Enable `services.korri.rpcs3`, configure paths, extend `KORRI_ENABLED_PLUGINS` |

### Patterns not to follow

- Do not set `PULSE_SERVER` globally in `source-machine.nix` as a default. Under Option A, it is not needed for the normal case. Keep it as a host/plugin escape hatch only (e.g., for hosts with unusual audio topology).
- Do not introduce `PIPEWIRE_RUNTIME_DIR` in the source-machine session environment by default. The standard path is discoverable under `$XDG_RUNTIME_DIR` after Option A.
- Do not mirror the RK3566 `rocknix.session.runtimeDir.uid` pattern on x86; that exists only to remap a root-owned main-space graph into the Korri user's XDG runtime.
- Do not use `sessionBus.mode = "existing"` on x86 source-machine. The private dbus-run-session bus is correct for the Aka topology; `existing` mode is for ROCKNIX guests where the substrate must own the bus lifecycle.
- Do not add `korri-kiosk-session-environment` style user-manager seeding to source-machine without first proving a portal/AT-SPI dependency exists. It was added to kiosk for a specific GTK `cannot open display` regression and is not needed for source-machine RPCS3 launches.

---

## Cross-Platform Summary Table

| Variable | x86 source-machine (before) | **x86 source-machine (Option A)** | SM8550 kiosk | RK3566 kiosk |
|---|---|---|---|---|
| compositor `runtimeDir` | `%t/korri-compositor` | **`%t`** | `%t` | `%t` (root) |
| sessiond `XDG_RUNTIME_DIR` | `/run/user/<uid>/korri-compositor` | **`/run/user/<uid>`** | `/run/user/<uid>` | `/run/user/0` |
| sessiond `SWAYSOCK` | `%t/korri-compositor/sway-ipc.sock` | **`%t/sway-ipc.sock`** | `%t/sway-ipc.sock` | `%t/sway-ipc.sock` |
| sessiond socket | `%t/korri/sessiond.sock` | `%t/korri/sessiond.sock` | `%t/korri/sessiond.sock` | `%t/korri/sessiond.sock` |
| `DBUS_SESSION_BUS_ADDRESS` | dbus-run-session (ephemeral) | dbus-run-session (ephemeral) | `unix:path=%t/bus` (platform) | `unix:path=%t/bus` (platform) |
| `PULSE_SERVER` | ❌ not set (root cause of crash) | **not needed** (standard path) | `unix:%t/pulse/native` | `unix:/run/user/<uid>/pulse/native` |
| PipeWire scope | host-managed (`services.pipewire.*`) | host-managed + **Korri defaults** | user-scope (Korri-owned) | system-scope (substrate) |
| seatBackend | `logind` | `logind` | `logind` | `direct` |
| sessionBus.mode | `private` | `private` | `existing` | `existing` |
| RPCS3 path | — | `${rpcs3pkg}/bin/rpcs3` (via module) | — | — |
