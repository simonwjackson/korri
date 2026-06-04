---
title: Boot-scoped NixOS control plane with session-scoped runner via shared private runtime dir
date: 2026-05-19
category: docs/solutions/architecture-patterns
module: nix/modules/korri-server
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - A NixOS module must support both boot-scoped system and session-scoped user lifecycles for the same service
  - A control-plane unit and a session runner share private runtime files (intents, status) through the filesystem
  - Default runtime paths must switch with service mode without forcing every host to repeat path boilerplate
  - Fail-closed trust contracts (private parent, non-root owner, 0600 file) constrain ownership and path choices
  - "Cooperating units must agree on absolute paths regardless of `%t` vs `/run/<service>` resolution"
tags:
  - nixos-module
  - systemd-service
  - service-mode
  - tmpfiles
  - runtime-directory
  - launch-intent
  - korri-server
  - boot-scoped
related_components:
  - development_workflow
---

# Boot-scoped NixOS control plane with session-scoped runner via shared private runtime dir

## Context

`services.korri.server` started as a `systemd.user.services` unit, which made sense when the server was co-located with an interactive Sway session. Promoting it to the always-on control plane for headless stream hosts exposed a stack of friction points that all share one root: a system-scoped lifecycle and a user-scoped lifecycle have different ideas about identity, paths, and ownership, but the launch-intent trust contract demands they agree on a single private file boundary.

The concrete friction:

- **"Enabled but inactive" surprise on user services.** When the user manager is already running for the session user, a freshly-enabled user unit can appear configured-but-not-running until the manager reaches `default.target` again. Headless stream hosts need the control plane up at boot, not after login.
- **`%t` resolves differently per manager.** Under the user manager, `%t` is `/run/user/<uid>`. Under the system manager, `%t` is `/run`, so `%t/korri-game-stream` silently becomes a top-level `/run/korri-game-stream` — a different directory with different ownership semantics, and no guarantee the runner can read it.
- **`%h` silently resolves to root's home in system mode.** `%h/.local/share/korri/library` is fine under the user manager but becomes `/root/.local/...` under the system manager. The server then can't read the user's library, or worse, writes state into root-owned paths the session runner can't touch.
- **Process-owned `/run` dirs disappear on restart.** If the server's `ExecStartPre` is the only thing creating the runtime directory, a stop-then-start (or a crash before the runner picks up the intent) blows away the pending intent. The session-scoped Sunshine runner then sees nothing where the server promised something.
- **Two units, one port.** Migrating from user unit to system unit without explicitly disabling the old one is a real footgun: both try to bind `:3001`, both try to advertise the same mDNS record, and which one wins depends on boot order.
- **Sunshine stays a user service.** Sunshine itself ships as `systemd.user.services.sunshine` on NixOS, so the runner it spawns is session-scoped no matter what. The control plane can move to boot scope independently, but it then has to publish its private runtime directory in a way the session-scoped runner can find and trust.

## Guidance

Model service lifecycle as an explicit option, then derive everything that depends on it — paths, env, ownership, assertions — from that single choice. Default to backward-compatible behavior; require opt-in for the new mode; fail closed at evaluation when the chosen mode and the supplied paths/users can't satisfy the trust contract.

### 1. `serviceMode` is the public seam

Declare a single canonical option. Default `"user"` so existing deployments keep working without surprise; downstream stream hosts opt into `"system"` explicitly.

```nix
serviceMode = mkOption {
  type = types.enum [ "system" "user" ];
  default = "user";
  description = ''
    "user" emits systemd.user.services.korri-server (session-scoped, %t paths).
    "system" emits systemd.services.korri-server (boot-scoped under multi-user.target,
    runs as a configured non-root user, /run/<name> paths).
  '';
};
```

### 2. Derive runtime paths from the mode, not from the host

Hosts should not have to re-type `/run/korri-game-stream` boilerplate. The module decides the safe default per mode; overrides remain possible but are validated.

```nix
let
  isSystemMode = cfg.serviceMode == "system";
  systemRuntimeDirName = "korri-game-stream";
  systemRuntimeDir = "/run/${systemRuntimeDirName}";
  userRuntimeDir = "%t/korri-game-stream";
in {
  streamHost.runtimeDir = mkOption {
    type = types.str;
    default = if isSystemMode then systemRuntimeDir else userRuntimeDir;
  };
  streamHost.intentPath = mkOption {
    default = "${cfg.streamHost.runtimeDir}/next-launch.json";
  };
  streamHost.statusPath = mkOption {
    default = "${cfg.streamHost.runtimeDir}/status.json";
  };
}
```

### 3. Derive `library.root` from the configured user's declared home

`%h` is unsafe in system mode. Resolve the home through `config.users.users.<cfg.user>.home`, and throw at evaluation if it can't be resolved and the host hasn't supplied an explicit absolute root.

```nix
configuredUserHome =
  if cfg.user != null && cfg.user != ""
  then (config.users.users.${cfg.user} or { }).home or null
  else null;

library.root = mkOption {
  default =
    if isSystemMode then
      (if configuredUserHome != null
       then "${configuredUserHome}/.local/share/korri/library"
       else throw "services.korri.server.library.root could not be derived ...")
    else "%h/.local/share/korri/library";
};
```

### 4. Decouple `/run/<name>` ownership from the process

Use `systemd.tmpfiles` for boot-time ownership and `RuntimeDirectory` with `RuntimeDirectoryPreserve = "yes"` on the unit. Tmpfiles establishes ownership; the unit declares its participation; preservation keeps pending intents alive across server restarts.

```nix
systemd.tmpfiles.settings = mkIf
  (isSystemMode && cfg.streamHost.enable && isDefaultSystemRuntimeDir) {
    "10-korri-server".${systemRuntimeDir}.d = {
      user = cfg.user;
      group = if cfg.group != null then cfg.group else cfg.user;
      mode = "0700";
      age = "-";
    };
  };

systemd.services.korri-server.serviceConfig = {
  # ... User, Group, ExecStart, hardening ...
} // optionalAttrs isDefaultSystemRuntimeDir {
  RuntimeDirectory = systemRuntimeDirName;
  RuntimeDirectoryMode = "0700";
  RuntimeDirectoryPreserve = "yes";
};
```

Do not put `install -d` into a non-root `ExecStartPre` for top-level `/run/<name>` directories; a non-root process cannot create a sibling of `/run/user`.

### 5. Conservative system-service hardening

The boot-scoped unit has a larger availability window and a larger attack surface than a session-scoped one. Apply tight defaults that are still compatible with the runtime (Bun, library reads, network bind, runtime writes):

```nix
serviceConfig = {
  User = cfg.user;
  Group = if cfg.group != null then cfg.group else cfg.user;
  NoNewPrivileges = true;
  PrivateTmp = true;
  ProtectSystem = "strict";
  ProtectHome = "read-only";
  ProtectKernelTunables = true;
  ProtectKernelModules = true;
  ProtectControlGroups = true;
  RestrictSUIDSGID = true;
  RestrictRealtime = true;
  LockPersonality = true;
  SystemCallArchitectures = "native";
  RestrictAddressFamilies = [ "AF_UNIX" "AF_INET" "AF_INET6" "AF_NETLINK" ];
};
```

### 6. Fail closed at evaluation, not at runtime

Add module `assertions` for every shape that would silently break the trust contract: missing user, root user, `%`-placeholders in system-mode paths, relative paths, intent/status escaping the managed runtime directory.

```nix
assertions = [
  { assertion = !isSystemMode || (cfg.user != null && cfg.user != "");
    message = ''serviceMode = "system" requires services.korri.server.user ...''; }
  { assertion = !isSystemMode || cfg.user != "root";
    message = ''user = "root" is not supported when serviceMode = "system" ...''; }
  { assertion = !isSystemMode || !(hasPlaceholder runtimeDir);
    message = ''runtimeDir = "${runtimeDir}" uses a systemd user specifier such as %t or %h,
      which resolves against the system manager in system mode. Use an absolute path
      like /run/korri-game-stream.''; }
  { assertion = !cfg.streamHost.enable
      || isUserSpecifierPath intentPath
      || lib.hasPrefix "${runtimeDir}/" intentPath;
    message = ''intentPath = "${intentPath}" must live under runtimeDir = "${runtimeDir}"
      so the tmpfiles-managed private runtime directory protects intent ownership.''; }
  # ... matching assertions for statusPath, absolute-path checks, etc.
];
```

### 7. Warn on the migration footguns

LAN exposure and dual-binding deserve `warnings`, not assertions, because they may be intentional in narrow setups:

```nix
warnings =
  lib.optional
    (isSystemMode && cfg.openFirewall && !isLoopbackHost && cfg.firewallInterfaces == [ ])
    ''services.korri.server is exposing "${cfg.host}" on the global firewall in system mode.
      Set services.korri.server.firewallInterfaces to a trusted interface (e.g. [ "tailscale0" ]).''
  ++ lib.optional
    ((config.services.korri.headlessSource.enable or false)
     && (config.services.korri.headlessSource.port or null) == cfg.port)
    ''services.korri.server and services.korri.headlessSource are both enabled on port
      ${toString cfg.port}. Disable one to avoid binding the same port.'';
```

### 8. Push the chosen runtime dir into the session-scoped runner

The runner is launched by Sunshine, which is itself a user service, so the runner can't read the server's `RuntimeDirectory` from systemd metadata. Pass it explicitly through env, with the wrapper preferring `KORRI_GAME_STREAM_RUNTIME_DIR` and only falling back to `$XDG_RUNTIME_DIR/korri-game-stream` when nothing was injected:

```nix
# korri-server.nix wires the gameStream module from the same derived paths:
services.korri.gameStream = mkIf cfg.streamHost.enable {
  enable = true;
  runtimeDir = runtimeDir;
  intentPath = intentPath;
  statusPath = statusPath;
};

# korri-game-stream.nix wrapper exports the path so the runner converges:
: "''${KORRI_GAME_STREAM_RUNTIME_DIR:=${runtimeDirExpression}}"
export KORRI_GAME_STREAM_RUNTIME_DIR
export KORRI_GAME_STREAM_INTENT_PATH=${intentPathExpression}
export KORRI_GAME_STREAM_STATUS_PATH=${statusPathExpression}
```

This is the seam that makes the dual lifecycle safe: one shared private directory, one shared UID, one fail-closed launch-intent file, two unit scopes.

## Why This Matters

- **The launch-intent trust contract depends on shared ownership.** The runner refuses untrusted intents — private parent, owner UID matches runner UID, mode `0600`. If the server runs as `root` (system mode default) and the runner runs as the session user, every intent is untrusted. Requiring `cfg.user` and rejecting `"root"` is the only way to make the system unit safe to share a directory with the session runner.
- **Boot-scoped availability is the whole product.** A headless stream host that needs an interactive login before clients can browse its library is not headless. `multi-user.target` is the right scope, not `default.target` under a user manager.
- **Runtime files outliving the process is non-negotiable.** A pending intent represents a client that has already pressed "play". Losing it on a server restart silently breaks the user-visible flow. Tmpfiles plus `RuntimeDirectoryPreserve = "yes"` decouples the file's lifetime from the unit's.
- **Silent `%h` / `%t` resolution corrupts security boundaries.** A path that "works" because `%h` now points at `/root` is exactly the kind of bug that ships and survives reviews. Pushing assertions to evaluation time replaces a runtime "where did my intent go?" question with a deterministic Nix error pointing at the option that's wrong.
- **One control plane, one port.** mDNS deduplication and TCP bind conflicts are noisy and order-dependent. The warning on `headlessSource.enable` + same port catches the migration in evaluation, not in `journalctl`.

## When to Apply

Apply this pattern when building a NixOS module where:

- The control plane should be **always-on, boot-scoped, headless**, but a **session-scoped helper** (Sunshine, a Wayland compositor, a desktop agent) consumes the same private runtime files.
- Downstream hosts should **opt into system mode** without repeating `/run/<name>`, user, group, or data-root boilerplate.
- A **trust contract over filesystem ownership** (UID match, `0700` parent, `0600` payload) must hold across both lifecycles.
- You want **module evaluation, not boot logs**, to be the place that rejects unsafe combinations.
- You expect a **migration window** where existing user-service deployments must keep working unchanged while new hosts opt into the system unit.

Do not apply this pattern when the helper has no shared trust contract with the control plane (then either side can pick the scope it prefers), when the service genuinely must run as `root` (then dropping privileges or using a `DynamicUser` is a different design), or when there is no session-scoped consumer at all (then a plain system service with `RuntimeDirectory` is enough — no need for the dual-mode option).

## Examples

Full implementations are in the repo; the patterns to lift are above. Key files:

- `nix/modules/korri-server.nix` — the `serviceMode` option, mode-derived path defaults, assertions, warnings, dual `systemd.services` / `systemd.user.services` emission, tmpfiles entry, and hardening block.
- `nix/modules/korri-game-stream.nix` — the wrapper that bridges system-mode absolute paths and user-mode `%t` paths into a single env contract (`KORRI_GAME_STREAM_RUNTIME_DIR`, `KORRI_GAME_STREAM_INTENT_PATH`, `KORRI_GAME_STREAM_STATUS_PATH`) for the Sunshine-launched runner.
- `tools/testing/nix/korri-server-module-eval.test.ts` — Bun tests that drive real `nix eval` of the module against fixture overrides and assert on emitted unit shape, env, tmpfiles entries, assertion messages, and warnings. This is the verification posture: TypeScript tests alone cannot prove systemd unit shape; evaluate the module and inspect the result.
- `../../../work/.archive/01KS1AX71AS00C6ESAPRYHBKG3-refactor-korri-server-system-service/plan.md` — the plan that frames the refactor, including the decision matrix, scope boundaries, and the rejection of "absorb Sunshine into the server" as a tempting-but-wrong shortcut.

### Minimal host config that consumes the pattern

```nix
# In a stream-host's NixOS config:
services.korri.server = {
  enable = true;
  serviceMode = "system";
  user = "simonwjackson";
  group = "users";
  streamHost.enable = true;
  # No path boilerplate: /run/korri-game-stream/{next-launch,status}.json
  # are derived. library.root is derived from the user's declared home.
};
```

Everything else — the system unit, the tmpfiles entry, the `RuntimeDirectory`, the hardening, the Sunshine app wiring that points at the same absolute paths — falls out of the module.

## Related

- [../../../work/.archive/01KS1AX71AS00C6ESAPRYHBKG3-refactor-korri-server-system-service/plan.md](../../../../work/.archive/01KS1AX71AS00C6ESAPRYHBKG3-refactor-korri-server-system-service/plan.md) — the originating plan.
- [../../../work/.archive/01KS1AX7198H2674KGB9QM63JR-refactor-korri-server-control-plane/plan.md](../../../../work/.archive/01KS1AX7198H2674KGB9QM63JR-refactor-korri-server-control-plane/plan.md) — the prior control-plane refactor that made the server the always-on RPC surface.
- [docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md](../workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md) — the runner-side trust contract this pattern preserves.
- [docs/solutions/integration-issues/one-command-odin-electrobun-deploy-needs-device-nix-and-session-env-2026-05-06.md](../integration-issues/one-command-odin-electrobun-deploy-needs-device-nix-and-session-env-2026-05-06.md) — why systemd contexts must not inherit interactive session env implicitly.
- [docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md](../integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md) — identifying the real systemd owner before changing live services, relevant during the user-to-system migration.
- [docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md](../best-practices/prefer-real-implementations-over-mocks-2026-05-02.md) — justification for the real-`nix eval` test posture used in `korri-server-module-eval.test.ts`.
