# External Runtime/Session Documentation

**Date:** 2026-07-02  
**Purpose:** Reference documentation for NixOS module design and test assertions covering `services.pipewire` options, systemd user `RuntimeDirectory`/`%t` specifier behavior, `XDG_RUNTIME_DIR` lifecycle, PipeWire/PulseAudio socket path discovery, and `dbus-run-session` behavior.  
**Informs:** `x86-pipewire-audio-proposal.md` → Korri source-machine NixOS module implementation.

---

## 1. systemd specifier `%t` — Runtime Directory Root

**Source:** [systemd.unit(5) Specifiers table — Arch man pages](https://man.archlinux.org/man/systemd.unit.5)

| Specifier | Meaning | System manager value | User manager value |
|---|---|---|---|
| `%t` | Runtime directory root | `/run/` | `$XDG_RUNTIME_DIR` |

> **Exact quote (systemd.unit(5)):**
> `%t` — **Runtime directory root.** This is either `/run/` (for the system manager) or the path `"$XDG_RUNTIME_DIR"` resolves to (for user managers).

### Key implications for NixOS module authoring

- A user unit with `RuntimeDirectory=korri/sessiond` creates `$XDG_RUNTIME_DIR/korri/sessiond` (not `/run/korri/sessiond`).
- A user unit with `RuntimeDirectory=%t/korri-compositor` is redundant — `%t` already resolves to `$XDG_RUNTIME_DIR` in user context. Writing `RuntimeDirectory=korri-compositor` is equivalent.
- In Nix `systemd.user.services.<name>.serviceConfig.RuntimeDirectory`, paths are relative to `$XDG_RUNTIME_DIR` (not to `/run/`).
- The proposal pattern `services.korri.compositor.runtimeDir = "%t"` expands to `$XDG_RUNTIME_DIR` in user units — this is the full logind user runtime, not a subdirectory.
- The default pattern `services.korri.compositor.runtimeDir = "%t/korri-compositor"` expands to `$XDG_RUNTIME_DIR/korri-compositor`.

### Other specifiers relevant to NixOS module paths

| Specifier | User manager value |
|---|---|
| `%C` | `$XDG_CACHE_HOME` |
| `%E` | `$XDG_CONFIG_HOME` |
| `%h` | Home directory of the user running the service manager |
| `%S` | `$XDG_STATE_HOME` |
| `%u` | Username of the user running the service manager |
| `%U` | Numeric UID of the user running the service manager |

---

## 2. `RuntimeDirectory=` in User Services

**Source:** [systemd.exec(5) — Arch man pages](https://man.archlinux.org/man/systemd.exec.5)

### Table: Directory options and their base paths per manager type

| Setting | System manager base | User manager base | Env var set |
|---|---|---|---|
| `RuntimeDirectory=` | `/run/` | `$XDG_RUNTIME_DIR` | `$RUNTIME_DIRECTORY` |
| `StateDirectory=` | `/var/lib/` | `$XDG_STATE_HOME` | `$STATE_DIRECTORY` |
| `CacheDirectory=` | `/var/cache/` | `$XDG_CACHE_HOME` | `$CACHE_DIRECTORY` |

### `RuntimeDirectory=` behavior

```
# In a user unit:
[Service]
RuntimeDirectory=korri/sessiond

# This creates $XDG_RUNTIME_DIR/korri (if absent) and $XDG_RUNTIME_DIR/korri/sessiond
# Sets RUNTIME_DIRECTORY=$XDG_RUNTIME_DIR/korri/sessiond
# Removes $XDG_RUNTIME_DIR/korri/sessiond on service stop (default)
```

- Innermost directories are **owned by the user and group** specified in `User=`/`Group=` and removed on stop.
- Parent directories (e.g. `korri/` in `korri/sessiond`) are created but **not removed** on stop.
- `RuntimeDirectoryPreserve=yes|restart` keeps the directory across stop/restart.
- These directories are always created under the standard runtime path — there is no way to change the base.

### `$XDG_RUNTIME_DIR` env variable in user services

> **Exact quote (systemd.exec(5)):**
> `$XDG_RUNTIME_DIR` — The directory to use for runtime objects (such as IPC objects) and volatile state. **Set for all services run by the user systemd instance**, as well as any system services that use `PAMName=` with a PAM stack that includes `pam_systemd`. See below and `pam_systemd(8)` for more information.

This means **every user service gets `$XDG_RUNTIME_DIR`** automatically from the user manager. A Korri user service that overrides `Environment=XDG_RUNTIME_DIR=...` is replacing the standard value.

---

## 3. `XDG_RUNTIME_DIR` Lifecycle — `pam_systemd(8)`

**Source:** [pam_systemd(8) — Arch man pages](https://man.archlinux.org/man/pam_systemd.8)

### Creation and removal

On login, `pam_systemd`:
1. Creates `/run/user/$UID` as a private `tmpfs` mount (or mounts it fresh) with quota applied.
2. Sets `$XDG_RUNTIME_DIR=/run/user/$UID` in the user's environment.
3. Creates a new systemd scope and starts `user@.service` (the user manager).

On final logout:
1. Removes `/run/user/$UID` and all its contents.

> **Exact quote (pam_systemd(8)):**
> `$XDG_RUNTIME_DIR` — Path to a user-private user-writable directory that is bound to the user login time on the machine. It is automatically created the first time a user logs in and removed on the user's final logout. If a user logs in twice at the same time, both sessions will see the same `$XDG_RUNTIME_DIR` and the same contents. **$XDG_RUNTIME_DIR is not set if the current user is not the original user of the session.**

### Canonical path

```
$XDG_RUNTIME_DIR = /run/user/<uid>
```

For a user with UID 1000: `XDG_RUNTIME_DIR=/run/user/1000`

### Lingering users (headless / source-machine)

For users with `users.users.<name>.linger = true`, the user runtime and user manager are kept alive even without an active login session. The `$XDG_RUNTIME_DIR` path is maintained continuously.

---

## 4. NixOS `services.pipewire` Options

**Source:** [nixpkgs nixos-unstable — pipewire.nix](https://raw.githubusercontent.com/NixOS/nixpkgs/nixos-unstable/nixos/modules/services/desktops/pipewire/pipewire.nix)  
**Source:** [NixOS Wiki — PipeWire](https://wiki.nixos.org/wiki/PipeWire)

### Core options

| Option | Type | Default | Description |
|---|---|---|---|
| `services.pipewire.enable` | bool | `false` | Enable PipeWire service |
| `services.pipewire.package` | package | `pkgs.pipewire` | PipeWire derivation |
| `services.pipewire.socketActivation` | bool | `true` | Auto-run when connections made to the socket |
| `services.pipewire.audio.enable` | bool | derived | Use PipeWire as the primary sound server |
| `services.pipewire.alsa.enable` | bool | `false` | ALSA support |
| `services.pipewire.alsa.support32Bit` | bool | `false` | 32-bit ALSA support on 64-bit systems |
| `services.pipewire.jack.enable` | bool | `false` | JACK audio emulation |
| `services.pipewire.pulse.enable` | bool | `false` | PulseAudio server emulation |
| `services.pipewire.systemWide` | bool | `false` | System-wide PipeWire (not recommended) |
| `services.pipewire.wireplumber.enable` | bool | `services.pipewire.enable` | WirePlumber session/policy manager |
| `services.pipewire.raopOpenFirewall` | bool | `false` | Open UDP/6001-6002 for AirPlay/RAOP |

### Extra configuration options

| Option | Type | Drop-in path |
|---|---|---|
| `services.pipewire.extraConfig.pipewire` | `attrsOf json.type` | `/etc/pipewire/pipewire.conf.d/*.conf` |
| `services.pipewire.extraConfig.pipewire-pulse` | `attrsOf json.type` | `/etc/pipewire/pipewire-pulse.conf.d/*.conf` |
| `services.pipewire.extraConfig.jack` | `attrsOf json.type` | `/etc/pipewire/jack.conf.d/*.conf` |
| `services.pipewire.extraConfig.client` | `attrsOf json.type` | `/etc/pipewire/client.conf.d/*.conf` |
| `services.pipewire.configPackages` | `listOf package` | Packages providing `share/pipewire/*/*.conf` |
| `services.pipewire.wireplumber.extraConfig` | `attrsOf (attrsOf json.type)` | `/share/wireplumber/wireplumber.conf.d/*.conf` |
| `services.pipewire.wireplumber.configPackages` | `listOf package` | Packages providing WirePlumber config |

### Module implementation details (from nixpkgs source)

```nix
# PipeWire depends on DBUS but doesn't list it. Without this booting
# into a terminal results in the service crashing with an error.
systemd.services.pipewire.bindsTo = [ "dbus.service" ];
systemd.user.services.pipewire.bindsTo = [ "dbus.service" ];

# Enable either system or user units.
systemd.user.sockets.pipewire.enable = !cfg.systemWide;
systemd.user.services.pipewire.enable = !cfg.systemWide;
systemd.user.services.pipewire-pulse.enable = cfg.pulse.enable && !cfg.systemWide;
systemd.user.sockets.pipewire-pulse.enable = cfg.pulse.enable && !cfg.systemWide;

# Socket activation: wantedBy sockets.target
systemd.user.sockets.pipewire.wantedBy = mkIf cfg.socketActivation [ "sockets.target" ];
systemd.user.sockets.pipewire-pulse.wantedBy = mkIf cfg.socketActivation [ "sockets.target" ];
```

WirePlumber starts as a dependency of `pipewire.service`:
```nix
systemd.user.services.wireplumber.wantedBy = [ "pipewire.service" ];
```

### Canonical x86 source-machine audio configuration

Per the proposal and NixOS wiki:

```nix
services.pulseaudio.enable = lib.mkDefault false;
services.pipewire = {
  enable = lib.mkDefault true;
  alsa.enable = lib.mkDefault true;
  alsa.support32Bit = lib.mkDefault true;  # required for 32-bit game compatibility
  pulse.enable = lib.mkDefault true;
  jack.enable = lib.mkDefault true;
  wireplumber.enable = lib.mkDefault true;
};
security.rtkit.enable = lib.mkDefault true;
```

Use `mkDefault` so host-level overrides take precedence without conflict.

### Headless / lingering service activation

Socket activation can be too slow for headless startup races. For source-machine services that need audio ready before first launch:

```nix
# Disable socket activation for early startup
services.pipewire.socketActivation = false;
# Start WirePlumber (with PipeWire) at user session boot
systemd.user.services.wireplumber.wantedBy = [ "default.target" ];
# Keep user services alive without a login session
users.users.<name>.linger = true;
```

### Assertions enforced by the module

1. `services.pipewire.audio.enable` requires `services.pulseaudio.enable = false`.
2. `services.pipewire.jack.enable` requires `services.jack.jackd.enable = false`.
3. `alsa.enable` or `pulse.enable` requires `audio.enable = true`.
4. Cannot use `environment.etc."pipewire<...>"` directly — use `extraConfig` or `configPackages` only.

### RTKit configuration

The module automatically configures PAM login limits for the `pipewire` group:

```nix
security.pam.loginLimits = [
  { domain = "@pipewire"; item = "rtprio";  type = "-"; value = 95;      }
  { domain = "@pipewire"; item = "nice";    type = "-"; value = -19;     }
  { domain = "@pipewire"; item = "memlock"; type = "-"; value = 4194304; }
];
```

`security.rtkit.enable = true` provides realtime scheduling via RTKit without requiring the service to run as root.

---

## 5. PipeWire Socket Path Discovery

**Source:** [pipewire(1) — PipeWire docs 1.6.7](https://pipewire.pages.freedesktop.org/pipewire/page_man_pipewire_1.html)

### PipeWire native socket (for `pw-cli`, native clients)

Resolution order:

1. `$PIPEWIRE_RUNTIME_DIR/<socket-name>`
2. `$XDG_RUNTIME_DIR/<socket-name>`
3. `$USERPROFILE/<socket-name>`

Default socket name: `pipewire-0`  
Override: `PIPEWIRE_CORE` (server socket name), `PIPEWIRE_REMOTE` (client connection target)

**Canonical path:** `$XDG_RUNTIME_DIR/pipewire-0`  
**On Aka with UID 1000:** `/run/user/1000/pipewire-0`

### PipeWire PulseAudio-compatible socket (for PulseAudio clients)

**Source:** [pipewire-pulse(1) — PipeWire docs 1.6.7](https://pipewire.pages.freedesktop.org/pipewire/page_man_pipewire-pulse_1.html)

Resolution order:

1. `$PULSE_RUNTIME_PATH/native`
2. `$XDG_RUNTIME_DIR/pulse/native`

> **Exact quote (pipewire-pulse(1)):**
> `PULSE_RUNTIME_PATH` / `XDG_RUNTIME_DIR` — Directory where to create the native protocol pulseaudio socket.

**Canonical path:** `$XDG_RUNTIME_DIR/pulse/native`  
**On Aka with UID 1000:** `/run/user/1000/pulse/native`

### Environment variable escape hatches

For cases where `XDG_RUNTIME_DIR` is wrong (e.g. the Korri compositor private runtime), explicit overrides can redirect clients:

```bash
# Redirect PulseAudio-compatible clients to the real pulse socket
PULSE_SERVER=unix:/run/user/1000/pulse/native

# Redirect native PipeWire clients to the real runtime
PIPEWIRE_RUNTIME_DIR=/run/user/1000
```

These are the overrides verified working in the Aka diagnosis:
```bash
# Fails (private runtime, no pulse socket):
XDG_RUNTIME_DIR=/run/user/1000/korri-compositor pactl info

# Works (explicit socket override):
XDG_RUNTIME_DIR=/run/user/1000/korri-compositor \
  PULSE_SERVER=unix:/run/user/1000/pulse/native pactl info

# Works (explicit PipeWire runtime override):
XDG_RUNTIME_DIR=/run/user/1000/korri-compositor \
  PIPEWIRE_RUNTIME_DIR=/run/user/1000 pw-cli info 0
```

### Verification commands

```bash
# Verify PipeWire socket is reachable
pw-cli info 0

# Verify PulseAudio-compatible socket is reachable
pactl info

# Check what socket PipeWire is using
systemctl --user show pipewire.service -p ExecStart
ls -la "$XDG_RUNTIME_DIR/pipewire-0"
ls -la "$XDG_RUNTIME_DIR/pulse/native"

# Inspect environment of a running service
systemctl --user show korri-sessiond.service -p Environment
```

---

## 6. `dbus-run-session` Behavior

**Source:** [dbus-run-session(1) — Arch man pages](https://man.archlinux.org/man/dbus-run-session.1)

### What it does

`dbus-run-session` starts a **new, isolated `dbus-daemon`** for the session bus and runs a program within it. The daemon runs for as long as the program does, then terminates.

```
dbus-run-session -- PROGRAM [ARGUMENTS...]
```

### Environment effects

Variables **set** in the child process:
- `DBUS_SESSION_BUS_ADDRESS` — address of the **newly created** session bus (always overrides any pre-existing value)

Variables **removed** from the child process environment (if present):
- `DBUS_SESSION_BUS_PID`
- `DBUS_SESSION_BUS_WINDOWID`
- `DBUS_STARTER_BUS_TYPE`
- `DBUS_STARTER_ADDRESS`

### Critical behavior: ignores existing `DBUS_SESSION_BUS_ADDRESS`

`dbus-run-session` always starts a new daemon and **overwrites `DBUS_SESSION_BUS_ADDRESS`** regardless of what was in the parent environment. The parent's session bus is invisible to the child program.

**Implication for module design:**

If Korri wraps a launch with `dbus-run-session` and the user already has a functioning session bus (registered via `pam_systemd` / `user@.service`), the wrapped program will connect to a brand-new isolated bus, not the user's regular session bus. Services using D-Bus (portals, PipeWire, NetworkManager) will be unreachable unless they are also running within the same isolated bus namespace.

PipeWire (as configured by NixOS) binds to `dbus.service` and communicates over the **user session bus** registered with `systemd-logind`. If RPCS3 or Korri processes are launched within an environment where `DBUS_SESSION_BUS_ADDRESS` points to a fresh isolated bus (from `dbus-run-session`), PipeWire's DBus-dependent features (RTKit, portal access, session tracking) will fail.

**When `dbus-run-session` is appropriate:**
- Isolated test environments where no session bus exists yet.
- CI/test harnesses (e.g., `make check`) needing a clean session.
- SSH sessions without a graphical session bus.

**When NOT to use it:**
- Launching game processes that must communicate with host PipeWire, portals, or other user-session DBus services.
- Source-machine game launches where the user session bus is already established.

### Checking for an existing session bus

```bash
# Will succeed if a real session bus is already running:
dbus-send --session --dest=org.freedesktop.DBus \
  --type=method_call --print-reply \
  /org/freedesktop/DBus org.freedesktop.DBus.GetId
```

For source-machine launches, `DBUS_SESSION_BUS_ADDRESS` will already be set by `pam_systemd` / `user@.service` and should be inherited directly, not replaced by `dbus-run-session`.

---

## 7. PipeWire Configuration Format Reference

**Source:** [pipewire.conf(5) — PipeWire docs 1.6.7](https://pipewire.pages.freedesktop.org/pipewire/page_man_pipewire_conf_5.html)  
**Source:** [pipewire-pulse.conf(5) — PipeWire docs 1.6.7](https://pipewire.pages.freedesktop.org/pipewire/page_man_pipewire-pulse_conf_5.html)

### Config file lookup order

PipeWire reads configuration in this order (later overrides earlier):

1. `/usr/share/pipewire/pipewire.conf`
2. `/etc/pipewire/pipewire.conf`
3. `$XDG_CONFIG_HOME/pipewire/pipewire.conf`

Drop-in directories (all `*.conf` files merged):

1. `/usr/share/pipewire/pipewire.conf.d/`
2. `/etc/pipewire/pipewire.conf.d/`
3. `$XDG_CONFIG_HOME/pipewire/pipewire.conf.d/`

NixOS writes to `/etc/pipewire/` via `services.pipewire.extraConfig.*` and `configPackages`.

### Key `context.properties` relevant to audio reliability

```
core.name = pipewire-0        # socket name (changes PIPEWIRE_CORE)
default.clock.rate = 48000    # sample rate
default.clock.quantum = 1024  # default buffer size
default.clock.min-quantum = 32
default.clock.max-quantum = 8192
```

### Socket-activation vs. eager-start tradeoff

Socket activation (`services.pipewire.socketActivation = true`, the default) means PipeWire and pipewire-pulse only start when a client connects. For source-machine game launches, this can cause a race where a game connects before PipeWire is fully ready. The NixOS wiki recommends disabling socket activation for headless setups:

```nix
services.pipewire.socketActivation = false;
systemd.user.services.wireplumber.wantedBy = [ "default.target" ];
users.users.<name>.linger = true;
```

---

## 8. Summary: Module Design Assertions and Test Gates

### `XDG_RUNTIME_DIR` assertions

| Assertion | Command | Expected |
|---|---|---|
| Source-machine compositor uses canonical runtime | `systemctl --user show korri-sessiond.service -p Environment` | `XDG_RUNTIME_DIR=/run/user/<uid>` |
| Compositor config sets `%t` (not `%t/korri-compositor`) | Nix module-eval check | `services.korri.compositor.runtimeDir = "%t"` default on source-machine |
| Base compositor still defaults to private runtime | Nix module-eval check | `services.korri.compositor.runtimeDir = "%t/korri-compositor"` outside source-machine |

### Audio socket assertions

| Assertion | Command | Expected |
|---|---|---|
| PipeWire socket exists | `test -S /run/user/1000/pipewire-0` | exit 0 |
| Pulse socket exists | `test -S /run/user/1000/pulse/native` | exit 0 |
| PipeWire reachable | `XDG_RUNTIME_DIR=/run/user/1000 pw-cli info 0` | no error |
| Pulse reachable | `XDG_RUNTIME_DIR=/run/user/1000 pactl info` | server info printed |
| RPCS3 process has correct runtime | `/proc/<pid>/environ` | `XDG_RUNTIME_DIR=/run/user/1000` (not `/run/user/1000/korri-compositor`) |

### D-Bus assertions

| Assertion | Command | Expected |
|---|---|---|
| Session bus exists | `echo $DBUS_SESSION_BUS_ADDRESS` | non-empty, `unix:path=...` format |
| Source-machine launch inherits session bus | Check RPCS3 `/proc/<pid>/environ` | `DBUS_SESSION_BUS_ADDRESS` matches user session bus |
| No `dbus-run-session` wrapping in normal launch path | Audit korri-sessiond ExecStart | No `dbus-run-session` in RPCS3/Gamescope invocation |

### NixOS module-eval assertions (Nix checks)

```nix
# Prove source-machine enables PipeWire defaults
(import <nixpkgs/nixos/lib/testing-python.nix> {...}).runTest {
  nodes.machine = { config, ... }: {
    imports = [ ./source-machine.nix ];
  };
  testScript = ''
    assert machine.succeed("nixos-option services.pipewire.enable") == "true"
    assert machine.succeed("nixos-option services.pipewire.pulse.enable") == "true"
    assert machine.succeed("nixos-option services.pipewire.wireplumber.enable") == "true"
  '';
}
```

---

## 9. References

| Document | URL | Version |
|---|---|---|
| systemd.unit(5) — Specifiers | https://man.archlinux.org/man/systemd.unit.5 | systemd current |
| systemd.exec(5) — RuntimeDirectory | https://man.archlinux.org/man/systemd.exec.5 | systemd current |
| pam_systemd(8) — XDG_RUNTIME_DIR creation | https://man.archlinux.org/man/pam_systemd.8 | systemd 261.1 |
| pipewire(1) — Socket env vars | https://pipewire.pages.freedesktop.org/pipewire/page_man_pipewire_1.html | PipeWire 1.6.7 |
| pipewire-pulse(1) — PULSE_RUNTIME_PATH | https://pipewire.pages.freedesktop.org/pipewire/page_man_pipewire-pulse_1.html | PipeWire 1.6.7 |
| pipewire.conf(5) | https://pipewire.pages.freedesktop.org/pipewire/page_man_pipewire_conf_5.html | PipeWire 1.6.7 |
| pipewire-pulse.conf(5) | https://pipewire.pages.freedesktop.org/pipewire/page_man_pipewire-pulse_conf_5.html | PipeWire 1.6.7 |
| dbus-run-session(1) | https://man.archlinux.org/man/dbus-run-session.1 | D-Bus 1.16.2 |
| NixOS Wiki — PipeWire | https://wiki.nixos.org/wiki/PipeWire | NixOS 24.11+ |
| nixpkgs — pipewire.nix | https://github.com/NixOS/nixpkgs/blob/nixos-unstable/nixos/modules/services/desktops/pipewire/pipewire.nix | nixos-unstable |
| nixpkgs — wireplumber.nix | https://github.com/NixOS/nixpkgs/blob/nixos-unstable/nixos/modules/services/desktops/pipewire/wireplumber.nix | nixos-unstable |
