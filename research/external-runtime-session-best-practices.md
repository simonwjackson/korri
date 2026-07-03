# Linux Runtime Session Best Practices for Korri NixOS Modules

**Scope:** XDG_RUNTIME_DIR semantics, systemd user manager `%t` specifier,
D-Bus session bus, PipeWire / pipewire-pulse socket discovery, and when
`PULSE_SERVER` / `PIPEWIRE_RUNTIME_DIR` should be set. Grounded in
official specs, systemd / PipeWire upstream docs, and Korri's own module
corpus.

---

## 1. XDG_RUNTIME_DIR

### Spec definition (XDG Base Directory Spec v0.8)

`$XDG_RUNTIME_DIR` is the single base directory for user-specific,
non-essential **runtime** files: Unix sockets, named pipes, lock files, and
similar ephemeral IPC objects.

Mandatory constraints from the spec:

| Property | Requirement |
|---|---|
| Owner | The logged-in user; no other account may have read/write access |
| Mode | `0700` |
| Filesystem | Local; must support `AF_UNIX` sockets, symlinks, hard links, file locking, memory mapping |
| Lifetime | Created on first login, removed on last logout; files must NOT survive reboot or a full login cycle |

### systemd / pam_systemd implementation

On any systemd + logind + PAM system (including NixOS):

- `pam_systemd` creates `/run/user/$UID` when the user opens their first session.
- `/run/user/$UID` is a `tmpfs` mount scoped to that login lifetime.
- `XDG_RUNTIME_DIR=/run/user/$UID` is injected into the PAM session environment and propagated to the systemd user instance (`user@$UID.service`).

**Critical:** `XDG_RUNTIME_DIR` is only set when there is a real logind
session. `su - korri`, `runuser`, and similar tools do NOT create one; only
`greetd`, `agetty`, `sshd`, or `machinectl shell` (which go through PAM with
pam_systemd) do.

**Korri implication (enforced by assertion in `korri-runtime.nix`):**

```nix
assertion = (config.users.users.${cfg.user}.linger or false) != true;
message = "Korri must not use pre-session lingering; start korri-session.target from a real greetd/logind session.";
```

Lingering starts the user manager without a logind session; some
session-owned facts (e.g., seat assignment) are unavailable, and on
constrained guests this has caused partial environment failures.

### Do not set XDG_RUNTIME_DIR manually in NixOS

The ArchWiki caution applies here too:

> `XDG_RUNTIME_DIR` is automatically set by `pam_systemd(8)`, so you should
> remove any instances of it being set in your initialization files.

In Korri modules, there are exactly two legitimate override sites:

1. **Shell init for login sessions** (`korri-runtime.nix`): sets
   `XDG_RUNTIME_DIR="/run/user/$(id -u)"` in `loginShellInit` / `interactiveShellInit`
   so that interactive shells and greetd-spawned shells that predate full PAM
   propagation have the correct value. This is a defensive shim, not a
   bypass.

2. **System service that pre-dates the user manager** (e.g., RK3566
   `korri-rocknix-audio-bootstrap.service` running as a system service):
   sets `XDG_RUNTIME_DIR = "/run/user/${uid}"` explicitly in
   `systemd.services.*.environment` because system services do not
   inherit the user-manager environment.

User services (under `systemd.user.*`) must **not** set `XDG_RUNTIME_DIR`
manually; they inherit it from the user manager, which inherited it from
PAM.

---

## 2. systemd user manager `%t` specifier

### What `%t` means

In any systemd unit file (user or system), `%t` is a **specifier** that
expands to `$XDG_RUNTIME_DIR` at unit-startup time. For user units this
equals `/run/user/$UID`. For system units this equals `/run`.

Source: [systemd.unit(5) §SPECIFIERS](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html#Specifiers)

### Canonical usage pattern: `RuntimeDirectory=`

The correct way to create a private runtime subdirectory in a user unit:

```ini
[Service]
RuntimeDirectory = korri-compositor
RuntimeDirectoryMode = 0700
```

This creates `/run/user/$UID/korri-compositor` (mode 0700) at service
start and removes it at stop. The directory is owned by the service user.
No shell expansion or string concatenation is required.

In Nix / NixOS:

```nix
systemd.user.services.korri-compositor = {
  serviceConfig = {
    RuntimeDirectory = "korri-compositor";  # ← no %t, no /run/user
    RuntimeDirectoryMode = "0700";
  };
};
```

When the module option `runtimeDir` is `%t/korri-compositor`, Korri
derives the `RuntimeDirectory` value by stripping the `%t/` prefix:

```nix
runtimeDirectoryName = lib.removePrefix "%t/" cfg.runtimeDir;
# → "korri-compositor"
```

### `%t` in `environment=` blocks

`%t` is also valid in `environment=` entries and `ExecStart=` args inside
unit files. systemd expands it before launching the process:

```nix
# In a systemd.user.services.*.environment block:
environment = {
  PULSE_SERVER = "unix:%t/pulse/native";   # ✓ expanded by systemd
  DBUS_SESSION_BUS_ADDRESS = "unix:path=%t/bus";  # ✓ expanded by systemd
};
```

Korri's SM8550 platform adapter does exactly this:

```nix
korriPulseServer = "unix:%t/pulse/native";
# …used in systemd.user.services.*.environment.PULSE_SERVER = korriPulseServer
```

### `%t` outside of systemd-evaluated contexts

`%t` is **not** expanded in:

- Shell scripts launched as child processes (use `$XDG_RUNTIME_DIR` instead)
- Values passed to `exec` / `swaymsg exec` / `chromium --browser-env=`
- NixOS option values read by non-systemd code at evaluation time

Korri's compositor-exec helper resolves this by pattern-matching:

```sh
case "$configured_runtime_dir" in
  %t)    runtime_dir="$XDG_RUNTIME_DIR" ;;
  %t/*)  runtime_dir="$XDG_RUNTIME_DIR/${configured_runtime_dir#%t/}" ;;
  *)     runtime_dir="$configured_runtime_dir" ;;
esac
```

And when passing `PULSE_SERVER` to the Chromium kiosk (which is launched
via shell), Korri uses the absolute path derived at Nix eval time:

```nix
# For chromium kiosk --browser-env= args (not systemd unit environment):
"--browser-env=PULSE_SERVER=unix:${korriRuntimeDir}/pulse/native"
# where korriRuntimeDir = "/run/user/${korriRuntimeUid}"
```

---

## 3. D-Bus session bus at `$XDG_RUNTIME_DIR/bus`

### Two bus placement strategies

| Strategy | Socket location | Who starts it | How address is communicated |
|---|---|---|---|
| **Traditional / private** | Random path under `/tmp` | `dbus-launch` or `dbus-run-session` wrapping the compositor | `DBUS_SESSION_BUS_ADDRESS` set at `exec` time; not visible to other user sessions/services |
| **Systemd user bus** *(recommended)* | `$XDG_RUNTIME_DIR/bus` = `/run/user/$UID/bus` | `dbus.service` / `dbus.socket` user units (dbus-broker or dbus-daemon built with systemd support) | `pam_systemd` injects `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$UID/bus`; shared across all user sessions and all user units |

The "user bus" at `$XDG_RUNTIME_DIR/bus` is the canonical modern approach.
It means all user services automatically have the correct bus address
without explicit environment plumbing.

### dbus-run-session vs user bus

`dbus-run-session` creates a private, compositor-lifetime bus. Peer user
services that start later (e.g., `korri-daemon`, `korri-sunshine`) cannot
access it because they were not spawned as children of the
`dbus-run-session` process tree and do not inherit `DBUS_SESSION_BUS_ADDRESS`.

`dbus-run-session` is appropriate when:
- The platform or substrate does not provide a user bus.
- The compositor owns an isolated session that no other user service needs to reach.

User bus (`$XDG_RUNTIME_DIR/bus`) is appropriate when:
- Multiple peer user services need D-Bus communication.
- The platform provides a persistent `dbus.socket` user unit.

### Korri module options

`korri-compositor.nix` encodes both strategies:

```nix
sessionBus.mode = "private"   # → dbus-run-session -- sway
sessionBus.mode = "existing"  # → sway directly, DBUS_SESSION_BUS_ADDRESS set from sessionBus.address
```

SM8550 (NixOS user manager + dbus-broker user unit available):

```nix
sessionBus = {
  mode = lib.mkDefault "existing";
  address = lib.mkDefault "unix:path=%t/bus";
};
```

RK3566 (system-service compositor, explicit env):

```nix
environment.DBUS_SESSION_BUS_ADDRESS = "unix:path=${rk3566RuntimeDir}/bus";
```

### NixOS wiring

On NixOS with `services.dbus.implementation = "broker"` (the default on
recent NixOS):

- `dbus-broker` installs `dbus.service` and `dbus.socket` as **user** units.
- The socket listens at `$XDG_RUNTIME_DIR/bus`.
- `pam_systemd` sets `DBUS_SESSION_BUS_ADDRESS` to point there.
- All user units inherit the correct address without explicit configuration.

No action required in Korri modules on platforms where the NixOS dbus
module is active and the user runs under a proper logind session.

---

## 4. PipeWire socket discovery

### Native protocol socket (`pipewire-0`)

PipeWire's `libpipewire-module-protocol-native` creates Unix sockets for
IPC between the PipeWire server and clients. Discovery priority order
(from official PipeWire docs):

1. `PIPEWIRE_RUNTIME_DIR` (if set, looks for sockets here)
2. `XDG_RUNTIME_DIR` (standard location: `$XDG_RUNTIME_DIR/pipewire-0`)
3. `USERPROFILE` (Windows; irrelevant on Linux)

Default socket names: `pipewire-0` and `pipewire-0-manager` (the "manager"
socket is used by session managers like WirePlumber).

Remote selection: `PIPEWIRE_REMOTE` env var selects the remote name
(default: `pipewire-0`).

### Systemd socket activation (the standard path on NixOS)

NixOS `services.pipewire.enable = true` creates:

- `pipewire.socket` user unit: listens at `$XDG_RUNTIME_DIR/pipewire-0`
- `pipewire.service` user unit: started on first client connect or explicitly
- `wireplumber.service` user unit: session manager
- `pipewire-pulse.socket` user unit: listens at `$XDG_RUNTIME_DIR/pulse/native`
- `pipewire-pulse.service` user unit: started on first PulseAudio client connect

### What this means for Korri services

Any user service that runs in the same user session as PipeWire does **not**
need to set `PIPEWIRE_RUNTIME_DIR` or `XDG_RUNTIME_DIR` explicitly. The
user manager already has `XDG_RUNTIME_DIR=/run/user/$UID`, PipeWire's
socket is at `$XDG_RUNTIME_DIR/pipewire-0`, and clients find it
automatically.

`PIPEWIRE_RUNTIME_DIR` is only needed when:
- A system service (not a user service) must connect to a user's PipeWire graph.
- The value of `XDG_RUNTIME_DIR` is non-standard for some reason.

Example from RK3566 (system-level compositor service):

```nix
environment = {
  XDG_RUNTIME_DIR = rk3566RuntimeDir;       # "/run/user/2000"
  PIPEWIRE_RUNTIME_DIR = rk3566RuntimeDir;  # same value; explicit because system service
};
```

---

## 5. PipeWire-pulse socket and `PULSE_SERVER`

### Socket location

`pipewire-pulse` creates the PulseAudio-compatible socket at:

```
$PULSE_RUNTIME_PATH/native          (if PULSE_RUNTIME_PATH is set)
$XDG_RUNTIME_DIR/pulse/native       (standard / default)
```

The ArchWiki and upstream PipeWire docs confirm the concrete path:
`/run/user/$UID/pulse/native`.

### When to set `PULSE_SERVER` explicitly

| Situation | Use `PULSE_SERVER`? | Recommended value |
|---|---|---|
| User service, same user as pipewire-pulse | **No** — auto-discovered | — |
| User service, custom `XDG_RUNTIME_DIR` (e.g., per korri-compositor) | Yes | `unix:%t/pulse/native` (systemd expands `%t`) |
| System service connecting to a user's audio graph | Yes | `unix:/run/user/$UID/pulse/native` (absolute) |
| Process launched outside systemd (shell, swaymsg exec, browser env) | Yes | `unix:/run/user/$UID/pulse/native` (absolute; `%t` not expanded) |
| Cross-user audio (Sunshine connecting to korri user's graph) | Yes | `unix:/run/user/$KORRI_UID/pulse/native` (absolute) |

### Korri patterns

**SM8550 user services** — `%t` in systemd unit environment:

```nix
korriPulseServer = "unix:%t/pulse/native";  # systemd expands %t

systemd.user.services.korri-sunshine.environment.PULSE_SERVER = korriPulseServer;
systemd.user.services.korri-rocknix-audio-bootstrap.environment.PULSE_SERVER = korriPulseServer;
```

**SM8550 Chromium kiosk** — absolute path (shell / browser-env context):

```nix
korriRuntimeDir = "/run/user/${korriRuntimeUid}";

# Chromium is launched via swaymsg exec or shell, not a systemd unit:
"--browser-env=PULSE_SERVER=unix:${korriRuntimeDir}/pulse/native"
```

**RK3566 system service** — absolute path (system scope, explicit UID):

```nix
rk3566RuntimeDir = "/run/user/${toString runtime.uid}";
rk3566PulseServer = "unix:${rk3566RuntimeDir}/pulse/native";

systemd.services.korri-rocknix-audio-bootstrap.environment.PULSE_SERVER = rk3566PulseServer;
```

---

## 6. Summary: when to use each variable

| Variable | Set in | Reason |
|---|---|---|
| `XDG_RUNTIME_DIR` | Shell init shims; system services only | Created by `pam_systemd`; user units inherit it automatically |
| `PIPEWIRE_RUNTIME_DIR` | System services connecting to a user's PipeWire | Points PipeWire clients at the correct runtime dir when `XDG_RUNTIME_DIR` isn't set |
| `PULSE_SERVER` | Any service that must cross user/scope boundary or runs outside of a user service | Points PulseAudio clients (including `pactl`) at the correct pipewire-pulse socket |
| `DBUS_SESSION_BUS_ADDRESS` | System services; platforms without a user bus unit; explicit session-bus plumbing | Set automatically by `pam_systemd` when dbus-broker user unit is active |
| `WAYLAND_DISPLAY` | Peer user services that attach to an existing compositor | **Not** pre-set on the compositor unit itself — wlroots treats a pre-set value as "nested compositor mode" |

---

## 7. NixOS-specific notes

### `pam_systemd` is always active on NixOS

NixOS includes `pam_systemd` in its default PAM stack. Any process that
goes through greetd, agetty, or sshd login will have `XDG_RUNTIME_DIR`,
`DBUS_SESSION_BUS_ADDRESS`, and `XDG_SESSION_ID` injected without any
additional configuration.

### Services.pipewire wiring

```nix
services.pipewire = {
  enable = true;
  pulse.enable = true;   # installs pipewire-pulse.socket → /run/user/$UID/pulse/native
  # wireplumber.enable is default-true with nixpkgs >= 23.05
};
```

Socket activation means pipewire-pulse is only started when a PulseAudio
client first connects. The socket (`/run/user/$UID/pulse/native`) is
present even before pipewire-pulse.service is active.

A known NixOS quirk: `pipewire-pulse.socket` sometimes fails to re-activate
`pipewire-pulse.service` after the service has stopped mid-session (nixpkgs
issue #348155, observed Oct 2024). If ordering is critical, explicitly
`require` `pipewire-pulse.service` rather than relying solely on socket
activation.

### `dbus-broker` vs `dbus-daemon`

NixOS defaults to `services.dbus.implementation = "broker"` (dbus-broker).
Both create the user bus socket at `$XDG_RUNTIME_DIR/bus`. The behavior
visible to Korri modules is identical; the difference is internal to the
D-Bus implementation.

### No lingering for Korri appliance users

Lingering (`loginctl enable-linger`) starts `user@.service` at boot without
a logind session. This means:
- `$XDG_RUNTIME_DIR` is created by systemd itself (not pam_systemd).
- The logind session seat, VT, and input device ACLs are **not** granted.
- Wayland compositors started from lingered units have no seat access.

Korri's assertion in `korri-runtime.nix` enforces that the Korri user must
not linger; the session target must be started from a real greetd session.

### `RuntimeDirectory=` in user units creates subdirs under `$XDG_RUNTIME_DIR`

```nix
systemd.user.services.my-service.serviceConfig = {
  RuntimeDirectory = "my-service";       # → /run/user/$UID/my-service
  RuntimeDirectoryMode = "0700";
};
```

This is the canonical way to create isolated runtime subdirs. The directory
is automatically removed when the service stops. It is equivalent to
`%t/my-service` and avoids baking UIDs into Nix expressions.

---

## 8. Decision tree for new Korri service modules

```
Does the new service run as a systemd USER unit?
  YES → Do not set XDG_RUNTIME_DIR or PIPEWIRE_RUNTIME_DIR.
         For runtime subdirs, use RuntimeDirectory = "name" in serviceConfig.
         For PULSE_SERVER: use "unix:%t/pulse/native" if audio is needed.
         For D-Bus: inherit from user manager (user bus at %t/bus is default).

  NO (system service, or launched via shell/exec from compositor):
     Does it need PipeWire native protocol?
       YES → Set PIPEWIRE_RUNTIME_DIR = "/run/user/$UID" explicitly.
     Does it need PulseAudio (pactl, libpulse clients)?
       YES → Set PULSE_SERVER = "unix:/run/user/$UID/pulse/native" (absolute).
     Does it need D-Bus session bus?
       YES → Set DBUS_SESSION_BUS_ADDRESS = "unix:path=/run/user/$UID/bus".
     Does it start a Wayland compositor?
       → Do NOT pre-set WAYLAND_DISPLAY; let wlroots pick the socket.
          Set XDG_RUNTIME_DIR = "/run/user/$UID" so sockets land in the right place.
```

---

## Sources

| Topic | Source |
|---|---|
| XDG Base Directory Spec (`$XDG_RUNTIME_DIR` semantics) | [freedesktop.org/basedir-spec/latest](https://specifications.freedesktop.org/basedir-spec/latest/) |
| systemd user manager, `%t` specifier, `RuntimeDirectory=` | [ArchWiki: systemd/User](https://wiki.archlinux.org/title/Systemd/User) |
| `pam_systemd` and session bus injection | [ArchWiki: systemd/User § pam_env](https://wiki.archlinux.org/title/Systemd/User) |
| D-Bus session bus placement (`$XDG_RUNTIME_DIR/bus`) | [Unix.SE answer by grawity](https://unix.stackexchange.com/questions/779878/) |
| PipeWire native protocol socket discovery order | [docs.pipewire.org: libpipewire-module-protocol-native](https://docs.pipewire.org/page_module_protocol_native.html) |
| pipewire-pulse socket location, `PULSE_RUNTIME_PATH` | [docs.pipewire.org: pipewire-pulse(1)](https://docs.pipewire.org/page_man_pipewire-pulse_1.html) |
| PipeWire socket activation on NixOS | [ArchWiki: PipeWire §Startup](https://wiki.archlinux.org/title/PipeWire) |
| NixOS pipewire-pulse socket at `/run/user/1000/pulse/native` | [NixOS/nixpkgs issue #348155](https://github.com/NixOS/nixpkgs/issues/348155) |
| Korri module corpus | `product/systems/nixos/modules/korri-{runtime,compositor,daemon,rocknix-audio-bootstrap}.nix`, `product/systems/nixos/images/platforms/rocknix-{sm8550,rk3566}.nix` |
