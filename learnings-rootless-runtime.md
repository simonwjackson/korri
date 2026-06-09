# Institutional Learnings: Rootless Appliance Runtime Refactor

## Search Context
- **Feature/Task**: Clean-break Korri rootless appliance runtime refactor — systemd user services, root vs non-root runtime identity, NixOS modules, RockNIX/nix-on-rocks guest boundaries, sessiond, inputd, federation, filesystem path contracts, `/storage` removal from guest contracts, `/home/korri` and `/var/lib/korri`, and `korri-server` → `korrid` rename.
- **Keywords Used**: sessiond, systemd user service, runtime identity, non-root, XDG_RUNTIME_DIR, boot-scoped, session-scoped, korri-server, nix-on-rocks, rocknix, guest boundary, /storage, /home/korri, /var/lib/korri, federation, inputd, NixOS module defaults, image-level defaults, path contracts, RuntimeDirectory, tmpfiles
- **Files Scanned**: 68 total (content-searched); ~25 candidate matches; 7 fully read
- **Relevant Matches**: 7 primary files, 2 adjacent entries cited

---

## Critical Patterns

`docs/solutions/patterns/critical-patterns.md` does not exist in this repo.

---

## Relevant Learnings

### 1. Boot-scoped control plane with session-scoped runner — `serviceMode`, path derivation, trust contracts, and migration footguns

- **File**: `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`
- **Module**: `nix/modules/korri-server` (now being renamed to `korrid`)
- **Problem Type**: `architecture_pattern`
- **Severity**: medium
- **Relevance**: This is the direct predecessor of the rootless refactor. It documents exactly the friction points that motivated switching `korri-server` (soon `korrid`) from a `systemd.user.services` unit to a boot-scoped `systemd.services` unit, and the full NixOS module pattern to do it safely. The `serviceMode` option, `%t` / `%h` dangers, path derivation, and tmpfiles wiring are all live in the codebase today.

**Key Insights:**

**`%t` and `%h` silently corrupt paths in system mode.** Under the user manager, `%t` is `/run/user/<uid>`; under the system manager, `%t` is `/run`, so `%t/korri-game-stream` silently becomes a top-level `/run/korri-game-stream`. Similarly, `%h` becomes `/root` in system mode. Any path in the new rootless modules that still uses `%t` or `%h` specifiers will silently misbehave if the service is promoted to a system unit. Module assertions must catch `%` placeholders in system-mode paths at eval time.

**`serviceMode` is the single public seam; everything derives from it.** The pattern is: declare one canonical `serviceMode = mkOption { type = enum ["system" "user"]; default = "user"; }`, then derive runtime paths, user assertions, library root, env injection, and tmpfiles entries strictly from that option. Hosts never re-type `/run/<name>` boilerplate. The path for the rootless `korrid` should follow this same derivation pattern.

**Use `systemd.tmpfiles` + `RuntimeDirectoryPreserve = "yes"`, not `ExecStartPre` for `/run/<name>` dirs.** A non-root process cannot create a sibling of `/run/user` via `ExecStartPre`. Tmpfiles establishes boot-time ownership; `RuntimeDirectory` declares participation; `RuntimeDirectoryPreserve = "yes"` keeps pending intents (launch intents, status files) alive across restarts. This is the only safe shape.

**Fail closed at evaluation, not at runtime.** Module assertions must reject: missing user, `user = "root"`, `%` specifiers in system-mode paths, relative paths, and intent/status paths that escape the managed runtime directory. The runner trust contract (private parent `0700`, owner UID, `0600` file) is only enforceable if evaluation catches misconfigurations.

**Two units, one port is the migration footgun.** When migrating from `systemd.user.services.korri-server` to `systemd.services.korrid`, emit a `warnings` block when both appear enabled on the same port. The old user unit must be explicitly disabled; the new system unit doesn't detect the conflict at runtime — it fails at bind time.

**The session-scoped runner (Sunshine-launched) cannot read `RuntimeDirectory` from systemd metadata.** Push the chosen runtime dir explicitly through env (`KORRI_GAME_STREAM_RUNTIME_DIR`). The wrapper prefers the explicit env var and only falls back to `$XDG_RUNTIME_DIR/korri-game-stream` when nothing was injected.

**Sunshine stays a user service regardless.** Moving `korrid` to a system unit is safe and correct, but Sunshine itself remains `systemd.user.services.sunshine`. The spawn chain (Sunshine → runner) is always session-scoped. The shared private runtime dir is the seam that makes the dual lifecycle safe.

**Test by evaluating the module, not just running TypeScript.** TypeScript tests alone cannot prove systemd unit shape. The test pattern is `nix eval` of the module against fixture overrides, asserting on emitted unit shape, env, tmpfiles entries, assertion messages, and warnings. See `tools/testing/nix/korri-server-module-eval.test.ts`.

---

### 2. Sessiond operator model — one daemon per foreground-capable host (with explicit "stop running as root" backlog)

- **File**: `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`
- **Module**: `tools/device/sessiond` + `korri/shared/library` + `nix/modules` + `nix/images`
- **Problem Type**: `architecture_pattern`
- **Severity**: high
- **Relevance**: Sessiond is directly in scope for the rootless refactor. This doc explicitly lists **task-004 — "stop running runtime services as root (sessiond is one of the affected daemons)"** in its cross-cutting backlog. It defines the token path, group model, Unix socket vs TCP port, and the protocol evolution rules that the rootless work must preserve or migrate.

**Key Insights:**

**Task-004 is the rootless refactor's direct ancestor.** The backlog item is recorded at `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md` under "Cross-cutting backlog". Multi-user support (task-008) is the downstream consequence; do not conflate the two in scope.

**Token path and group contract.** The Nix module wires the sessiond token at `/run/korri-sessiond/token`. On kiosk hosts, the renderer's calling process must be in the `korri-server` group. On source-machine hosts, the shared group is `korri-sessiond-clients`. Any rename of the `korri-server` service user/group directly affects which group the renderer runs as and which group token reads are granted to. Audit all `korri-server` group references before the rename.

**Protocol is additive-only; new fields are optional by default.** The five wire-evolution rules (schemas update before daemon emits; additive only; optional by default for new fields; mixed-version deployments are supported; capability flags over schema versioning) must be respected if the rootless refactor changes any managed-launch protocol fields. The `korri-server` → `korrid` rename is an implementation-internal change; it must not change the wire shape.

**Strict decode is the consumer default; never flip it globally.** `onExcessProperty: "error"` is the default. Relaxing strict decode is always per-call-site.

**Unix domain socket for system deployments; TCP for dev.** The managed-launch HTTP/SSE protocol already plans for a Unix socket in production (`/run/korri-sessiond/socket` or similar). The rootless refactor is the right moment to flip the default IPC channel from localhost TCP to a Unix socket owned by the `korri-sessiond` user/group, since the socket path contract and tmpfiles ownership are being established at the same time.

---

### 3. Kiosk renderer ownership by sessiond — `/storage` hardening, Wayland env on systemd siblings, and the 11 runtime invariants

- **File**: `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md`
- **Module**: `nix/images` + `nix/modules` + `tools/device/sessiond`
- **Problem Type**: `architecture_pattern`
- **Severity**: high
- **Relevance**: This is the richest source of "what breaks when you move a process from compositor-exec to systemd-sibling" — which is exactly what the rootless refactor does to every runtime service. The eleven empirical fixes include the `/storage` read-only constraint that directly affects the `/home/korri` → `/var/lib/korri` path contract work.

**Key Insights:**

**`ProtectSystem=strict` mounts `/storage` read-only.** Sessiond's hardening is already live. Any service that inherits `ProtectSystem=strict` (or that the rootless refactor tightens to `strict`) will lose write access to `/storage`. The fix is `ReadWritePaths = [ compositorCfg.home ]` — a targeted carve-out, not a hardening downgrade. The new `/var/lib/korri` path for persistent state must be declared as a `ReadWritePaths` or `StateDirectory` entry on every unit that writes to it. **Do not silently rely on `/storage` being writable.**

**SWAYSOCK is not on the unit environment; discover it at spawn time.** Sessiond's unit does not inherit `SWAYSOCK` from sway (unlike sway exec children). The fix is to glob `$XDG_RUNTIME_DIR/sway-ipc.*.sock` at spawn time in `realSwayController.run`. Any new rootless service that needs to interact with sway must do the same.

**Env vars that sway used to provide for free must be re-asserted on every systemd-sibling unit:**
- `WAYLAND_DISPLAY` — Wayland socket
- `XDG_RUNTIME_DIR` — Wayland socket directory
- `XDG_SESSION_TYPE=wayland` — GDK backend selection
- `XDG_CURRENT_DESKTOP=sway` — GDK backend selection
- `DISPLAY=:0` — Xwayland fallback
- `DBUS_SESSION_BUS_ADDRESS` — AT-SPI / dconf / portals

When the rootless refactor moves services to dedicated user accounts (`korri` user, `korrid` user, etc.) that are not the interactive session user, these env vars are absent. Each must be explicitly baked into the unit's `Environment=` or `EnvironmentFile=`.

**`/run/systemd` is tmpfs; ad-hoc drop-ins evaporate on reboot.** ROCKNIX `/etc` is read-only, `/run/systemd` is tmpfs. Any env or unit override that needs to survive reboot must be baked into the NixOS image, not written as a runtime drop-in. The `KORRI_ELECTROBUN_LOG` path was burned by this exact failure.

**The boot symptom of a broken sessiond spawn is "sway up, black screen, 10-second white flash".** That cadence matches `waitForStatusFile`'s default timeout. If the rootless refactor introduces a spawn regression, this is the visible symptom. First-stop diagnostic: `tail -200 /storage/.local/state/korri/electrobun.log` (or `/var/lib/korri/electrobun.log` post-rename).

**Renderer log must use append mode, not truncate.** `Bun.file(path)` truncates on open. Multi-spawn loops must use `fs.openSync(path, "a")`. Any new persistent log path established by the rootless refactor should use append mode from day one.

---

### 4. Architectural posture belongs in the image-level default, not the module-level default

- **File**: `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`
- **Module**: `nix/images` + `nix/modules`
- **Problem Type**: `architecture_pattern`
- **Severity**: medium
- **Relevance**: The `korri-server` → `korrid` rename introduces a new user/group name. This learning documents where the `user = "korri-server"` / `group = "korri-server"` declarations live today (image base, not module), and the principle that governs where the renamed declarations should land. The same principle applies to the rootless identity (`korri` user, `/var/lib/korri` home, `/run/korrid` socket) — decide which posture is the "always-on fleet default" and put it at the image base, not the module.

**Key Insights:**

**Module defaults are conservative fallbacks; image-base defaults are fleet assertions.** The module default for `host` is `"127.0.0.1"` (safe for one-off consumers). The image base overrides it to `"0.0.0.0"` (required for federation). The same logic applies to the rootless runtime identity: the module should default to whatever is safe for a bare consumer; the kiosk/source-machine image bases should assert the rootless user and `/var/lib/korri` home as `lib.mkDefault` overrides.

**A multi-option capability must be bundled at the same layer.** Federation required three coordinated options (`host`, `openFirewall`, `services.avahi.enable`) to be coherent. The rootless refactor similarly requires coordinated options: service user name, home directory, state directory path, socket path, group membership. If any of these are left at different layers they will silently drift apart on the next new image consumer. Bundle all rootless identity options at the image base.

**Out-of-band host configs silently carry what the image should.** If an existing host (like AKA/mountainous) works today because it has manual overrides for the old `korri-server` user, those overrides mask the fact that the image doesn't yet encode the new identity. After the rename, audit all out-of-band host configs and migrate their overrides into the new image-base defaults.

**Assertions belong at the same layer that owns the posture.** The `korri-image-outputs-check.nix` Nix check was updated at the same commit as the image-base defaults. After the rootless refactor, the outputs check must assert: service runs as the correct non-root user, state directory is under `/var/lib/korri`, socket path is the canonical Unix socket.

**The `userServices = lib.mkDefault true` line is already in the image base** (`nix/images/headless.nix`). It enables avahi user services for mDNS. Verify this survives the rename cleanly and that the renamed `korrid.service` unit is still reachable via the user services path if that path is used.

---

### 5. ROCKNIX nix-on-rocks deploys target the guest store; the host has no `/nix`

- **File**: `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md`
- **Module**: `tools/scripts/deploy-sobo` + `nix-on-rocks`
- **Problem Type**: `workflow_issue`
- **Severity**: high
- **Relevance**: The rootless refactor changes NixOS module declarations, service users, state paths, and socket paths. All of these land in the NixOS guest (managed by nix-on-rocks inside the ROCKNIX host). The deploy path for testing and rolling out the refactor must go through the guest store. Any path or identity change that is tested via `nix copy` to the host or via ad-hoc SSH drops to the host filesystem will not reach the NixOS layer.

**Key Insights:**

**The host (ROCKNIX, port 22) and the guest (NixOS, port 2222) are different machines with different stores.** Every change in the rootless refactor — new user declarations, new `tmpfiles` entries, new state directory paths, renamed units — lives in the guest store. `nixos-rebuild boot --target-host root@sobo` pushes the closure to the guest. Never `nix copy --to ssh-ng://root@${DEVICE_HOST}` (host port 22); the host has no store.

**`readlink -f` is required for profile resolution on the guest.** Bare `readlink /nix/var/nix/profiles/system` returns a relative symlink (`system-NNN-link`). Every script that resolves the active NixOS toplevel for import/switch must use `readlink -f`. This applies to any CI or manual validation scripts written for the rootless refactor.

**`rocknix-guest-generation-import` and `rocknix-guest-generation-switch` are the only sanctioned mutation paths.** They `nsenter` into the NixOS guest namespace. Do not invent alternative generation-switching paths in deploy scripts; they will silently operate on the host rather than the guest.

**The ROCKNIX host is intentionally tiny (busybox, no nix).** The host's role is coordination (nsenter helpers, `rocknix-guest.service` restart). The new rootless runtime identities, socket paths, and tmpfiles rules all live in NixOS guest space. Validate them via `ssh -p 2222` to the guest, not via `ssh -p 22` to the host.

**Warm-restart `rocknix-guest.service` to activate a new generation.** The sequence is: `nixos-rebuild boot` (copies toplevel to guest store) → `rocknix-guest-generation-import --system <toplevel>` → `rocknix-guest-generation-switch --to <toplevel> --no-restart` → `systemctl restart rocknix-guest.service`. The rootless refactor validation runbook must follow this sequence exactly.

---

## Adjacent Entries (cited, not fully developed)

**`docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`** — Records SEC-003 (`redactSessiondFailureReason` at the `app.server.status` seam), which strips absolute Unix paths from sessiond's failure reason on the unauthenticated LAN wire. After the rootless refactor changes path constants from `/storage/...` to `/var/lib/korri/...`, the redaction regex should be re-verified to still catch the new paths. Also notes parking-lot items: `work/parking-lot/01KSRGFP03RFZQGFSS6FJ1FCTJ-stop-running-as-root` and `work/parking-lot/01KSRGFP074RDRTVJ584FHN90A-multi-user-support` — these are the formal upstreams of the rootless refactor.

**`docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`** — For any new config cascade work in the refactor (especially around path defaults, socket paths, or user-identity knobs): add explicit cascade-folded policy fields rather than runtime env/argv sniffing. The `DEFAULT_GAMESCOPE_POLICY` pattern is the template.

---

## Recommendations

### Hard constraints (these will break silently or at boot if violated)

1. **Never use `%t` or `%h` systemd specifiers in system-mode unit paths.** Add NixOS module `assertions` that catch any `%` character in runtime dir, intent path, status path, socket path, or state directory when `serviceMode == "system"` or when the service runs as a non-interactive user. This is the #1 footgun from the prior refactor.

2. **Use `systemd.tmpfiles` + `RuntimeDirectoryPreserve = "yes"` for all shared directories under `/run/`.** Do not rely on `ExecStartPre` to create `/run/korrid/` or `/run/korri-sessiond/`. A non-root process cannot create siblings of `/run/user`. Tmpfiles owns the creation; `RuntimeDirectory` declares participation; `RuntimeDirectoryPreserve` keeps files alive across restarts.

3. **Declare `ReadWritePaths` for every path the service writes to under `/storage` or `/var/lib/korri`.** `ProtectSystem=strict` is already on sessiond. If the refactor adds `ProtectSystem=strict` to more units, every persistent write path (log files, status files, XDG state dirs, library data) must appear in `ReadWritePaths` or be declared as `StateDirectory`. Omissions fail at runtime with `EROFS`; they are invisible in `nix eval`.

4. **Re-assert all Wayland env vars on every unit that moves from sway-exec to systemd-sibling.** `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR`, `XDG_SESSION_TYPE=wayland`, `XDG_CURRENT_DESKTOP=sway`, `DISPLAY=:0`, `DBUS_SESSION_BUS_ADDRESS`. `SWAYSOCK` must be discovered at spawn time by globbing `$XDG_RUNTIME_DIR/sway-ipc.*.sock`, not injected as a static value.

5. **Audit every reference to the `korri-server` group before renaming.** On kiosk hosts, the renderer's calling process must be in the `korri-server` group to read the sessiond token. Renaming the service user from `korri-server` to `korrid` (or `korri`) without updating group membership in the NixOS modules will break the token read on kiosk hosts at runtime, with a silent `401` from sessiond.

6. **Deploy rootless changes exclusively through the NixOS guest path (`nixos-rebuild boot --target-host root@sobo` → generation import/switch → guest service restart).** Do not test path changes by SSHing to the ROCKNIX host (port 22) and writing to `/storage` directly. Changes that only exist in the host filesystem are not in the NixOS guest and will be blown away on the next generation switch.

### Migration sequencing

7. **Default the new modules to the old behavior; require opt-in for rootless mode.** Mirror the `serviceMode` precedent: existing `user = "root"` or `user = "korri-server"` deployments should continue working without change; the new rootless identity is gated behind an explicit option (e.g., `user = "korri"`) or a new `serviceMode = "rootless"`. Fail closed with a clear eval-time error if an incompatible combination is detected.

8. **Bundle all rootless identity options at the image base, not the module.** Service user name, home directory (`/var/lib/korri`), state directory, socket path, group memberships — put the production-correct values as `lib.mkDefault` overrides in `nix/images/headless.nix` (or its kiosk/source-machine children). The module keeps conservative defaults for bare consumers.

9. **Update `korri-image-outputs-check.nix` at the same commit as the image-base defaults.** Assertions that verify the rootless posture (service user is not root, socket path is canonical, state dir is `/var/lib/korri`) prevent silent regressions when a new image consumer forgets to inherit the posture.

10. **Verify SEC-003 redaction after path constants change.** `redactSessiondFailureReason` strips absolute Unix paths from the `app.server.status` wire. After `/storage/...` paths become `/var/lib/korri/...`, re-run the unit tests for the redactor to confirm the new path prefix is still caught.

11. **For `korri-server` → `korrid` rename: preserve the wire protocol and RPC tag namespace unchanged.** The rename is an implementation-internal change. `korri.server.*` RPC tags, the managed-launch wire schema, and the `KORRI_SESSIOND_*` env var names must not change. The binary name, NixOS option path (`services.korri.server` → `services.korri.server` or a new `services.korrid`) and systemd unit name are the only rename targets.
