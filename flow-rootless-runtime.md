# Flow Analysis: Korri Rootless Appliance Runtime

**Scope:** Clean-break rootless runtime plan. All Korri-owned long-lived services as
`korri` user; root only in a oneshot setup service; greetd auto-login; user services
under `korri-session.target`; paths `/home/korri`, `/var/lib/korri`,
`$XDG_RUNTIME_DIR/korri/*`; no `/storage` or `/run/user/0`; `korrid` rename; Unix
socket IPC for sessiond; inputd non-root with loopback WS preserved.

**Codebase grounding:** Analysis is based on reading
`product/systems/nixos/modules/korri-{server,sessiond,compositor,input}.nix`,
`product/systems/nixos/images/{kiosk,source-machine,headless,live-usb-runtime}.nix`,
`product/systems/nixos/images/platforms/rocknix-sm8550.nix`,
`product/services/device/{korri-server,sessiond,sessiond-electrobun,inputd}.ts`, and
backlog tasks 083–090.

---

## User Flows

### Flow 1: Kiosk boot — happy path

```
korri-setup.service (root, oneshot)
  → creates /home/korri, /var/lib/korri, /var/lib/korri/content/games
  → sets uid/gid stable; grants input/render/seat groups; creates XDG dirs
  → [success] → greetd.service starts

greetd.service
  → auto-login as korri
  → logind creates /run/user/<korri-UID>; session seat acquired
  → systemd --user (user@<korri-UID>.service) starts
  → korri-session.target becomes the orchestration anchor

korri-session.target activates in dependency order:
  inputplumber.service (root system service, pre-existing)
  korri-inputd.service (korri user service)
    → opens /dev/input/event* via seat uaccess
    → opens /dev/uinput via input group
    → binds WS on 127.0.0.1:<inputd-port>
  korri-compositor.service (korri user service)
    → dbus-run-session -- sway OR inherits user bus
    → emits /run/user/<UID>/wayland-1
  korrid.service (korri user service, was korri-server)
    → binds HTTP on 0.0.0.0:3001 (federated default)
    → connects to $XDG_RUNTIME_DIR/korri/sessiond.sock for launch delegation
  korri-sessiond.service (korri user service)
    → binds Unix socket $XDG_RUNTIME_DIR/korri/sessiond.sock
    → receives /control/start (via socket IPC replacing HTTP handshake)
    → enterIdle: spawns Electrobun renderer under korri session
  Electrobun renderer inherits env from sessiond; attaches to wayland-1; dials inputd WS
```

### Flow 2: Source-machine / headless boot — happy path

```
korri-setup.service (root, oneshot)
  → same user/path setup as kiosk (unified identity)

greetd OR lingering-only (headless has no display — this is underspecified)
  → korri user session starts
  → korri-session.target activates

Services for source-machine role:
  inputplumber.service (root system service)
  korri-compositor.service (korri user service, kiosk=false → idle sway only)
  korrid.service (korri user service)
    → binds HTTP; registers mDNS; accepts LAN launch requests
    → delegates managed launches to korri-sessiond via Unix socket
  korri-sessiond.service (korri user service, role=source-machine)
    → idle-blank invariant; no Electrobun
  korri-sunshine.service (korri user service)
    → attaches to sway's wayland-1; accepts Moonlight streams
```

### Flow 3: LAN-triggered game launch — kiosk

```
Remote korri-server discovers kiosk via mDNS
  → sends RPC launch request to korrid (port 3001)

korrid
  → resolves game from library
  → writes launch artifact to $XDG_RUNTIME_DIR/korri/launch-artifacts/
  → dials $XDG_RUNTIME_DIR/korri/sessiond.sock
  → sends managed-launch request via Unix socket IPC

korri-sessiond
  → validates request (filesystem-ownership check replaces token auth)
  → spawns gamescope + game process as korri, inheriting user session env
  → waits for status file write
  → emits session-active event back via socket response

[game exits]
korri-sessiond
  → reaps gamescope-wl child
  → emits session-ended event
  → enterIdle: restores compositor state
```

### Flow 4: korri-setup.service failure at boot

```
korri-setup.service fails (e.g., /home/korri not writable)
  → [unspecified] does greetd still start?
  → [unspecified] does the user see an error surface?
  → [unspecified] does korri-session.target refuse to start?
```

### Flow 5: korri-sessiond restart under Unix socket IPC

```
korri-sessiond.service restarts (on-failure)
  → old Unix socket at $XDG_RUNTIME_DIR/korri/sessiond.sock is removed
  → new socket bound

korrid still has active connection to old socket fd
  → [unspecified] reconnect policy: does korrid retry the socket path?
  → [unspecified] in-flight launch request during restart: outcome?
  → previous HTTP retry loop (40 × 250ms, curl --max-time 30) has no replacement defined
```

### Flow 6: greetd session exit or crash

```
greetd session exits (sway crash, korri-compositor crash, or explicit logout)
  → logind tears down session seat
  → XDG_RUNTIME_DIR cleanup: /run/user/<korri-UID>/ is removed
    → $XDG_RUNTIME_DIR/korri/sessiond.sock gone
    → $XDG_RUNTIME_DIR/korri/launch-artifacts/ gone
    → wayland-1 gone

  → [unspecified] do user services survive session teardown or stop?
  → [unspecified] does greetd restart the session automatically?
  → [unspecified] does lingering protect user@<UID>.service during the gap?
```

---

## Gaps

### Critical — blocks implementation or creates runtime risk

---

**C1. `korri` user UID is not pinned and `XDG_RUNTIME_DIR` derivation is implicit**

The entire runtime depends on `/run/user/<korri-UID>` as the socket and runtime dir
base. The SM8550 platform today hard-codes `/run/user/0`
(`rocknix-sm8550.nix`: `runtimeDir = lib.mkDefault "/run/user/0"`). Moving to a
`korri` non-root user requires the UID to be stable across image rebuilds and
`nixos-rebuild switch` runs. NixOS does not pin UIDs automatically for
`isNormalUser = true` accounts.

- If the UID changes between rebuilds, every hard-coded env var, path,
  and socket path derived from it silently breaks.
- Multiple callsites in `kiosk.nix` inject `XDG_RUNTIME_DIR =
  compositorCfg.runtimeDir` as an explicit env var into system services. After the
  migration, user services inherit `XDG_RUNTIME_DIR` automatically from the user
  manager — but only after the logind session is established. Services that start
  before the session seat is assigned (i.e., via lingering, before greetd login
  completes) will not have `XDG_RUNTIME_DIR` set.

**What breaks:** socket paths, Wayland display paths, DBus bus path, every
`%t`-derived path in user units.

**Default assumption:** pin `uid = <fixed>` in `users.users.korri` in
`services.korri.runtime`; document the pin as a product contract; regenerate Nix
checks that assert the UID is non-root and stable.

---

**C2. `greetd` session contract vs. `systemd --user` activation is underspecified for non-live-USB profiles**

`live-usb-runtime.nix` already uses greetd with a shell-script session that execs
`dbus-run-session -- sway`. The target design introduces `korri-session.target` as a
user-level orchestration anchor. These two models conflict unless the contract is
explicit:

- **Option A (greetd session = compositor):** greetd's session exec is still the Sway
  process. `korri-session.target` is a `systemd --user` target that starts
  automatically from the user manager — enabled via `user@<korri-UID>.service` and
  lingering. User services start independently of the greetd session exec. The
  compositor's greetd exec and the user manager's service graph run in parallel.
- **Option B (greetd session = systemd --user):** greetd's session exec is replaced
  with a script that `exec`s `systemd --user` directly or a minimal wrapper. All
  services including the compositor start under the user manager.

Neither option is written down. Option A requires lingering to be enabled on the
`korri` user so `user@<UID>.service` starts at boot before greetd login completes —
but the current only lingering config is `users.users.root.linger = true` on the
ROCKNIX platforms, which is exactly what the plan removes. Option B changes the
greetd session architecture across all image profiles.

**What breaks:** every image module that currently wires `wantedBy =
["multi-user.target"]` or `wantedBy = ["default.target"]` for Korri system services
must be retargeted, and the greetd session command must be re-specified.

**Default assumption:** prefer Option A; add `users.users.korri.linger = true` in
`services.korri.runtime`; add Nix checks that assert lingering is enabled when any
korri user service exists.

---

**C3. `/control/start` handshake has no replacement defined for Unix socket IPC**

The current `ExecStartPost` script in `korri-sessiond.nix` uses curl with a 40 ×
250ms retry loop and `--max-time 30` per attempt. The `--max-time 30` value is
deliberately long: `enterHome` on the kiosk role spawns Electrobun and waits for its
status file, which takes several seconds on cold cache. If the budget is too short,
a second `/control/start` fires in parallel and both renderers compete (documented in
the script's comment).

With Unix socket IPC, curl goes away. The plan (task-088) says to expose sessiond on
`$XDG_RUNTIME_DIR/korri/sessiond.sock`, but does not specify:

1. What tool sends the initial `/control/start` equivalent (`socat`? a short bun
   script? `nc -U`?).
2. What the retry/backoff contract is for the startup race (socket not yet bound).
3. How the replacement handles the 10–30 s in-flight latency without triggering a
   duplicate request.
4. Whether `ExecStartPost` is still the right hook, or whether `korri-sessiond`'s
   own start sequence emits the idle-start signal to itself.

**What breaks:** if no replacement is specified, the service starts but stays in
`stopped` state indefinitely — every managed launch fails closed, which is the
current failure mode when the handshake is skipped.

**Default assumption:** a `korri-sessiond-start.service` (oneshot, ordered after
`korri-sessiond.service` is up) sends the start signal via a small bun/socat command;
the retry timeout matches the current 10 s budget from the slow-socket race, not the
30 s in-flight budget (which becomes sessiond's internal responsibility).

---

**C4. SM8550 platform `/storage` and `/run/user/0` removal requires substrate
negotiation, not a Korri opt-out**

`rocknix-sm8550.nix` explicitly sets — via `lib.mkDefault` — values that the
clean-break migration must remove:

- `compositor.home = lib.mkDefault "/storage"` → must become `/home/korri`
- `compositor.runtimeDir = lib.mkDefault "/run/user/0"` → must become
  `/run/user/<korri-UID>`
- `compositor.sessionBus.address = lib.mkDefault "unix:path=/run/user/0/bus"` →
  must become the korri user's bus
- `users.users.root.linger = true` → must be replaced by `users.users.korri.linger =
  true`
- `XDG_CACHE_HOME = "/storage/.cache"` in Moonlight env → must become
  `$XDG_CACHE_HOME/korri` or similar

These are set at the korri product level inside the korri repo, not in the
nix-on-rocks substrate. They CAN be overridden or removed by the task-085 identity
module. However, `nix-on-rocks.nixosModules.rocknix-guest-base` imports constraints
that may re-establish some of these. The exact override priority (`lib.mkForce` vs.
`lib.mkDefault` vs. plain assignment) must be verified per path before committing to
the migration order.

Additionally, `sessiond-electrobun.ts` line 98 hardcodes `/storage/bin` in
`sanitizeElectrobunPath()` as a required PATH entry. This is TypeScript source, not
Nix config, and will silently fail to find binaries on any image where `/storage`
doesn't exist.

**What breaks:** ROCKNIX kiosk fails to boot if `/storage` or `/run/user/0` are
absent and no replacement path is wired; Electrobun PATH resolution fails on x86 kiosk
already (where `/storage/bin` doesn't exist, it's silently absent today).

**Default assumption:** remove the `sanitizeElectrobunPath` `/storage/bin` hardcode
as part of task-085; the SM8550 platform module gets explicit `lib.mkForce` overrides
that set the new identity paths; a dedicated Nix check asserts `/run/user/0` does not
appear in any Korri-owned service env or option when the runtime identity module is
enabled.

---

**C5. `inputd` seat/session access race when started as a user service with lingering**

`uaccess` grants `/dev/input/event*` to the *active session owner*. With lingering,
`user@<korri-UID>.service` starts at boot — before greetd creates the logind session.
A `korri-inputd.service` that is `WantedBy = korri-session.target` and starts before
the greetd login completes will not yet be the seat session owner. The uaccess rules
will not apply, and every `open("/dev/input/eventN")` returns EACCES.

Additionally, `/dev/uinput` is granted via `GROUP=input, MODE=0660`. The `korri` user
must be declared with `extraGroups = ["input"]` in the new identity module — no
existing user declaration in the codebase includes `korri` in the input group.

**What breaks:** inputd starts but reads zero input events; all controller shortcuts
and input forwarding are silently dead until a restart after the session is
established.

**Default assumption:** `korri-inputd.service` must be ordered
`After=session.slice` or have an explicit `After=sys-subsystem-input-devices-...`
activation, OR accept that inputd only starts AFTER greetd establishes the session
(which means it cannot be in the pre-greetd lingering path). The `korri` user
declaration adds `extraGroups = ["input", "render", "seat", "video"]`.

---

### Important — significantly affects UX or creates implementation ambiguity

---

**I1. greetd session architecture for headless/source-machine profiles is missing**

Headless images have no display and no Wayland. What does greetd's auto-login session
exec for a headless `korri` profile? The live USB uses greetd with a sway-backed
shell script; the headless profile has no compositor to exec. Options:

- greetd is not used for headless; lingering alone starts user services. But then
  greetd adds overhead with no benefit.
- greetd executes a minimal `bash -c "exec /run/current-system/sw/bin/systemd-cat
  --identifier korri-session bash -c 'sleep infinity'"` or similar seat-holder.
- greetd is skipped entirely; a new user-session-activation mechanism is declared.

This also affects source-machine, which currently boots a headless Sway compositor
under the `korri-source` user. Under "all services as `korri`," the source-machine
compositor is now a `korri` user service — but `korri` is also running `korrid` and
`korri-sessiond`. The `korri-source` user disappears, and the
`korri-sessiond-clients` group (currently used for token sharing between
`korri-server` and `korri-source`) also disappears.

**Default assumption:** headless profiles enable lingering only (no greetd); the
image type enum distinguishes compositor-bearing from headless at the greetd config
level; source-machine consolidates to single `korri` user and the
`korri-sessiond-clients` group is retired.

---

**I2. `systemd --user` service boundary vs. system services for cross-boundary ordering**

Several system services must be ordered before user services:
- `inputplumber.service` (root system) before `korri-inputd.service` (korri user)
- `seatd.service` (root system) before `korri-compositor.service` (korri user)
- `korri-setup.service` (root system, oneshot) before all korri user services

In NixOS, `systemd.user.units.korri-inputd.unitConfig.After =
["inputplumber.service"]` is supported but cross-boundary ordering (user unit
waiting on system unit) requires the user manager to be running and the system unit to
be in the right state. This is NOT the same as `After=` in a system unit. It works if
the user manager starts after the system target that includes `inputplumber.service`,
but it does not create a hard dependency that prevents the user unit from starting
early.

Currently `korri-inputd.service` (system service, no `User=`) directly declares
`after = ["systemd-udevd.service"]` in the korri-input module. Moving this to a user
service while maintaining the ordering contract needs an explicit design decision.

**Default assumption:** `korri-setup.service` (system, oneshot) declares
`Before=user@<korri-UID>.service` to ensure setup completes before any korri user
services start; individual user services like inputd keep platform-provided ordering
via the `after` option expanded to include system-scope targets or via explicit
`user@.service` ordering.

---

**I3. Sessiond `/control/start` duplicate-launch protection must survive the
transport change**

The current curl script has a deliberately long `--max-time 30` with a comment
explaining the failure mode: if the budget expires while `enterHome` is waiting for
the Electrobun status file, a second `/control/start` fires and two renderers race.

With a Unix socket connection, the same race exists. The replacement must either:
a) Hold the connection open for the full duration of `enterHome` (matching the 30 s
budget), OR
b) Have sessiond internally reject a second `/control/start` while one is in
flight (idempotency guard on the socket handler).

Option (b) is the better architecture and avoids embedding timing policy in the boot
script. But it requires sessiond's socket handler to be explicitly idempotent at the
IPC contract level, which is not currently specified.

**Default assumption:** the socket-based `/control/start` replacement adds an
idempotency guard inside sessiond (return 200 if already starting, reject with 409 if
already running). The ExecStartPost replacement uses the same `until socket_responds`
loop as the current curl script but via a small bun one-liner; the maximum budget
moves inside sessiond's own timeout.

---

**I4. Library root and Bun transpiler cache paths under the new identity**

`korri-server.nix` (soon `korrid`) derives `library.root` from `configuredUserHome +
"/.local/share/korri/library"` in system mode. After migration, `korri` user home is
`/home/korri`, so this becomes `/home/korri/.local/share/korri/library`.

Task-085 declares `/var/lib/korri` as the product state root. The plan does not
specify whether library YAML moves to `/var/lib/korri/library` or stays in XDG data
home. This matters because:

- `korri-server.nix` wraps `ExecStartPre` with `install -d -m 700 ${cfg.library.root}`
  to create the directory. If the library root is now under a user's home, this `mkdir`
  runs as the service user — fine for a user service. But the path must be stable
  across user manager restarts.
- `BUN_RUNTIME_TRANSPILER_CACHE_PATH` currently points to `/var/cache/korri-server/
  bun-transpiler-cache`. Under user services, this must move to
  `$XDG_CACHE_HOME/korri/bun-transpiler-cache` or an equivalent path that the user
  manager sets up. The system-mode `CacheDirectory = "korri-server"` directive that
  creates `/var/cache/korri-server` goes away.

**Default assumption:** library root stays XDG-data-home–derived
(`/home/korri/.local/share/korri/library`) for now; `/var/lib/korri` is for
product-level game content and state only (games, scan results when implemented); Bun
transpiler cache moves to `$XDG_CACHE_HOME/korri/bun-transpiler-cache`.

---

**I5. `ProtectHome`, `ReadWritePaths`, and user-service hardening model is
unspecified**

`korri-sessiond` system service uses `ProtectHome = true` plus explicit
`ReadWritePaths` exceptions for the compositor home. This was overridden via
`lib.mkForce false` in `kiosk.nix` because sessiond must write to the compositor's
home to spawn Electrobun.

Under user services running as `korri`, `ProtectHome = true` in a user unit masks the
user's OWN home — which is counterproductive. The hardening model for user services is
different from system services. Without explicit guidance, individual task
implementations will make inconsistent choices about which hardening directives are
appropriate in user-owned units.

Additionally, `MemoryDenyWriteExecute = false` is required for Bun JIT (currently
documented in `korri-server.nix`). This exception must be documented for all
Bun-backed user services (`korrid`, `korri-sessiond`, `korri-inputd`).

**Default assumption:** produce a standard user-service hardening template as part of
`services.korri.runtime` defaults; include it in the plan before individual task
implementations begin.

---

**I6. `launchArtifactsDir` path contract across korrid → sessiond boundary**

The launch artifacts directory is currently `/run/korri-launch-artifacts` (system
mode), shared between `korri-server` and `korri-sessiond` system services. Both are
root services today, so filesystem ownership is trivially shared.

Under the new model, both services run as `korri` user services. The natural path
becomes `$XDG_RUNTIME_DIR/korri/launch-artifacts` (using `%t` specifier). BUT
`XDG_RUNTIME_DIR` is session-scoped and is deleted when the session ends or the user
logs out. On greetd session restart (compositor crash), launch artifacts from the
previous session are gone — including artifacts for in-flight launches that sessiond
was processing.

The existing `launchArtifactsDir` option comment says "must be outside /tmp because
managed foreground children run through sessiond with PrivateTmp enabled." The same
concern applies to `XDG_RUNTIME_DIR` on session teardown.

**Default assumption:** `launchArtifactsDir` moves to `/run/korri/launch-artifacts`
(a tmpfiles-managed directory owned by `korri:korri`, outside the session runtime
tree) rather than `$XDG_RUNTIME_DIR`; it survives session restarts while still being
a RAM-backed tmpfs path.

---

**I7. Sunshine on source-machine under unified `korri` identity**

`korri-sunshine.service` currently uses `User = compositorCfg.user`, which is
`korri-source` on source-machine. Under the clean-break model, the compositor user
becomes `korri`. Sunshine needs:

- `CAP_SYS_ADMIN` or the capability wrapper for screen capture (currently gated by
  `sunshineCfg.capSysAdmin`)
- `/dev/uinput` access (currently via `TAG+="uaccess"` in the udev rule)
- `/dev/dri/*` access for encoding

These permissions are currently wired through the compositor user. After
consolidation, they must be wired through `korri`. The Sunshine unit currently runs
as a system service (`systemd.services.korri-sunshine`). Whether it stays a system
service (with `User = korri`) or becomes a user service is unspecified.

**Default assumption:** `korri-sunshine.service` stays a system service with
`User = korri` (same pattern as the current system mode for korri-server); the `korri`
user gains the same `extraGroups` as the former `korri-source` user.

---

**I8. DBus session bus propagation for Electrobun under unified user identity**

`kiosk.nix` explicitly injects `DBUS_SESSION_BUS_ADDRESS` into sessiond's env when
`sessionBus.mode = "existing"` (SM8550 case: `unix:path=/run/user/0/bus`). After
migration, with `korri` user running user services under a proper logind session, the
user bus is at `unix:path=/run/user/<korri-UID>/bus`.

For `systemd --user` services, `DBUS_SESSION_BUS_ADDRESS` is set automatically by
the user manager. But Electrobun is spawned as a CHILD PROCESS of `korri-sessiond`
(not as a systemd unit itself) — it inherits `korri-sessiond`'s env. If
`korri-sessiond.service` is a user service under the user manager, it will have
`DBUS_SESSION_BUS_ADDRESS` set correctly. The explicit injection in `kiosk.nix` would
then become redundant and should be removed.

The question is whether removing the explicit injection is safe: if `korri-sessiond`
starts before the user bus is ready (ordering issue), it will inherit an unset or
wrong `DBUS_SESSION_BUS_ADDRESS`. The user bus readiness is currently not an explicit
`After=` dependency in any sessiond unit.

**Default assumption:** add `After=dbus.socket` (user scope) to korri-sessiond user
unit; remove the explicit `DBUS_SESSION_BUS_ADDRESS` injection from kiosk.nix after
verifying the user manager propagates it correctly; add it as a Nix check assertion.

---

### Minor — has a reasonable default but worth confirming

---

**m1. `korri` user `isNormalUser` vs. `isSystemUser` affects lingering availability**

NixOS `loginctl enable-linger` (and the `linger` attribute) requires the user to be a
"normal" user in logind's sense. `isSystemUser = true` users do not get lingering.
The current `korri-server` user is `isSystemUser = true`. The `korri` user must be
`isNormalUser = true` (which also creates a home directory and optionally a login
shell). This changes the semantics of the account: `isNormalUser` accounts appear in
`/etc/passwd` with a login shell and are subjects for `su`/`ssh`.

If the `korri` user has a login shell, it becomes an attack surface. The plan should
specify either a nologin shell explicitly (`shell = pkgs.shadow.su;` or
`shell = "/run/current-system/sw/bin/nologin"`) or confirm that `isNormalUser`
with no SSH key and passwordless is acceptable.

---

**m2. Env var rename scope for task-087 is underspecified**

`korri-server.nix` exports many `KORRI_*` env vars to the unit (e.g.,
`KORRI_SERVER_ID`, `KORRI_SERVER_NAME`, `KORRI_STREAM_ADVERTISE_NAME`,
`KORRI_SESSIOND_URL`, `KORRI_SESSIOND_TOKEN_FILE`). Task-087 says to rename runtime
env vars to "product-prefixed descriptive names such as `KORRI_DAEMON_SOCKET`" but
avoids `KORRID_*`. The scope of this rename is not fully enumerated.

`korri-server.ts` reads `env.KORRI_STREAM_ADVERTISE_CAPABILITIES`,
`env.KORRI_SERVER_NAME`, `env.KORRI_SERVER_ID` etc. These must change atomically in
both the Nix module and the TypeScript source. A partial rename (Nix only, or TS
only) would silently break federation advertisement.

---

**m3. Live USB persistence layer interaction with new identity paths**

`live-usb-runtime.nix` derives the persistence allowlist from `compositorCfg.user`
(e.g., `productHome = "/home/${compositorCfg.user}"`). After migration, the
compositor user becomes `korri`, so `productHome` becomes `/home/korri`. The allowlist
entries are already parametric and will follow automatically.

However, the `greetdSession` shell script in `live-usb-runtime.nix` manually exports
`XDG_RUNTIME_DIR` as a fallback:
```bash
if [ -z "${XDG_RUNTIME_DIR:-}" ]; then
  export XDG_RUNTIME_DIR="/tmp/korri-runtime-$(id -u)"
```
Under greetd auto-login with a normal user, logind sets `XDG_RUNTIME_DIR` before the
session exec runs, so this fallback should never fire. But if it does fire (e.g.,
on a platform where logind is not managing the session), the path
`/tmp/korri-runtime-<UID>` diverges from the expected
`/run/user/<UID>`. All socket paths derived from `$XDG_RUNTIME_DIR` become wrong.

---

**m4. Bun/FFI `MemoryDenyWriteExecute` exception must be documented for user services**

`korri-server.nix` already sets `MemoryDenyWriteExecute = false` for the Bun JIT. The
same exception is needed for `korri-inputd` (uses `dlopen` via Bun FFI) and
`korri-sessiond` (Bun runtime). For user services, `systemd.user.services`
`serviceConfig.MemoryDenyWriteExecute = false` must be set explicitly or the Bun JIT
silently falls back (or crashes) on newer kernels where the default is restrictive.

---

**m5. PipeWire/PulseAudio socket path in streaming.audio.pulseServer**

`korri-server.nix` `streaming.audio.pulseServer` option has example value
`"unix:/run/user/1000/pulse/native"`. After migration, the relevant UID is the
`korri` user's UID (not 1000). The option documentation says "Korri does not
derive, discover, or validate this value; the host config owns it." This is correct
policy, but the example value should be updated to use the `%t/pulse/native` specifier
or a note referencing the `korri` user's UID.

---

## Questions

**Q1. How does greetd's session exec relate to `korri-session.target` and lingering?**

Does greetd's session exec for the kiosk profile remain `dbus-run-session -- sway`
(matching the live USB pattern), with `korri-session.target` as a parallel user target
activated by lingering? Or does greetd exec a different session wrapper that activates
the user manager's default target?

*Stakes:* Every image module's service graph changes based on the answer. Getting this
wrong means user services start before XDG_RUNTIME_DIR exists, or greetd restarts
unexpectedly.

*Default assumption:* greetd session = compositor exec (Option A); lingering activates
`user@<korri-UID>.service`; `korri-session.target` is a user target; the compositor
is `WantedBy=korri-session.target`. Headless profiles skip greetd and use lingering
only.

---

**Q2. What is the exact `korri-session.target` start graph? Which services are
`PartOf=` vs. `WantedBy=`?**

If `korri-session.target` stops (e.g., `korrid` crashes and is not restarted), should
the entire session stop including the compositor? Or does the compositor stay up
independently?

*Stakes:* `PartOf=korri-session.target` means a service stopping brings down the
target and potentially cascades. `WantedBy=korri-session.target` means services start
with the target but can fail independently. The current model has individual service
restart policies (`Restart = "on-failure"`). The target graph must be consistent with
those.

*Default assumption:* `korri-compositor.service` is `PartOf=graphical-session.target`
(standard Wayland convention); `korrid`, `korri-sessiond`, `korri-inputd` are
`WantedBy=korri-session.target` with individual `Restart=on-failure` policies;
`korri-session.target` itself is `WantedBy=default.target`.

---

**Q3. Should `korri-setup.service` failure block the entire boot or only warn?**

If `korri-setup.service` fails (e.g., `/var/lib/korri` is not writable — relevant if
persistence is missing), should:
- (a) The entire korri session refuse to start (greetd gets an error, user sees
  nothing useful)
- (b) The session starts in degraded mode with ephemeral state and a visible
  diagnostic marker
- (c) The setup failure is a hard error only for data-bearing services (korrid),
  transparent for the compositor surface

*Stakes:* Option (a) is safest for data integrity but worst for user experience on a
consumer appliance. Option (b) is consistent with the live USB ephemeral model (which
already writes `.korri-live-usb-ephemeral` on missing persistence). Task-083
(persistence failure policy) is deferred — this question must be answered before
task-089 can specify the setup service's success/failure semantics.

*Default assumption:* setup failure is a hard error (blocks greetd session start);
a visible error surface or LED pattern is required for the appliance to be diagnosable
without SSH. This decision is owned by task-083 before task-089 lands.

---

**Q4. Does `korri-inputd` start before or after the greetd session is established?**

See gap C5. If inputd starts via lingering before greetd creates the logind session,
`/dev/input/event*` uaccess grants are absent. Should inputd:
- (a) Start after greetd login (session-scoped), meaning shortcut keys and input
  bridging are unavailable if greetd restarts
- (b) Start from lingering with explicit `After=systemd-udev-settle.service` and rely
  on `input` group membership for `/dev/uinput` only (input events from uaccess
  would be unavailable until session is established)
- (c) Use a systemd activation socket and defer uaccess-gated opens until first use

*Stakes:* Option (a) is simplest; option (b) supports `/dev/uinput` writes (output)
pre-session but not `/dev/input/*` reads (input) pre-session; option (c) is complex.
For a kiosk appliance where the korri user IS the only seat user, uaccess should apply
throughout the session lifetime — the window between lingering-start and
greetd-session-established is the only gap.

*Default assumption:* inputd is `After=graphical-session-pre.target` (user scope),
which is `After=logind-managed seat session`, ensuring uaccess is active before inputd
opens event devices.

---

**Q5. What is the exact IPC wire format for the Unix socket sessiond replacement?**

Task-088 specifies the socket path (`$XDG_RUNTIME_DIR/korri/sessiond.sock`) but not
the protocol. The current HTTP surface has well-typed routes (`/control/start`,
`/managed-launch/start`, `/managed-launch/terminate`, SSE stream). The Unix socket
replacement could be:
- (a) HTTP-over-Unix-socket (same wire format, different transport)
- (b) A new binary or line-delimited protocol
- (c) Effect RPC over Unix socket

*Stakes:* Option (a) is lowest migration cost — existing TypeScript RPC handler code
works unchanged; the change is only at the transport layer (Hono/`@hono/node-server`
supports Unix socket binding). Options (b) and (c) require new client and server code.

*Default assumption:* HTTP-over-Unix-socket (option a); the sessiond HTTP surface is
kept but bound exclusively to the Unix socket path, never to a TCP port; `korrid`
dials the socket path via `fetch("http+unix:///path/to/sessiond.sock/control/start")`
or equivalent Bun-native syntax. The SSE stream for launch events uses the same
transport.

---

**Q6. Is the `korri-sessiond-clients` Unix group retired entirely, or does it survive
for a different purpose?**

Currently `korri-sessiond-clients` exists so `korri-server` (system user) and
`korri-source` (normal user) can both read the sessiond token file. Under the
clean-break model, both services run as `korri` — filesystem ownership is sufficient
and no shared group is needed.

However: if a future service (e.g., a CLI tool run as a different user, or a
diagnostic agent) needs to connect to `korrid`'s Unix socket, the group would reemerge.

*Stakes:* Retiring the group prematurely and then needing it back is a minor
regression. Keeping it with no members is harmless but confusing.

*Default assumption:* retire the group as part of task-085/task-086; document that
socket access for future cross-user consumers will be controlled by filesystem
permissions on the socket itself (group-readable socket owned by `korri:korri-sockets`
or similar), not a token-bearing group.

---

**Q7. What happens to existing `/var/lib/korri-server` and `/var/cache/korri-server`
state on upgrade?**

The existing `korri-server` system service uses `StateDirectory = "korri-server"` and
`CacheDirectory = "korri-server"`, creating `/var/lib/korri-server` and
`/var/cache/korri-server`. The new `korrid` user service will use different paths.

Is this a clean-break with intentional state loss (acceptable since the design goal is
"clean-break")? Or is a migration oneshot needed?

*Stakes:* library YAML under `/var/lib/korri-server/.local/share/korri/library/` would
be lost without migration. If that library contains user-curated game launch configs,
losing it is a user-visible regression. If it only contains system-generated platform
defaults, loss is acceptable.

*Default assumption:* clean-break; document that `/var/lib/korri-server` is a previous
release artifact and can be deleted manually; the platform defaults are regenerated
from Nix on each boot.

---

## Recommended Next Steps

These are ordered by blocking dependency:

1. **Answer Q3 before task-089.** The setup service's failure behavior depends on the
   persistence policy (task-083). Task-089 cannot fully specify `korri-setup.service`
   semantics until task-083 chooses between hard-fail, ephemeral-with-marker, or
   role-specific behavior.

2. **Answer Q1 and Q2 before task-086.** The greetd session contract and
   `korri-session.target` graph are the architectural backbone. Every other task's
   `WantedBy` / `After` / `Requires` choices depend on it. Write this as a one-page
   decision record before any module code changes.

3. **Pin the `korri` UID and add it to `services.korri.runtime` as the first change
   in task-085.** All other tasks derive socket paths, runtime dirs, and XDG paths
   from it. Doing this first prevents the UID from being left implicit and drifting.

4. **Remove `/storage/bin` from `sanitizeElectrobunPath()` as part of task-085 or
   task-087.** This is a TypeScript hardcode that has no relationship to the `korri`
   user and will silently produce wrong PATH strings on x86 kiosk and future
   non-ROCKNIX images.

5. **Answer Q5 before task-088.** The HTTP-over-Unix-socket approach (option a)
   is the lowest-risk path and can be confirmed by checking Bun's `serve({ unix:
   "/path/to/sock" })` API. If Bun supports it natively, the migration is a one-line
   server config change with the rest of the TypeScript unchanged. Confirm this before
   designing a new protocol.

6. **Specify Q4's answer as part of task-090.** The inputd startup ordering relative
   to the greetd session determines whether `After=graphical-session-pre.target`
   (user) or a different hook is correct. This must be validated on physical hardware
   since uaccess timing is not testable in the Nix VM smoke.

7. **Address gap C4 (SM8550 platform `/storage` and `/run/user/0`) early in
   task-085.** These are `lib.mkDefault` values in the Korri repo itself
   (`rocknix-sm8550.nix`), not in the substrate. They can be overridden by the new
   `services.korri.runtime` option module using `lib.mkForce` or by removing the
   defaults. Confirm the override priority chain before assuming this is safe.

8. **The `ExecStartPost /control/start` replacement (Q3 follow-on for task-088)
   should specify idempotency semantics for the socket handler.** The current
   duplicate-launch protection lives entirely in the curl retry budget. Moving that
   protection inside sessiond's socket handler is a better architecture and makes the
   boot script simpler. Write this into the task-088 acceptance criteria before
   implementation starts.
