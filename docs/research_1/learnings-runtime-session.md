# Institutional Learnings: Runtime-Session Contract Unification

> **Generated:** 2026-07-02  
> **Search scope:** `docs/solutions/` (all subdirectories)  
> **Task:** Planning a durable implementation for unifying Korri's runtime-session contract across x86 source-machine and Nix-on-Rocks portable devices. Target model: canonical `XDG_RUNTIME_DIR=/run/user/<uid>`, standard D-Bus/PipeWire/Pulse discovery, Korri state under subdirectories.

---

## Search Context

- **Feature/Task:** Unify Korri runtime-session contract across x86 source-machine (Aka/Bandai) and Nix-on-Rocks portable devices (ROCKNIX). Desired: canonical `XDG_RUNTIME_DIR=/run/user/<uid>`, standard D-Bus/PipeWire/Pulse socket discovery, Korri state under subdirectories.
- **Keywords Used:** `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`, `PULSE_SERVER`, `pipewire`, `pulseaudio`, source-machine, sessiond, compositor, gameStream, environment propagation, runtime-dir, `%t`, ROCKNIX, kiosk, boot-scoped, session-scoped
- **Files Scanned:** 83 total
- **Relevant Matches:** 8 files (strong/moderate)

---

## Critical Patterns

> `docs/solutions/patterns/critical-patterns.md` does not exist in this repo.

---

## Relevant Learnings

---

### 1. ROCKNIX uses `/var/run/0-runtime-dir`, not `/run/user/<uid>`

- **File:** `docs/solutions/best-practices/manual-steam-game-launching-rocknix-arm64-2026-05-04.md`
- **Module:** ROCKNIX ARM64 Steam + Sway environment
- **Problem Type:** `best_practice` (inferred from category)
- **Severity:** High (architectural divergence from canonical XDG)
- **Relevance:** This is the root cause of the cross-device runtime-dir mismatch the plan must resolve. ROCKNIX runs as root (uid=0) and its Sway compositor session publishes runtime state to `/var/run/0-runtime-dir`, not to `XDG_RUNTIME_DIR=/run/user/0` or any per-user path.

**Key Insight:**

Every validated ROCKNIX ARM64 launch (Steam, Sway, D-Bus, mDNS) uses this exact env bundle:

```bash
export XDG_RUNTIME_DIR=/var/run/0-runtime-dir
export SWAYSOCK=$(ls /var/run/0-runtime-dir/sway-ipc.*.sock | head -1)
export DBUS_SESSION_BUS_ADDRESS=unix:path=/var/run/0-runtime-dir/bus
export WAYLAND_DISPLAY=wayland-1
export DISPLAY=:0
```

The companion `runtime-errors/steam-desktop-ui-arm64-manifest-spinner-rocknix-2026-05-04.md` further records that audio was explicitly set with `SDL_AUDIODRIVER=pulseaudio` in the env — there is no PipeWire socket autodiscovery in this path; Pulse is the assumed backend.

**Contrast with Bandai/x86 (`runtime-errors/steam-arm64-stable-self-update-relaunch-loop-2026-06-27.md`):**

The NixOS-native Steam service on Bandai uses the canonical XDG layout — `XDG_RUNTIME_DIR=/run/user/2000`, `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/2000/bus`, `PULSE_SERVER=unix:/run/user/2000/pulse/native` — and these are *hardcoded into the systemd service unit*, not inherited from the compositor session.

**Planning implication:** The unification plan must bridge two incompatible filesystem layouts. Do not assume the target canonical shape (`/run/user/<uid>`) already exists on ROCKNIX devices; instead, the Nix-on-Rocks guest will need to materialize or alias `XDG_RUNTIME_DIR` into a path its own units own. The ROCKNIX host's `/var/run/0-runtime-dir` is the *host*'s runtime dir; the guest's units need their own.

---

### 2. `%t` resolves differently per systemd manager scope — derive runtime paths from `serviceMode`, not from `%t` directly

- **File:** `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`
- **Module:** `nix/modules/korri-server`
- **Problem Type:** `architecture_pattern`
- **Severity:** Medium (silent path divergence, not a crash)
- **Relevance:** Exactly the problem the unification plan will run into. Under the user systemd manager, `%t` → `/run/user/<uid>`. Under the system manager, `%t` → `/run`. These are different directories with different ownership semantics and no guarantee cooperating units can reach both.

**Key Insight:**

The canonical pattern is a `serviceMode` option that acts as the single public seam — `"user"` (session-scoped, safe `%t`) vs. `"system"` (boot-scoped, absolute `/run/<name>`) — and derives every path from it:

```nix
let
  isSystemMode = cfg.serviceMode == "system";
  systemRuntimeDir = "/run/${systemRuntimeDirName}";
  userRuntimeDir = "%t/korri-game-stream";   # safe in user mode only
in { ... }
```

**Additional pitfalls documented:**

- `%h` similarly resolves to root's home in system mode — silently writes state into `/root/.local/...` instead of the user's home.
- Process-owned `/run` dirs disappear on service restart; use `systemd.tmpfiles` + `RuntimeDirectoryPreserve = "yes"` to decouple dir lifetime from process lifetime.
- The session-scoped consumer (Sunshine runner / game-stream runner) cannot read the system unit's `RuntimeDirectory` via systemd metadata — it must be passed explicitly through an env var such as `KORRI_GAME_STREAM_RUNTIME_DIR`.

**Planning implication:** When writing the Nix module for the unified runtime dir, declare a mode option and derive all paths from it. Fail at Nix evaluation (module assertions) if `%t` appears in a system-mode path. Do not assume `%t` is `/run/user/<uid>` unless the unit runs under the user manager.

---

### 3. The full env envelope required by `korri-steam.service` is the reference contract for x86/ARM64 canonical paths

- **File:** `docs/solutions/runtime-errors/steam-sniper-fex-bwrap-architecture-path-2026-06-19.md`
- **Module:** Steam plugin / product/plugins/steam
- **Problem Type:** `runtime_error`
- **Severity:** High
- **Relevance:** Establishes the authoritative list of env vars that must be on every child process in the x86/ARM64 (Aka/Bandai) canonical launch path. This is the **positive spec** for what a unified session contract must provide.

**Key Insight:**

`korri-steam.service` is the **only valid Steam startup envelope**. Starting Steam ad hoc over SSH (without the service) produced socket exhaustion (`Too many open files`), `std::bad_alloc`, and IPC failures. The service provides:

| Variable | Canonical value (Bandai/x86) |
|---|---|
| `HOME` | `/home/korri` |
| `STEAM_HOME` | `/var/lib/korri/steam` |
| `XDG_RUNTIME_DIR` | `/run/user/2000` |
| `DBUS_SESSION_BUS_ADDRESS` | `unix:path=/run/user/2000/bus` |
| `WAYLAND_DISPLAY` | `wayland-1` |
| `DISPLAY` | `:0` |
| `PULSE_SERVER` | `unix:/run/user/2000/pulse/native` |
| `FEX_ROOTFS` | `/var/lib/korri/steam/fex-rootfs` |
| `LimitNOFILE` | `524288` |
| Group memberships | `korri-steam-input` |

Note: `PULSE_SERVER` is specified by **socket path** (`unix:/run/user/2000/pulse/native`), not by hostname/port. This is a PulseAudio/PipeWire-Pulse compat socket under `XDG_RUNTIME_DIR`, which means it is only available if the Korri user's systemd session (or an equivalent service) has started a PipeWire or PulseAudio daemon writing to that path.

**Planning implication:** The unified contract must guarantee that `$XDG_RUNTIME_DIR/pulse/native` exists (or a compatible socket alias) before any child that needs audio is launched. This is an activation ordering dependency, not just a path string.

---

### 4. Sessiond env re-assertion: every var the compositor used to implicitly provide must be declared explicitly on the supervisor unit

- **File:** `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md`
- **Module:** `nix/images + nix/modules + tools/device/sessiond`
- **Problem Type:** `architecture_pattern`
- **Severity:** High
- **Relevance:** Documents the **eleven-step empirical gap list** discovered when Electrobun moved from compositor-spawned to sessiond-spawned on Sobo/ROCKNIX. The pattern generalizes directly to any process that was previously a compositor child and becomes a sessiond child.

**Key Insight:**

When a singleton GUI process moves from `sway exec` child to sessiond-sibling, it loses all implicitly inherited compositor env. The complete re-assertion list is:

```
WAYLAND_DISPLAY        # wayland socket name (e.g. wayland-1)
XDG_RUNTIME_DIR        # where that socket lives
XDG_SESSION_TYPE       # "wayland" — GDK backend selection
XDG_CURRENT_DESKTOP    # "sway" — GDK backend selection
DISPLAY                # ":0" — Xwayland fallback used by sub-features
DBUS_SESSION_BUS_ADDRESS  # AT-SPI / dconf / portals
SWAYSOCK               # NOT static: glob $XDG_RUNTIME_DIR/sway-ipc.*.sock at spawn time
```

Gap taxonomy from the ROCKNIX kiosk rollout (each was masked by the previous failure):

- **GTK fell to X11** (`Gtk-WARNING: cannot open display:`) because `WAYLAND_DISPLAY` alone wasn't enough — `XDG_SESSION_TYPE=wayland` and `DISPLAY=:0` were both required.
- **`swaymsg` refused** with "Unable to retrieve socket path" because sessiond doesn't inherit `SWAYSOCK`. Fix: glob at spawn time.
- **`ProtectSystem=strict` made `/storage` read-only** — every renderer write (status.json, log) died with EROFS. Fix: `ReadWritePaths = [ compositorCfg.home ]`.
- **`setsid` unavailable** because `util-linux` wasn't on the unit PATH.

**Planning implication:** The unified runtime session module must carry these env vars on every sessiond/service unit. For `SWAYSOCK`, do not hardcode; discover at spawn time by globbing `$XDG_RUNTIME_DIR/sway-ipc.*.sock`. For `ProtectSystem`, enumerate the Korri state subdirs and declare them as `ReadWritePaths`.

---

### 5. Sessiond is the canonical foreground-session truth — both for kiosk and source-machine roles

- **File:** `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`
- **Module:** `tools/device/sessiond + korri/shared/library + nix/modules + nix/images`
- **Problem Type:** `architecture_pattern`
- **Severity:** High
- **Relevance:** Documents the settled source-machine role contract that the unification plan will extend. Idle means "no foreground app windows, no Gamescope residue, cooldown elapsed." Source-machine idle status, recovery diagnostics, and lifecycle projections are all defined here.

**Key Insight:**

Source-machine role specifics:

- **Idle wire label:** `idle`
- **Terminal readiness event:** `idle-ready`  
- **Idle invariant:** Sway alive, no Korri GUI client, no foreground app windows, no Gamescope residue, cooldown elapsed.
- **Token location:** `/run/korri-sessiond/token` — shared via group membership (`korri-sessiond-clients`). On kiosk, the calling process must be in `korri-server` group.
- **`failureReason` is redacted on the `app.server.status` wire** (SEC-003): absolute paths become `<path>`, string clamped to 256 chars. Cross-reference sessiond journal for unredacted path-bearing diagnostics.

The **lifecycle-projection seam** (`korri/shared/library/sessiond-lifecycle-projections.ts`) is where role idle aliases (`home` / `idle`) and evidence formats are centralized. Update there, not in RPC or renderer code.

**Planning implication:** The source-machine runtime session module must wire `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`, and `PULSE_SERVER` so sessiond children (game launchers, RPCS3, etc.) inherit them. The module must also ensure `/run/korri-sessiond/token` is accessible to the group that source-machine client processes join.

---

### 6. Boot-scoped Korri state under `/run/<name>` must be managed by `systemd.tmpfiles`, not `ExecStartPre`

- **File:** `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md` (same as #2, different sub-point)
- **Module:** `nix/modules/korri-server`
- **Problem Type:** `architecture_pattern`
- **Severity:** Medium
- **Relevance:** Directly governs how Korri subdirectories under `XDG_RUNTIME_DIR` (or the equivalent system path) must be created.

**Key Insight:**

- A non-root `ExecStartPre` cannot create a top-level `/run/<name>` directory (sibling of `/run/user`); only `root` can write `/run` directly.
- Process-owned `/run` dirs vanish on restart, losing pending intents.
- The correct NixOS pattern is:

```nix
systemd.tmpfiles.settings."10-korri-server".${runtimeDir}.d = {
  user = cfg.user;
  group = cfg.group;
  mode = "0700";
  age = "-";  # never GC'd
};

systemd.services.korri-foo.serviceConfig = {
  RuntimeDirectory = "korri-foo";
  RuntimeDirectoryMode = "0700";
  RuntimeDirectoryPreserve = "yes";  # survives restart
};
```

- The session-scoped consumer gets the absolute path via an explicit env var (e.g., `KORRI_GAME_STREAM_RUNTIME_DIR`) baked in by the module. The env var prefers the injected value and falls back to `$XDG_RUNTIME_DIR/korri-game-stream` when nothing is injected.

**Planning implication:** Any Korri subdirectory under `XDG_RUNTIME_DIR` (whether `korri/audio`, `korri/sessiond`, `korri/stream`, etc.) must be created by `systemd.tmpfiles`, not by the process. Use `RuntimeDirectoryPreserve = "yes"` for dirs that hold intent/status files that must survive service restarts.

---

### 7. Do not sniff env/argv to infer child audio/display intent — make it explicit in cascade policy

- **File:** `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`
- **Module:** `korri/shared/library/config + tools/device/game-stream-fullscreen`
- **Problem Type:** `design_pattern`
- **Severity:** Medium
- **Relevance:** Applies when the unified session module needs to decide, per launcher or per plugin, which audio backend, which Wayland display name, or which D-Bus address to inject. Sniffing the child's argv or env for `PULSE_SERVER`, `WAYLAND_DISPLAY`, or `SDL_AUDIODRIVER` is the anti-pattern this doc names.

**Key Insight:**

This failure has bitten three different Korri subsystems (input-bus source inference, gamescope `--expose-wayland` inference, focus-style inference). The pattern is:

- Child's real config lives where the wrapper can't see it (a `.cfg` file, registry, dotfile).
- Wrapper guesses from argv/env → gets it wrong → no error, just degraded behavior.

**Correct shape:**
- The component that *knows* a fact (e.g., `moonlight-launcher` knows it passes `-platform wayland`) records it in a named, cascade-folded policy field.
- The composer emits flags/env strictly from resolved policy, no sniffing.
- The cascade default encodes what's correct for the typical production deployment.

**Planning implication:** When the unified session module needs to inject different `PULSE_SERVER` values (PipeWire socket vs. PulseAudio socket vs. none) per device role, encode that as a `sessionContract.audio.backend` field in the cascade config, not by detecting what socket files happen to exist at launch time.

---

### 8. ROCKNIX deployment requires guest-store-only Nix; the host has no `/nix`

- **File:** `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md`
- **Module:** `nix/modules + product/systems/rocknix`
- **Problem Type:** `workflow_issue`
- **Severity:** Medium (deployment anti-pattern, not a crash)
- **Relevance:** Affects any Nix module that declares paths or services intended to run on the ROCKNIX host layer. The ROCKNIX host is intentionally tiny (busybox, no `/nix`). All NixOS tooling must target the guest store, accessed via `nsenter` from the host.

**Key Insight:**

- The toplevel only needs to exist in the **guest** store.
- ROCKNIX helpers (`rocknix-guest-generation-import`, `rocknix-guest-generation-switch`) `nsenter` into the NixOS guest container to import and activate.
- The host has no Nix, no `nix copy`, no `nix profile`. Scripts that try to write the host's `/nix` will fail.
- Restart the guest container (`systemctl restart rocknix-guest.service`) on the host after switching generation.

**Planning implication:** Any Nix module that materializes `XDG_RUNTIME_DIR` canonical paths on a ROCKNIX device must target the **guest** NixOS context — units declared under `systemd.services` or `systemd.user.services` in the guest flake, not the ROCKNIX host OS. The host's `/var/run/0-runtime-dir` is outside the guest's control; the guest's own `XDG_RUNTIME_DIR` will live at whatever path the NixOS systemd session manager mounts it.

---

## Recommendations

### On the runtime dir split

1. **Treat the ROCKNIX `/var/run/0-runtime-dir` as the host's runtime dir, not the Korri guest's.** The guest NixOS session will have its own `XDG_RUNTIME_DIR` (likely `/run/user/<uid>` once systemd-logind runs in the guest). Do not try to reuse or alias the host's path from guest units.

2. **Use `serviceMode = "user"` for guest-side session services and let `%t` resolve normally within the guest.** Only escalate to `serviceMode = "system"` if a unit must be boot-scoped and headless. In that case, pass the absolute path explicitly via env; never rely on `%t` across the user/system boundary.

3. **Define the canonical runtime dir as a single Nix option** (`cfg.session.runtimeDir` or similar) and derive every subdirectory (`korri/audio`, `korri/sessiond`, `korri/stream`, etc.) from it. Fail at evaluation if the option holds a `%t` specifier in system mode.

### On D-Bus / PipeWire / PulseAudio

4. **Specify audio sockets by path, not by name.** The validated pattern is `PULSE_SERVER=unix:/run/user/2000/pulse/native` (Bandai) and `SDL_AUDIODRIVER=pulseaudio` (ROCKNIX). For PipeWire-Pulse compat, the socket is `$XDG_RUNTIME_DIR/pulse/native`. Express this as a derived value in the Nix module, not a hardcoded string.

5. **Add a service ordering dependency** on whatever activates the PipeWire/PulseAudio socket before launching any child that needs audio. If the socket isn't there yet, game launches will silently fall back to no audio or fail initialization.

6. **For D-Bus, use the standard `unix:path=$XDG_RUNTIME_DIR/bus` derivation.** Validate at deploy time that `dbus-daemon --session` or an equivalent is writing to that path in the guest before marking the session ready.

### On sessiond env propagation

7. **Re-assert the full env bundle on every sessiond unit** using the list from learning #4: `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR`, `XDG_SESSION_TYPE=wayland`, `XDG_CURRENT_DESKTOP=sway`, `DISPLAY=:0`, `DBUS_SESSION_BUS_ADDRESS`. Omitting any one of these causes silent GTK/D-Bus fallback that is hard to diagnose.

8. **Discover `SWAYSOCK` at spawn time** by globbing `$XDG_RUNTIME_DIR/sway-ipc.*.sock` — never hardcode it. Sway's IPC socket PID suffix varies. Add the glob to the NixOS module so it is baked into the launcher script.

9. **Enumerate `ReadWritePaths` for every Korri state subdir** when using `ProtectSystem=strict` on sessiond. The pattern from kiosk rollout: carve holes per directory (`status.json`, logs, XDG state) rather than disabling hardening globally.

### On source-machine role

10. **Token placement must match group membership.** The `/run/korri-sessiond/token` file must be readable by the group that the Korri launcher process joins. On source-machine, this is `korri-sessiond-clients`. Declare the group in NixOS and add it to the RPCS3/plugin user at module level.

11. **Lifecycle projections live in one place.** When adding source-machine idle semantics for a new device shape (x86 vs. Nix-on-Rocks portable), extend `korri/shared/library/sessiond-lifecycle-projections.ts`. Do not duplicate idle-alias switch tables in RPC handlers or renderer atoms.

### On ROCKNIX deployment workflow

12. **Deploy NixOS module changes through guest-generation switch, not direct host write.** Use `rocknix-guest-generation-import` + `rocknix-guest-generation-switch` + `systemctl restart rocknix-guest.service`. Any script that tries to write the ROCKNIX host's filesystem under `/etc`, `/usr`, or `/nix` will fail or be lost on reboot.

---

## Files Consulted

| File | Relevance |
|---|---|
| `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md` | `%t` resolution split; serviceMode pattern; tmpfiles + RuntimeDirectoryPreserve; cross-scope env injection |
| `docs/solutions/runtime-errors/steam-arm64-stable-self-update-relaunch-loop-2026-06-27.md` | Canonical Bandai env bundle: XDG_RUNTIME_DIR=/run/user/2000, PULSE_SERVER socket path |
| `docs/solutions/runtime-errors/steam-desktop-ui-arm64-manifest-spinner-rocknix-2026-05-04.md` | ROCKNIX env bundle: /var/run/0-runtime-dir, SDL_AUDIODRIVER=pulseaudio |
| `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md` | Full 11-gap env re-assertion list; SWAYSOCK discovery; ProtectSystem ReadWritePaths |
| `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md` | Source-machine role contract; token placement; lifecycle-projection seam |
| `docs/solutions/runtime-errors/steam-sniper-fex-bwrap-architecture-path-2026-06-19.md` | korri-steam.service as canonical env envelope; ad-hoc launch anti-pattern |
| `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md` | Explicit policy fields over env/argv sniffing; audio/display injection design |
| `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md` | ROCKNIX guest-store-only constraint; nsenter deploy pattern |
| `docs/solutions/integration-issues/one-command-odin-electrobun-deploy-needs-device-nix-and-session-env-2026-05-06.md` | Conservative display defaults; SWAYSOCK fallback pattern; sessiond display env gaps |
| `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md` | Sessiond as single source of lifecycle truth (background for source-machine design) |
