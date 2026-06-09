# Repository Research Summary — Korri Rootless Appliance Runtime Refactor

> Scope: `technology, architecture, patterns`
> Date: 2026-06-08

---

## Technology & Infrastructure

### Languages and Major Frameworks

| Layer | Technology | Notes |
|---|---|---|
| Runtime language | TypeScript (strict mode, 75% of LOC) + TSX (10%) | Bun runtime for server/device binaries |
| UI framework | React 18 + TanStack Router + Radix UI | Portal app |
| Effect runtime | `effect` v4 + `@effect/atom-react` + `@effect/platform-bun` | Unified service/layer/schema model |
| HTTP server | Hono + `@hono/node-server` + Bun.serve | Both used (korri-server uses node-server; inputd/sessiond use Bun.serve) |
| Styling | Tailwind CSS v4 + `tw-animate-css` | Container queries preferred |
| Build | Bun + Vite + `tsc-alias` | `bun build --target=bun` for server bundles |
| Formatter/linter | Biome (2-space indent, double quotes) | `just format` / `just lint` |
| Nix | Nix flakes + direnv | Reproducible toolchain, appliance images |
| Testing | Bun test (unit), Playwright (E2E/component), Cucumber/BDD | `just test-unit`, `just test-e2e` |
| Codebase intelligence | Fallow | Dead code, boundary drift, complexity |

### Deployment Model

Multi-appliance NixOS images composed from a common module set:

| Image profile | Description |
|---|---|
| **kiosk** | Sway + Electrobun GUI + sessiond foreground lifecycle |
| **headless / source-machine** | Sway substrate only + Sunshine streaming host |
| **live-usb** | Kiosk runtime with greetd auto-login + persistence layer |
| **desktop-lab** | Development-only desktop setup |

All images are built from `product/systems/nixos/images/common.nix` (`mkKioskSystem`, `mkHeadlessSystem`, `mkSourceMachineSystem`). ROCKNIX guest images additionally use `product/systems/rocknix/rootfs.nix`.

### API Styles

- **LAN HTTP (mDNS federation)**: `korri-server` (to-be-renamed `korrid`) exposes a Hono HTTP API on port 3001; discovers peers via Avahi/mDNS.
- **Loopback HTTP with bearer token**: `korri-sessiond` listens on `127.0.0.1:3003` and authenticates via `x-korri-sessiond-token` header.
- **WebSocket**: `korri-inputd` exposes a loopback WebSocket (port 3002) for the renderer's native input bridge.
- **Effect RPC**: TanStack Router + Hono app uses Effect RPC for portal API surface.
- **SSE**: `korri-sessiond` emits Server-Sent Events on `/managed-launch/events` for lifecycle streaming.

### Data Stores and Async Patterns

- No relational DB in appliance path; ProseQL YAML files (`library.yaml`, `00-korri-platform-defaults.yaml`) are the library source of truth.
- ROCKNIX content source reads game metadata from the ROCKNIX ROM path.
- File-system sockets/intent files for cross-process game-stream coordination (`next-launch.json`, `status.json`).
- Effect layers + atoms for reactive UI state; no hand-rolled query stores.

### Module Organization

```
product/
  apps/        # portal (web UI), cli, desktop (Electrobun), storybook
  platform/    # shared runtime capabilities — @platform/* alias
  services/
    device/    # TypeScript service binaries: sessiond, inputd, korri-server, game-stream-*
    server/    # HTTP server bundle (korri-api)
  systems/
    nixos/     # NixOS modules, images, flake
    rocknix/   # ROCKNIX rootfs packaging
  themes/      # evier, plain-demo, shift
  vendor/      # vendored game/tool forks
tools/         # generators, testing infra, nix checks, importers
```

Path aliases:
- `@product/*` → `product/*`
- `@platform/*` → `product/platform/*`

---

## Architecture & Structure

### Current Service Topology (pre-refactor)

All long-lived Korri services run as **system-scope** systemd units today. The following describes each service, its current identity, and its IPC surface:

#### `korri-compositor.service` (system)
- **File**: `product/systems/nixos/modules/korri-compositor.nix`
- **Current user**: `korri-compositor` (generic kiosk/source-machine), `root` (SM8550/RK3566 ROCKNIX guests)
- **Home on SM8550**: `/storage` — hard-coded via `home = lib.mkDefault "/storage"` in `platforms/rocknix-sm8550.nix:146`
- **Runtime dir**: `/run/korri-compositor` (generic) or `/run/user/0` (SM8550/RK3566)
- **D-Bus**: `private` (dbus-run-session) on generic images; `existing` at `unix:path=/run/user/0/bus` on ROCKNIX guests
- **Manages**: Sway session; since the renderer-ownership cut, does NOT spawn Electrobun directly — that is sessiond's job
- **Kiosk enablement**: `services.korri.compositor.kiosk.enable = true` defaults `services.korri.input.inputd.enable = true` and `services.korri.client.enable = true`

#### `korri-server.service` (system or user unit)
- **File**: `product/systems/nixos/modules/korri-server.nix`, `product/services/device/korri-server.ts`
- **Built by**: `product/services/server/package.nix` (pname=`korri-server`, binary=`korri-server`)
- **Current user**: `korri-server` in system mode; runs in the login user's scope in user mode
- **Home**: `/var/lib/korri-server` (system mode, via `headless.nix:32`)
- **Library root**: `%h/.local/share/korri/library` (user mode) or derived from configured user home (system mode)
- **IPC surface**: LAN HTTP on configurable host:port (default `0.0.0.0:3001` for headless, `127.0.0.1:3001` for desktop); mDNS via Avahi
- **Sessiond delegation**: delegates managed launches to sessiond via `KORRI_SESSIOND_URL` + `KORRI_SESSIOND_TOKEN_FILE` (HTTP token auth)
- **Key env vars**: `HOST`, `PORT`, `KORRI_SERVER_ID`, `KORRI_STREAM_ADVERTISE_*`, `KORRI_LIBRARY_ROOT`, `KORRI_LAUNCH_ARTIFACTS_DIR`, `KORRI_GAME_STREAM_RUNTIME_DIR`, `KORRI_SESSIOND_URL`, `KORRI_SESSIOND_TOKEN_FILE`

#### `korri-sessiond.service` (system, runs as root by default)
- **File**: `product/systems/nixos/modules/korri-sessiond.nix`, `product/services/device/sessiond.ts`
- **Current user**: root (system service, no `User=` in service config by default — relies on `ProtectSystem=strict` + `StateDirectory`)
- **Token management**: `korri-sessiond-token.service` generates `/run/korri-sessiond/token` (root oneshot, optional `sharedGroup` for cross-user reads)
- **IPC surface**: loopback HTTP `127.0.0.1:3003` with bearer token (`x-korri-sessiond-token`)
- **Roles**: `"kiosk"` (spawns Electrobun renderer, manages gamescope foreground) or `"source-machine"` (idle-blank restore, no renderer)
- **Key env vars**: `KORRI_SESSIOND_ROLE`, `KORRI_SESSIOND_PORT`, `KORRI_SESSIOND_TOKEN_FILE`, `KORRI_SESSIOND_TOKEN`, `KORRI_LAUNCH_ARTIFACTS_DIR`

#### `korri-inputd.service` (system)
- **File**: `product/systems/nixos/modules/korri-input.nix`, `product/services/device/inputd.ts`
- **Current user**: root (no `User=` in systemd unit)
- **Access**: reads `/dev/input/event*` via procfs + evdev; talks `libc.so.6` ioctl for axis info
- **IPC surface**: loopback WebSocket `0.0.0.0:3002` (renderer input bridge); plus internal shortcut dispatch (shell-out to brightnessctl, systemctl, etc.)
- **Dependency**: ordered after InputPlumber via `services.korri.input.provider.services`

#### `korri-sessiond-token.service` (root oneshot)
- Generates `/run/korri-sessiond/token` as 32-byte hex random
- Optionally chowns to `root:<sharedGroup>` at mode `0640` for cross-user token reads
- Runs before `korri-sessiond.service` and `korri-server.service`

### Path Inventory — What Needs to Change

| Path (current) | Where used | Target path (clean-break) |
|---|---|---|
| `/storage` | SM8550/RK3566 compositor home | `/home/korri` |
| `/run/user/0` | SM8550/RK3566 compositor `runtimeDir` / D-Bus | `$XDG_RUNTIME_DIR/korri` or `/run/user/<uid>` via greetd login |
| `unix:path=/run/user/0/bus` | SM8550/RK3566 session bus address | auto-derived from `$DBUS_SESSION_BUS_ADDRESS` in user session |
| `/var/lib/korri-server` | `headless.nix` user home for korri-server system user | `/var/lib/korri` |
| `/var/lib/korri-compositor` | Compositor user home on generic images | `/home/korri` (merged) |
| `/run/korri-sessiond` | Token dir, sessiond state | `$XDG_RUNTIME_DIR/korri/` |
| `/run/korri-launch-artifacts` | Shared launch-artifact dir | `$XDG_RUNTIME_DIR/korri/launch-artifacts` |
| `/run/korri-game-stream` | Streaming runtime dir (system mode) | `$XDG_RUNTIME_DIR/korri/game-stream` |
| `%h/.local/share/korri/library` | korri-server library root (user mode default) | `/var/lib/korri/content/library` or via `services.korri.runtime` |

### Key Architectural Decisions (Recorded)

1. **Sessiond→daemon handshake split** (`korri-sessiond-token.service` vs main daemon): Deliberate — the token setup runs as a root oneshot before both sessiond and korri-server start, giving group-readable token access without baking group-file ACLs into the long-lived service unit.

2. **Renderer-ownership moved to sessiond** (not compositor): `korri-compositor.service` does NOT exec Electrobun. `enterIdle()` in `sessiond.ts` spawns the renderer — this keeps the compositor restart-independent of renderer failures. Documented in code comments at `korri-compositor.nix:NOTE`.

3. **No deploy-role aggregate option**: The module system uses capability toggles (`compositor.kiosk.enable`, `server.streaming.enable`, `sessiond.enable`) instead of a single `role = "kiosk"` switch. Documented in `source-machine.nix`.

4. **greetd already used for live-usb**: `live-usb-runtime.nix` already sets up `services.greetd` with auto-login as `compositorCfg.user` — this is the pattern to replicate for all appliance profiles.

5. **No `/storage` in generic contracts**: The `/storage` references are explicitly in SM8550/RK3566 platform adapters (`platforms/rocknix-sm8550.nix`, `platforms/rocknix-rk3566.nix`), not in shared modules. The clean-break target removes them from platform adapters by migrating to `/home/korri`.

### Token IPC — Current vs Target

**Current** (system mode):
```
root oneshot → generates /run/korri-sessiond/token
korri-server reads token → HTTP POST /managed-launch with x-korri-sessiond-token header
korri-sessiond validates header
```

**Target** (clean-break, task-088):
```
korrid (korri user service) → connects via Unix socket $XDG_RUNTIME_DIR/korri/sessiond.sock
korri-sessiond (korri user service) → listens on that socket
No bearer token needed (same-user, filesystem-scoped trust)
```

### Module Composition Pattern

NixOS modules follow a factory pattern: `{ korri }: { config, lib, pkgs, ... }:`. Deduplication uses `_file` + `key = ./module-file.nix` to prevent double-evaluation when multiple composite modules import the same file.

The aggregate `korri` module (`nixosModules.korri`) transitively imports:
```
korri
  korri-compositor  →  korri-client, korri-input, korri-x86-compositor-overlay
  korri-input       (deduplicated via key)
  korri-server      →  korri-compositor, korri-input
```

`korri-sessiond` is NOT in the aggregate; it is included explicitly by `mkKioskModules` and `mkSourceMachineModules` in `common.nix`.

---

## Implementation Patterns

### TypeScript Service Pattern

Each service binary follows the same factory shape:

```typescript
// Options interface with injected dependencies (all optional, defaulted at runtime)
export interface KorriXxxOptions {
  readonly port?: number
  readonly hostname?: string
  readonly logger?: KorriXxxLogger
  // ...real implementation deps, all injectable
}

// Handle interface returned by start*
export interface KorriXxxHandle {
  readonly port: number
  stop: () => Promise<void>
}

// Core factory (no side effects, used in tests)
export function createKorriXxxCore(options: ...): KorriXxxCore { ... }

// Start factory (binds port, used in production)
export async function startKorriXxx(options: KorriXxxOptions): Promise<KorriXxxHandle> { ... }

// main() guarded by import.meta.main / require.main === module
async function main() {
  const handle = await startKorriXxx({ ... })
  process.on("SIGTERM", ...)
  process.on("SIGINT", ...)
}
if (import.meta.main) { main().catch(...) }
```

Production implementations are derived from env vars in `main()` (e.g. `KORRI_SESSIOND_TOKEN`, `KORRI_SESSIOND_PORT`). There are no `Mock*`/`Stub*`/`Fake*` classes; test doubles are created via constructor options with behavior knobs.

### Env-Driven Wiring Pattern

Config is read from `process.env` at startup, not injected from Nix at build time:
```typescript
export function createSessionLauncherFromEnv(env = process.env): Launcher | undefined {
  const url = env.KORRI_SESSIOND_URL
  if (!url) return undefined
  return createSessionLauncher({ url, token: env.KORRI_SESSIOND_TOKEN, tokenFile: env.KORRI_SESSIOND_TOKEN_FILE })
}
```

Nix unit `environment` blocks inject these vars; TypeScript reads them. This means any env-var rename requires coordinated changes in:
1. TypeScript source (read site)
2. NixOS module (inject site, `environment` attrset)
3. Nix module checks (assertion site, `korri-server-module-check.nix`, `korri-sessiond-module-check.nix`)

### XDG Path Helpers

`product/platform/config/xdg-paths.ts` provides typed helpers for XDG paths:
```typescript
korriDataPath(env, ...segments)    // $XDG_DATA_HOME/korri/...
korriStatePath(env, ...segments)   // $XDG_STATE_HOME/korri/...
korriCachePath(env, ...segments)   // $XDG_CACHE_HOME/korri/...
korriConfigPath(env, ...segments)  // $XDG_CONFIG_HOME/korri/...
```

All accept an env map as the first argument, making them testable without process.env mutation. XDG paths fall back to `$HOME/.<xdg-name>` when the XDG var is unset.

### Nix Module Check Pattern

Each module has a companion pure-eval check in `tools/testing/nix/`:
```nix
# korri-<thing>-module-check.nix
{ pkgs, korri<Thing>Module }:
let
  evaluateWith = overrides: (evalConfig { modules = [korri<Thing>Module baseModule overrides]; }).config;
  checks = [
    (check "description" boolExpr)
    ...
  ];
  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [] then throw "..." else pkgs.runCommand "..." { } "touch $out"
```

Checks cover: option defaults, env var propagation, systemd unit attributes, assertion messages, and cross-tree consistency. These run in `just test-nix` / `nix build .#checks.<system>.<check-name>`.

### Nix Module Option Pattern

Options follow a consistent naming hierarchy:
```nix
options.services.korri.<subsystem> = {
  enable = lib.mkEnableOption "...";
  package = mkOption { type = types.package; default = ...; };
  <setting> = mkOption { type = ...; default = ...; description = ''...''; };
};
```

Composite modules compose sibling options via `lib.attrByPath` with a default to avoid "option not declared" errors when modules are evaluated without peers. Cross-tree assertions reference peer options by path, gated on the asserting module's own `cfg.enable`.

### systemd Hardening Pattern (system services)

All Korri system services follow this baseline:
```nix
serviceConfig = {
  NoNewPrivileges = true;
  PrivateTmp = true;
  ProtectSystem = "strict";
  ProtectHome = true;               # or "read-only"
  ReadWritePaths = [ <specific> ];  # holes in ProtectSystem
  RestrictSUIDSGID = true;
  RestrictRealtime = true;
  LockPersonality = true;
  MemoryDenyWriteExecute = false;   # bun JIT requires false
  SystemCallArchitectures = "native";
  RestrictAddressFamilies = [ "AF_UNIX" "AF_INET" "AF_INET6" "AF_NETLINK" ];
};
```

For user services (the clean-break target), most of these are still appropriate. `ProtectHome = true` must be set to `false` on the kiosk role because sessiond attaches to the compositor's Wayland socket under the runtime dir (see kiosk.nix `systemd.services.korri-sessiond.serviceConfig.ProtectHome = lib.mkForce false`).

### Conventional Commits and Change Scope

Commits follow `<type>(<scope>): <subject>` with:
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`, `perf`, `style`
- Scopes: kebab-case, typically service/module name (`retroarch`, `sessiond`, `backlog`)

### Backlogs and Work Items

The backlog in `backlog/` uses YAML frontmatter with `id`, `title`, `status`, `priority`, `labels`, `created`, `source`. The eight new tasks (task-083 through task-090) are already captured there. The `backlog/.next-id` tracks the next task ID counter.

---

## Cross-Cutting Refactor Findings

### What Each Backlog Task Touches

#### task-085: `services.korri.runtime` (identity/paths)
**New module needed** in `product/systems/nixos/modules/korri-runtime.nix`:
- Options: `services.korri.runtime.{user, group, home, stateDir, runtimeDir, socketDir, gamesRoot}`
- Default: `user="korri"`, `group="korri"`, `home="/home/korri"`, `stateDir="/var/lib/korri"`, `gamesRoot="/var/lib/korri/content/games"`, `socketDir="$XDG_RUNTIME_DIR/korri"`
- Must be imported before `korri-compositor`, `korri-server`/`korrid`, `korri-sessiond` modules
- Replace hard-coded `/storage`, `/run/user/0`, `/var/lib/korri-server` defaults in platform adapters

**Breaking changes in platform adapters**:
- `platforms/rocknix-sm8550.nix`: remove `home = lib.mkDefault "/storage"`, `runtimeDir = lib.mkDefault "/run/user/0"`, session bus at `/run/user/0/bus`
- `platforms/rocknix-rk3566.nix`: same pattern
- `images/headless.nix`: `users.users.korri-server.home` → fold into `services.korri.runtime`

**TypeScript impact**:
- `xdg-paths.ts` already handles XDG fallback correctly — no change needed there
- Tests in `sessiond-electrobun.test.ts` hardcode `/storage/.guest/korri/sessiond.token` — those need updating

#### task-086: greetd + user services
**Pattern to follow**: `live-usb-runtime.nix:315-330` — `services.greetd.enable = true` with `initial_session = { command = greetdSession; user = compositorCfg.user; }` and `systemd.services.greetd.after = loginDependencies`.

**For clean-break**:
- `services.greetd.enable = lib.mkDefault true` in headless/kiosk base
- greetd auto-login as `korri` user
- All Korri-owned long-lived units become `systemd.user.services` (not `systemd.services`)
- `korri-session.target` as the user-scope target (`WantedBy = korri-session.target`)
- Root system units: only substrate (seatd, udevd), greetd itself, and the new `korri-setup.service` oneshot

**Module changes**:
- `korri-compositor.nix`: change `systemd.services."korri-compositor"` → `systemd.user.services."korri-compositor"` (korri user)
- `korri-sessiond.nix`: change `systemd.services.korri-sessiond` → `systemd.user.services.korri-sessiond`
- `korri-input.nix`: change `systemd.services.korri-inputd` → `systemd.user.services.korri-inputd`
- `korri-server.nix`/`korrid`: simplify — user mode only (no `serviceMode = "system"` option needed for clean-break)
- `korri-sessiond-token.service` disappears (replaced by Unix socket trust)

#### task-087: rename `korri-server` → `korrid`

**Files requiring binary/package rename**:
- `product/services/server/package.nix`: `pname = "korri-server"` → `"korrid"`, binary rename in `installPhase`
- `product/services/device/korri-server.ts`: rename file to `korrid.ts`, export `createKorridCore`, `startKorrid`
- `product/systems/nixos/modules/korri-server.nix`: rename file to `korri-daemon.nix`, all `cfg = config.services.korri.server` → `config.services.korri.daemon`
- `product/systems/nixos/flake/modules.nix`: `korri-server` → `korri-daemon`, `nixosModules.korri-server`
- `product/systems/nixos/flake/packages.nix`: `korri-server = korriServer` → `korrid = korriDaemon`
- `product/systems/nixos/flake/apps.nix`: update app attribute and binary path

**Env var renames** (per task-087: no `KORRID_*` prefix, use descriptive names):
- `KORRI_SERVER_ID` → `KORRI_DAEMON_ID`
- `KORRI_SERVER_NAME` → `KORRI_DAEMON_NAME`
- Others TBD per the "rename runtime env vars" acceptance criteria

**Nix check rename**:
- `tools/testing/nix/korri-server-module-check.nix` → `korri-daemon-module-check.nix`
- All `korri-server-module` check references in `checks.nix`

**No backward-compat aliases**: the acceptance criteria explicitly says no compatibility aliases.

#### task-088: Unix socket IPC (korrid ↔ korri-sessiond)

**TypeScript changes**:
- `product/platform/library/session-launcher.ts`: add `createSessionLauncherFromSocket(socketPath)` alongside existing HTTP path; `createSessionLauncherFromEnv` should prefer `KORRI_SESSIOND_SOCKET` when set
- `product/services/device/sessiond.ts`: add Unix socket server alongside (or replacing) Bun.serve HTTP; remove `TOKEN_HEADER` auth gate for same-user socket connections
- New env var: `KORRI_SESSIOND_SOCKET` = `$XDG_RUNTIME_DIR/korri/sessiond.sock`

**Nix changes**:
- `korri-sessiond.nix`: remove `korri-sessiond-token.service` entirely; add socket path option; set `KORRI_SESSIOND_SOCKET` in unit env
- `korri-daemon.nix` (renamed from korri-server.nix): replace `sessiond.{url,tokenFile}` with `sessiond.socketPath`
- Both-or-neither assertion becomes single `sessiond.socketPath` option check

**Test changes**:
- `korri-sessiond-module-check.nix`: remove all token-related assertions; add socket path assertions
- `session-launcher.test.ts`: add socket path test cases

#### task-089: `korri-setup.service` (root oneshot)

**New NixOS module** `product/systems/nixos/modules/korri-setup.nix`:
```nix
systemd.services.korri-setup = {
  description = "Korri appliance setup (privileged bootstrap)";
  wantedBy = [ "multi-user.target" ];
  before = [ "greetd.service" ];
  serviceConfig = {
    Type = "oneshot";
    ExecStart = korriSetupScript;
    RemainAfterExit = true;
    # hardened
    PrivateTmp = true; ProtectSystem = "strict";
    ReadWritePaths = [ "/home/korri" "/var/lib/korri" "/run" ];
    ...
  };
};
```

Setup script creates: `/home/korri`, `/var/lib/korri`, `/var/lib/korri/content/games`, device node permissions for inputd group membership.

**Replaces**: `korri-sessiond-token.service`, `tmpfiles.rules` for korri paths, scattered `ExecStartPre = install -d ...` patterns in current service configs.

#### task-090: inputd as non-root user service

**Current problem**: `korri-inputd` reads `/dev/input/event*` via `openSync` + ioctl and opens `/dev/input/event*` via `Bun.spawn(["cat", path])`. Currently runs as root with no `User=` in the systemd unit.

**Target**: `korri` user in the `input` group (udev uaccess grants group `input` access on `/dev/input/event*`).

**InputPlumber `uinput` rule already exists** in `korri-input.nix`:
```nix
services.udev.extraRules = ''
  KERNEL=="uinput", GROUP="input", MODE="0660", OPTIONS+="static_node=uinput"
  KERNEL=="uinput", SUBSYSTEM=="misc", OPTIONS+="static_node=uinput", TAG+="uaccess"
'';
```

The `TAG+="uaccess"` rule grants the active session user access. Since `korri` will be the greetd auto-login user (and thus the session owner), `uaccess` covers `/dev/uinput` automatically.

For `/dev/input/event*`: add `korri` to the `input` group in `korri-setup.service` or `korri-runtime.nix`. Standard NixOS udev rules give group `input` mode `660` on input event nodes.

**Shortcut dispatch helpers** (brightnessctl, systemctl, pulseaudio): these already work as non-root on typical NixOS with `extraGroups = ["video" "audio"]` and polkit. Add groups to the `korri` user in `services.korri.runtime`.

---

## Implementation Recommendations

### Sequencing for Clean-Break

The backlog tasks have implicit ordering dependencies:

```
task-085 (services.korri.runtime identity module)
  ↓
task-089 (korri-setup.service creates dirs/permissions)
  ↓
task-086 (greetd + user services — needs korri identity + dirs to exist)
  ↓
task-087 (rename korri-server → korrid — module refactor)
task-088 (Unix socket IPC — needs same-user context from task-086)
task-090 (inputd non-root — needs korri group + greetd session from task-086)
  ↓
task-083 (persistence failure policy — needs clean path contract from task-085)
task-084 (library scanning — needs /var/lib/korri/content/games from task-085)
```

### Nix Check Strategy

For each module change:
1. **Start with the module check**: update `tools/testing/nix/korri-*-module-check.nix` first. The checks are pure-eval and fast.
2. **Add a generic appliance config check**: `tools/testing/nix/korri-source-machine-image-check.nix` and a new kiosk appliance check should assert `/home/korri`, `/var/lib/korri`, and no `/storage` in Korri runtime env/options.
3. **SM8550/RK3566 checks last**: `korri-rocknix-sm8550-config-check.nix` will need updates once the platform adapters are migrated off `/storage`.

### TypeScript / Nix Boundary

The key insight for this refactor: **TypeScript reads env vars; Nix injects them**. Any path or socket rename requires changes in both layers, and the Nix module checks verify the Nix side. For the TypeScript side, `session-launcher.test.ts` and `sessiond.test.ts` are the unit test coverage points.

The `KORRI_SESSIOND_URL` / `KORRI_SESSIOND_TOKEN_FILE` pattern (both-or-neither) has a well-tested precedent in `korri-server-module-check.nix`. The new `KORRI_SESSIOND_SOCKET` option should follow the same test shape.

### greetd Session vs system Service

The live-usb greetd pattern uses `initial_session` and `default_session` both pointing to the same script. For appliance profiles, the `initial_session.user = compositorCfg.user` becomes `initial_session.user = config.services.korri.runtime.user` (i.e., `"korri"`).

The greetd session script should:
1. Set `XDG_RUNTIME_DIR` (systemd-logind sets it when `loginctl` creates the session; greetd should trigger this)
2. Start `systemd --user` which brings up `korri-session.target`
3. OR directly exec the session (Sway) and rely on lingering for user units

The live-usb pattern exports env vars manually and execs `dbus-run-session -- sway`. For the clean-break, the preferred path is greetd starting a proper PAM session that systemd-logind sets up (so `XDG_RUNTIME_DIR` is `/run/user/<uid>` and the user systemd instance runs under the session).

### SM8550 / ROCKNIX Substrate Constraint

The SM8550 platform currently depends on `main-space-session-dbus.service` from `nix-on-rocks` as the `existing` session bus. After the clean-break migration, the Korri compositor should use the `private` D-Bus session bus mode (dbus-run-session), which the greetd login session makes available. This removes the dependency on the nix-on-rocks substrate's bus service for Korri's compositor startup ordering.

The `/storage` paths in SM8550 map to the ROCKNIX guest persistent overlay. After migration to `/home/korri`, the persistent overlay must be mounted at `/home/korri` instead. This is an nix-on-rocks guest-prep / persistence scope coordination item (related to task-083 persistence failure policy).

### Areas Needing Clarification Before Implementation

1. **ROCKNIX persistence mount point**: Currently `/storage` is the ROCKNIX overlay mount. Migrating to `/home/korri` requires either re-targeting the overlay or symlinking. This is owned by the task-083 persistence policy decision.

2. **`systemd --user` on ROCKNIX**: The nix-on-rocks guest environment may not automatically start `user@<uid>.service`. Verify greetd triggers `systemd --user` for the korri user via PAM `pam_systemd.so`. The `users.users.korri.linger = true` (used in SM8550 for root) may be needed for `korri` as well.

3. **Library root path in clean-break**: The current default `%h/.local/share/korri/library` (user mode) or `/var/lib/korri-server/.local/share/korri/library` (system mode) should become `/var/lib/korri/content/library` or `$XDG_DATA_HOME/korri/library` under `/home/korri`. The XDG helper `korriDataPath(env, "library")` already handles this if `HOME=/home/korri` and no override.

4. **Inputd WebSocket bind address**: Currently `DEFAULT_HOSTNAME = "0.0.0.0"` (bound to all interfaces in `inputd.ts`). After the rootless refactor, this should default to `127.0.0.1` unless a renderer on a different host needs it. The task-090 acceptance criteria says "keep renderer-facing inputd loopback WebSocket unless a native bridge replaces it; document that it is local-only."

5. **`korri-sessiond` port in Unix socket world**: After task-088, the port option (`services.korri.sessiond.port = 3003`) becomes vestigial for the korrid→sessiond IPC path. It may still be needed for `korri-sessiond-smoke.ts` / debugging or the ExecStartPost `/control/start` handshake. The handshake script in `korri-sessiond.nix` will need to target the Unix socket path instead.
