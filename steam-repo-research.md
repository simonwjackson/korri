# Steam Plugin Repository Research

> Scope: technology, architecture, patterns
> Focus: codifying Bandai Steam discovery — mutable client ownership, Proton runtime/VDF declarations, stopping publicbeta default, preventing pre-start pressure-vessel mutations that caused the BVerifyInstalledFiles relaunch loop.

---

## Technology & Infrastructure

| Dimension | Finding |
|---|---|
| Languages | TypeScript 69.9 %, TSX 13.2 %, Nix 9.9 %, CSS 4.3 %, Shell/BASH 1.5 % |
| Frontend runtime | React + Effect v4 target (`@effect/atom-react`, `effect`), TanStack Router, Tailwind CSS, Vite |
| Backend runtime | Hono + Bun (`@hono/node-server`, `@platform/bun`) |
| Dev tooling | Bun (test, install), Biome (format/lint), Nix flakes + direnv, `just` recipes |
| System config | NixOS (aarch64-linux guest on SM8550/Adreno 740, "Bandai") via `product/systems/nixos/` |
| Architecture | Single-repo, multiple `product/plugins/<name>` vertical slices; shared platform at `product/platform/` |
| Device model | ROCKNIX substrate (nix-on-rocks) hosting a NixOS nspawn guest; Korri product layer owns all kiosk policy |
| GPU / display | Adreno 740, Turnip Vulkan, Gamescope compositor, Sway WM |
| x86 compatibility | FEX-Emu for x86/x86_64 Windows game support under ARM64 Linux Steam |
| Compat layer | Proton CachyOS 11.0 ARM64 (`proton-cachyos-11.0-20260601-slr-arm64`) as primary compat tool |
| Type safety | TypeScript strict mode; Effect Schema for RPC contracts |
| Test runners | `bun test` for TypeScript; Nix derivation checks for Nix/NixOS module invariants; shell smoke scripts for package contracts |

---

## Architecture & Structure

### Plugin vertical-slice layout (`product/plugins/steam/`)

```
product/plugins/steam/
├── index.ts                        ← plugin entry point (re-exports steamPlugin)
├── README.md                       ← plugin identity and scope
├── src/
│   ├── plugin.ts                   ← plugin descriptor, IDs, default policy
│   ├── launch-spec.ts              ← pure: AppID parsing, launch spec rendering
│   ├── materializer.ts             ← Effect: VDF/config writes, compat tool resolution
│   ├── state-materializer.ts       ← VDF parser/renderer, lifecycle, file-system interface
│   ├── steam-gate-seed.ts          ← VDF helpers: EULA seeds, interstitial pre-seeding
│   ├── boundary.test.ts
│   ├── launch-spec.test.ts
│   ├── materializer.test.ts
│   ├── state-materializer.test.ts
│   ├── steam-gate-seed.test.ts
│   ├── plugin.test.ts
│   ├── observability/              ← diagnostics, install-status, lifecycle-api
│   ├── app-control/                ← install-trigger
│   └── session/                   ← lifecycle-hook
├── nix/
│   ├── nixos-module.nix            ← NixOS module: options + systemd services + helper scripts
│   ├── module-check.nix            ← pure-Nix evaluation checks for the module
│   ├── nixos-module.test.ts        ← TypeScript boundary-seam tests (reads .nix as text)
│   ├── composition.nix             ← flake composition (packages, nixosModules)
│   └── overlay.nix
└── packages/steam-korri/
    ├── package.nix                 ← Nix derivation (helpers + aarch64 FHS capsule)
    ├── manifest.nix                ← data-only: versions, URLs, vendoring provenance
    ├── check.nix                   ← Nix + shell: artifact shape + runtime smoke
    ├── README.md                   ← package ownership contract
    ├── resources/                  ← vendored VDF templates (registry.vdf, compatibilitytool.vdf, fex-emu/*)
    ├── scripts/
    │   ├── steam-arm64-bootstrap   ← writes package/beta, symlinks, VDF resources
    │   ├── steam-arm64-seed        ← downloads ARM64 runtime + client zip, links compat tool
    │   ├── steam-guest-run         ← exec Steam from FHS capsule (LD_LIBRARY_PATH, PATH, runtime-prep)
    │   ├── steam-guest-runtime-prep← FEX-wraps pressure-vessel + Proton helpers; --apply / --check / --patch-proton
    │   └── steam-guest-native      ← thin POSIX wrapper
    └── tests/
        ├── steam-package-contract.sh  ← shell assertions for script content and missing-env behavior
        ├── steam-guest-run-smoke.sh
        └── steam-guest-runtime-prep-smoke.sh
```

### Ownership boundary (the central invariant)

| Owner | Owns | Must NOT touch |
|---|---|---|
| `steam-korri` **package** (Nix store) | Scripts, FHS capsule, VDF resource templates | Guest state paths, systemd services, launch policy, session orchestration |
| **NixOS module** | State paths, systemd services, user/group, udev rules, sudo wrapper, launch policy | Valve's client binaries, Steam Runtime, pressure-vessel executables **while Steam is running** |
| **Steam itself** (mutable) | `$STEAM_HOME/steamapps/`, `$STEAM_HOME/steamrtarm64/`, `package/`, pressure-vessel runtime downloads | — |
| **TypeScript / korrid** (`state-materializer.ts`) | `config/config.vdf` (CompatToolMapping), `userdata/*/config/localconfig.vdf` (EULA/interstitial seeds, launch options) | Must stop Steam before writing, must not write while gamescoped broker is warm |

### Systemd service chain (boot-time ordering)

```
multi-user.target
    ├── korri-steam-uinput.service       (prepare /dev/uinput)
    ├── korri-steam-seed.service         (downloads ARM64 client + runtime; writes package/beta, symlinks, compatibilitytool.vdf)
    ├── korri-steam-prepare-fex-rootfs.service  (downloads ArchLinux squashfs, overlays Mesa26/Freedreno)
    └── korri-steam-runtime-prep.service (after seed + fex-rootfs; FEX-wraps PV helpers + Proton)
            ↑ also triggered by:
    korri-steam-runtime-prep.path        (PathChanged on Proton scripts AND PV binaries)

korri-session.target
    └── korri-steam-warm.service         (if keepWarm; waits for Wayland+DBus sockets, then starts gamescope service)

[demand]
    korri-steam-gamescope.service        (gamescope -- korri-steam-guest <default-args>; Restart=on-failure)
    korri-steam.service                  (bare Steam without gamescope; conflicts with gamescope)
```

### TypeScript runtime model

- Plugin descriptor (`src/plugin.ts`): declares storage, launchers, NixOS module path, package path — no imperative logic.
- Launch spec (`src/launch-spec.ts`): pure Effect functions — `parseSteamAppId`, `renderSteamLaunchSpec`. Returns tagged ADTs (`SteamEither`).
- State materializer (`src/state-materializer.ts`): Effect-wrapped VDF parse/render/write + compat-tool validation. Exposes `SteamStateFileSystem` and `SteamStateLock` interfaces so tests can substitute in-memory implementations.
- Materializer (`src/materializer.ts`): top-level integration — resolves policy, resolves storage tokens, calls `materializeSteamDesiredState`, produces `LaunchSpec`.
- Gate seed (`src/steam-gate-seed.ts`): pure VDF helpers for pre-seeding EULA acknowledgements and all Deck configurator interstitials; covered by direct unit tests.

---

## Implementation Patterns

### 1. NixOS module: options → `mkIf cfg.enable` config

The module follows the standard NixOS pattern: all options under `services.korri.steam.*`, all wiring under `config = mkIf cfg.enable { … }`. Assertions encode path/architecture constraints enforced at evaluation time.

**Key options declared today:**

| Option | Type | Default | Notes |
|---|---|---|---|
| `enable` | bool | false | — |
| `package` | package | `callPackage ../packages/steam-korri/package.nix {}` | Must have `rocknixSteamHasRunCapsule = true` |
| `home` | str | `"${runtime.stateRoot}/steam"` | Must be under `runtime.stateRoot` |
| `gamesRoot` | str | `"${runtime.gamesRoot}/steam"` | Must be under `runtime.gamesRoot` |
| `dotDir` | str | `"${runtime.home}/.steam"` | Must be under `runtime.home` |
| `fexRootfs` | str | `"${cfg.home}/fex-rootfs"` | Must be under `cfg.home` |
| `fexConfigDir` | str | `"${runtime.home}/.config/fex-emu"` | Must be under `runtime.home` |
| `defaultArgs` | list of str | (SteamOS compat flags) | Includes `-noverifyfiles`, `-nobootstrapupdate`, etc. |
| `keepWarm` | bool | false | Creates `korri-steam-warm.service` |
| `keepVisibleDuringLaunch` | bool | false | Debugging switch; overridable via `KORRI_STEAM_KEEP_VISIBLE` |
| `gamescopePreferOutput` | null/str | null | `-O <output>` for Gamescope; device-specific |
| `useGamepadUi` | bool | false | Adds `-gamepadui` to Steam args |
| `appAudioSinkName` | str | `""` | PipeWire sink for audio-route repair |

**Gap identified:** There is no `betaChannel` / `steamBeta` option. The seed service hardcodes `STEAM_BETA = "publicbeta"` as an environment variable inline in the service definition (nixos-module.nix:1049). This is the primary source of the channel problem.

### 2. Package helper scripts: dry-run / apply pattern

Every package script (`steam-arm64-bootstrap`, `steam-arm64-seed`, `steam-guest-runtime-prep`) follows the same CLI shape:

```bash
mode=apply
case "${1:-}" in
  ""|--apply) mode=apply ;;
  --check|--dry-run) mode=dry-run ;;  # or --check for runtime-prep
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac
```

- `--dry-run` / `--apply`: safe to call repeatedly; apply is idempotent.
- `--check`: validates preconditions without mutation.
- `--patch-proton`: runtime-prep-only mode that skips pressure-vessel wrapping.
- Scripts must not reference `/storage`, systemd, or gamescope; those belong in the NixOS module.
- Environment variables (`STEAM_HOME`, `STEAM_GAMES_ROOT`, `STEAM_DOT`, `FEX_ROOTFS`) are explicit and required — no ambient defaults.

### 3. VDF parsing/writing: TypeScript owns config.vdf and localconfig.vdf

The `state-materializer.ts` module owns:
- `config/config.vdf` → `InstallConfigStore.Software.Valve.Steam.CompatToolMapping`
- `userdata/*/config/localconfig.vdf` → launch options, EULA seeds, interstitial seeds

Write protocol (`materializeSteamDesiredStatePromise`):
1. Build write set (parse current VDF → apply desired state → diff).
2. If no changes, skip entirely.
3. `lifecycle.shutdown()` + `lifecycle.waitForShutdown()` (15 s deadline).
4. Rebuild write set (re-read after Steam stops to catch concurrent writes).
5. Atomic write each file (`tmpfile → rename`).
6. `lifecycle.start()` + `lifecycle.waitUntilReady()`.

The `SteamStateFileSystem` and `SteamStateLock` interfaces allow in-memory test substitutes. Tests in `state-materializer.test.ts` exercise the full VDF parse→mutate→render cycle without filesystem access.

**Tension with keepWarm:** Stopping the warm gamescoped broker (`lifecycle.shutdown`) before every VDF write is disruptive in steady-state operation. The Bandai discovery says to declare compat-tool mappings before startup rather than on every launch.

### 4. Module checks: two-layer verification model

**Layer 1 — Nix pure evaluation (`nix/module-check.nix`):**
- `evalConfig` with a fake `steam-korri` overlay that satisfies `rocknixSteamHasRunCapsule = true`.
- Evaluates several module fixture configurations (`enabled`, `enabledKeepWarm`, `runtimeOverride`, `invalidPath`, `x86Enabled`, `disabled`).
- Asserts option defaults, service identity (user/group/WorkingDirectory), launch flags, path wiring, udev rules, tmpfiles entries.
- Run from `flake.nix` checks, not from `bun test`.

**Layer 2 — TypeScript boundary-seam tests (`nix/nixos-module.test.ts`):**
- Reads `nixos-module.nix` as a raw string via `Bun.file(...).text()`.
- Uses `expect(moduleSource).toContain(...)` / `.not.toContain(...)` to assert implementation details that cannot be checked from Nix evaluation (e.g., specific shell flag strings, readiness log patterns, idempotency guards).
- Example assertions: `"steam_client_*_linuxarm64.installed"` glob detection, `"Waiting for compat in post-logon"` readiness signal, `"app_removed_since_mark"` guard, overlay-filter behavior.

**Layer 3 — Package contract shell script (`packages/steam-korri/tests/steam-package-contract.sh`):**
- Checks: script files present, README phrases present, manifest entries present.
- Checks: `publicbeta` appears in both `steam-arm64-bootstrap` and `steam-arm64-seed` (explicit invariant: **currently tied to publicbeta**).
- Checks: no systemd/gamescope/product references in package scripts, no `/storage` hardcodes.
- Runs `steam-arm64-seed --dry-run` without env → expects failure mentioning `STEAM_HOME`.
- Runs `steam-guest-runtime-prep --apply` on a synthetic Proton directory → asserts patches are applied idempotently.

**Layer 4 — Nix derivation build check (`packages/steam-korri/check.nix`):**
- Builds the package, then asserts: executables exist, manifest.txt contents, resource files present, seed dry-run rejects missing STEAM_HOME, runtime-prep patches applied idempotently in a build sandbox.

---

## Issue Conventions (key problems to codify)

### Problem A — Channel: `publicbeta` → `steamdeck_stable`

**Current state (two hardcodes):**

1. `nixos-module.nix:1049` — seed service environment:
   ```nix
   STEAM_BETA = "publicbeta";
   ```
   This writes `publicbeta` to `$STEAM_HOME/package/beta` via `steam-arm64-bootstrap --apply` → creates `steam_client_publicbeta_linuxarm64.installed` and `.manifest` files.

2. `packages/steam-korri/scripts/steam-arm64-seed:48` — download manifest URL:
   ```bash
   STEAM_MANIFEST_URL="https://client-update.fastly.steamstatic.com/steam_client_publicbeta_linuxarm64"
   ```
   This is the Valve endpoint queried to resolve which ARM64 client zip to download.

3. `packages/steam-korri/manifest.nix:38` — provenance record:
   ```nix
   clientManifestUrl = "https://client-update.fastly.steamstatic.com/steam_client_publicbeta_linuxarm64";
   ```

**Distinction that matters:**
- The **download URL** (`STEAM_MANIFEST_URL`) is used only by `steam-arm64-seed` to fetch the initial ARM64 client zip. It needs to point to a valid channel that publishes `bins_linuxarm64_linuxarm64.zip.*` entries. `publicbeta_linuxarm64` is valid for this purpose.
- The **channel label** written to `package/beta` tells Steam which update channel to track after the initial download. The loop happened because Valve's stable ARM64 client (`steamdeck_stable`) was installed on device but Korri's seed had written `publicbeta` to `package/beta`, creating a mismatch. When the pending marker (`steam_client_steamdeck_stable_linuxarm64` file without `.installed` suffix) was present simultaneously, Steam entered the reinstall loop.

**What the solution doc establishes (2026-06-27):**
- `steam_client_linuxarm64` (generic) → HTTP 404; never use this.
- `steam_client_steamdeck_stable_linuxarm64` → valid stable manifest; predictable update cadence.
- `steam_client_publicbeta_linuxarm64` → valid but beta-channel cadence; less predictable.
- The safe default on Bandai is `steamdeck_stable` unless there is a deliberate reason to track beta.

**What to codify:**
- Add `services.korri.steam.betaChannel` option (`types.str`, default `"steamdeck_stable"`).
- Pass it as `STEAM_BETA = cfg.betaChannel` in the seed service environment (instead of hardcoding `"publicbeta"`).
- The `steam-arm64-bootstrap` script already reads `STEAM_BETA` from env, so this flows through automatically.
- The `steam-arm64-seed` download URL can stay `publicbeta_linuxarm64` (it is only used for the initial zip download, not the channel tracking) OR be updated to `steamdeck_stable_linuxarm64` — verify which Valve endpoint publishes the zip for the new channel.
- Update `packages/steam-korri/tests/steam-package-contract.sh` assertions: the current check `grep -q 'publicbeta' "$SCRIPT_DIR/steam-arm64-bootstrap"` will need to become `grep -q 'STEAM_BETA' "$SCRIPT_DIR/steam-arm64-bootstrap"` or similar.
- Update the module-check fixture in `nix/module-check.nix` to add a `betaChannel` assertion.
- Update `nix/nixos-module.test.ts` to assert the variable is `STEAM_BETA` and not hardcoded.

**Recovery helper the solution doc calls for:**
- A shell script (or module option) that backs up `package/`, removes stale pending markers, and starts Steam once without suppressors or GamepadUI.
- Could be `korri-steam-channel-repair` or `korri-steam-recover` added to `environment.systemPackages`.

### Problem B — Pre-start helpers must not mutate Steam-owned pressure-vessel files

**Current state:**

The `korri-steam-runtime-prep.path` unit watches **both** Proton scripts **and** pressure-vessel binaries:
```nix
PathChanged = [
  "${cfg.home}/compatibilitytools.d/proton-cachyos-11.0-20260601-slr-arm64/proton"
  "${cfg.home}/steamapps/common/Proton 10.0/proton"
  "${cfg.home}/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/bin/pressure-vessel-wrap"
  "${cfg.home}/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/libexec/steam-runtime-tools-0/pv-adverb"
];
Unit = "korri-steam-runtime-prep.service";
```

When the path unit fires, it runs:
```nix
ExecStart = "${cfg.package}/bin/steam-guest-runtime-prep --apply";
```

`--apply` wraps ALL pressure-vessel executables in `SteamLinuxRuntime*/pressure-vessel/` with FEX trampolines.

**The loop mechanism:**
1. Steam self-updates pressure-vessel (e.g. after `Update complete, launching Steam`).
2. `korri-steam-runtime-prep.path` fires on the changed PV files.
3. `steam-guest-runtime-prep --apply` overwrites the freshly-downloaded PV binaries with FEX wrappers — changing their content and mtime.
4. On next Steam start, `BVerifyInstalledFiles` detects the mutations → triggers a repair download of SteamLinuxRuntime_sniper → Steam logs `Update complete, launching Steam` → service exits 42 → restarts → repeat.

**What to codify:**

**Option 1 — Separate path watches by mutation class (preferred):**
- `korri-steam-proton-prep.path` watches Proton-only files → triggers `steam-guest-runtime-prep --patch-proton` (safe: Proton is Korri-managed; Steam doesn't BVerify it).
- Remove `SteamLinuxRuntime_sniper/pressure-vessel/*` from the path watch entirely.
- PV wrapping (`--apply`) runs ONLY on boot (once, before Steam first starts) via `korri-steam-runtime-prep.service` in the normal service chain. It does NOT re-run after Steam updates PV.

**Option 2 — Guard `--apply` against a running Steam:**
- Add a Steam-running check to `steam-guest-runtime-prep` before wrapping PV files.
- If `korri-steam-gamescope.service` is active, skip PV wrapping and log a warning.
- This is weaker than Option 1 because it depends on timing.

**Option 3 — Let Steam own PV; only inject FEX via `PRESSURE_VESSEL_FILESYSTEMS_RW` + env:**
- Don't wrap PV files at all; instead, inject FEX as the `bwrap` via environment variable overrides at launch time.
- This is a larger architectural change and may conflict with how `srt-bwrap` currently resolves `bwrap`.

The `--patch-proton` mode already exists in `steam-guest-runtime-prep` to handle Proton-only patching safely. Option 1 is the natural continuation of this design.

**NixOS module changes for Option 1:**
```nix
# NEW: Proton-only path watch
systemd.paths.korri-steam-proton-prep = {
  description = "Watch Korri Proton payloads for FEX/ARM64 patching";
  wantedBy = [ "multi-user.target" ];
  pathConfig = {
    PathChanged = [
      "${cfg.home}/compatibilitytools.d/proton-cachyos-11.0-20260601-slr-arm64/proton"
      "${cfg.home}/steamapps/common/Proton 10.0/proton"
    ];
    Unit = "korri-steam-proton-prep.service";
  };
};

# NEW: Proton-only repair service
systemd.services.korri-steam-proton-prep = {
  description = "Patch Korri Proton ARM64 FEX wrappers";
  serviceConfig = {
    Type = "oneshot";
    User = runtime.user;
    ExecStart = "${cfg.package}/bin/steam-guest-runtime-prep --patch-proton";
  };
  environment = { STEAM_HOME = cfg.home; FEX_BIN = "${pkgs.fex}/bin/FEX"; FEX_WRAPPER_BIN = "/usr/bin/FEX"; };
};

# MODIFIED: keep existing korri-steam-runtime-prep.service (boot-time full --apply)
# but remove its .path unit OR scope it to Proton only.
# The existing .path with PV files in PathChanged becomes korri-steam-proton-prep.path above.
```

**Module check additions:**
- Assert `korri-steam-proton-prep.path` does NOT contain `SteamLinuxRuntime_sniper` in its `PathChanged`.
- Assert `korri-steam-runtime-prep.service` is ordered before `korri-steam-gamescope.service` / `korri-steam.service`.
- Assert `korri-steam-proton-prep.service` uses `--patch-proton` mode.

**Boundary seam test additions (`nixos-module.test.ts`):**
- Assert `"steam-guest-runtime-prep --patch-proton"` appears in the new Proton-prep service.
- Assert that `SteamLinuxRuntime_sniper` does NOT appear in any PathChanged that triggers `--apply`.

### Problem C — Proton runtime and VDF state declared before startup

**Current state:**
- Proton CachyOS ARM64 symlink: created by `steam-arm64-seed --apply` (which also links it as `PROTON_SOURCE`).
- `CompatToolMapping` in `config/config.vdf`: written by `state-materializer.ts` at korrid launch time, which calls `lifecycle.shutdown()` first.
- `localconfig.vdf` (EULA/interstitial seeds): written at launch time.

**Problem:**
- With `keepWarm = true`, stopping the gamescoped Steam broker before every VDF write disrupts the always-warm session model.
- The Bandai discovery shows that seeds must happen ONCE (pre-startup) rather than reactively at each AppID launch.

**What to codify:**

**Pre-seeding VDF from a NixOS pre-start service:**
- Add a `korri-steam-config-seed.service` that runs before `korri-steam-gamescope.service` (after `korri-steam-seed.service`).
- The service writes `config/config.vdf` with `CompatToolMapping["0"]` pointing to the default compat tool declared in the module (e.g. `cfg.defaultCompatTool`).
- The service writes the global interstitial seeds and `registry.vdf` markers (already done by `steam-arm64-bootstrap` which copies `resources/registry.vdf`).

**New module option:**
```nix
defaultCompatTool = mkOption {
  type = types.str;
  default = "proton-cachyos-11.0-20260601-slr-arm64";
  description = "Default compat tool name written to Steam config.vdf CompatToolMapping.";
};
```

**New helper script in the NixOS module (`korri-steam-config-seed`):**
```bash
# Write config/config.vdf CompatToolMapping["0"] to the default compat tool.
# Run once before Steam starts; idempotent (reads current VDF, only writes on diff).
```

Or: extend `steam-arm64-bootstrap --apply` to write the CompatToolMapping in addition to registry.vdf. This keeps all pre-start VDF in the package helper (no new module-inline script needed).

**Unchanged:** `state-materializer.ts` continues to write per-game overrides and EULA seeds reactively at launch time — these are game-specific and safe to write while Steam is stopped for the brief atomic window. The global default compat tool is what moves to pre-startup.

### Problem D — Installed-file detection robustness after channel switch

**Current state:**
The `korri-steam-guest` launcher checks:
```bash
find "$STEAM_HOME/package" -maxdepth 1 -name 'steam_client_*_linuxarm64.installed' -print -quit
```
If this file exists, update suppressors (`-noverifyfiles`, `-nobootstrapupdate`, etc.) are kept in the Steam args.

This glob is channel-agnostic — it matches `steam_client_steamdeck_stable_linuxarm64.installed` and `steam_client_publicbeta_linuxarm64.installed`. After the channel switch to `steamdeck_stable`, the correct installed file from `steamdeck_stable` will satisfy the check. No change needed here.

**BUT:** If a stale `steam_client_publicbeta_linuxarm64.installed` exists alongside a missing or pending `steam_client_steamdeck_stable_linuxarm64`, the glob will return a false positive. The suppressors will be kept even though Steam needs to complete the `steamdeck_stable` bootstrap pass.

**Codification:** The module check and/or the `korri-steam-guest` logic should use `grep -q "$STEAM_BETA"` in the installed-file name, not a wildcard, so the channel label is consistent end-to-end:
```bash
# Use cfg.betaChannel (passed as env var STEAM_BETA) to form the exact installed-file name:
if [ -f "$STEAM_HOME/package/steam_client_${STEAM_BETA}_linuxarm64.installed" ]; then
  # keep suppressors
else
  # strip suppressors; allow first-time bootstrap
fi
```

---

## Templates Found

No issue/PR templates exist under `.github/ISSUE_TEMPLATE/`. The project uses its own planning model:
- `docs/plans/` — planning documents
- `docs/briefs/` — feature briefs with frontmatter (`id`, `title`, `status`, `jobs`)
- `docs/solutions/` — categorised solution writeups with YAML frontmatter (`module`, `tags`, `problem_type`)
- `work/items/active/` — active work items (ULID-named directories with plan files)
- `work/items/parking-lot/` — deferred items (ULID-named markdown files)

The solution doc model is the most relevant here:
```yaml
---
title: <title>
date: YYYY-MM-DD
category: runtime-errors
module: Korri Steam ARM64 runtime
problem_type: runtime_error
component: tooling
symptoms: [ ... ]
root_cause: config_error
resolution_type: environment_setup
severity: high
tags: [steam, arm64, bandai, nixos, ...]
---
```

---

## Recommendations

### What to plan and build (ordered by severity)

#### 1. Add `betaChannel` NixOS option; default to `steamdeck_stable` ← High, immediate

**Files to change:**
- `product/plugins/steam/nix/nixos-module.nix` — add option, pass as `STEAM_BETA = cfg.betaChannel` in seed service env.
- `product/plugins/steam/nix/module-check.nix` — add check: `enabled.services.korri.steam.betaChannel == "steamdeck_stable"`.
- `product/plugins/steam/nix/nixos-module.test.ts` — assert `STEAM_BETA` is present; assert hardcoded `"publicbeta"` does NOT appear in the seed environment block.
- `product/plugins/steam/packages/steam-korri/tests/steam-package-contract.sh` — change `grep -q 'publicbeta' "$SCRIPT_DIR/steam-arm64-bootstrap"` to check `STEAM_BETA` variable usage instead of the literal channel name, since the channel name comes from the environment.

**Test plan:**
- Nix check: `betaChannel` defaults to `"steamdeck_stable"`; seed service env carries `STEAM_BETA = "steamdeck_stable"`.
- TypeScript test: nixos-module.test.ts asserts hardcoded `"publicbeta"` is absent from the seed environment.
- Device proof: after applying, `cat /var/lib/korri/steam/package/beta` returns `steamdeck_stable`.

#### 2. Separate Proton-only path watch from pressure-vessel path watch ← High, loop-prevention

**Files to change:**
- `product/plugins/steam/nix/nixos-module.nix`:
  - Rename `korri-steam-runtime-prep.path` → `korri-steam-proton-prep.path` watching only Proton `proton` scripts.
  - Add `korri-steam-proton-prep.service` running `steam-guest-runtime-prep --patch-proton`.
  - Keep `korri-steam-runtime-prep.service` (full `--apply`) running once at boot only (no path watcher for PV files).
- `product/plugins/steam/nix/module-check.nix`:
  - Assert `korri-steam-proton-prep.path` exists and `pathChangedText` does NOT contain `SteamLinuxRuntime_sniper`.
  - Assert `korri-steam-runtime-prep.path` no longer exists (or is now scoped to Proton only).
  - Assert `korri-steam-proton-prep.service` ExecStart contains `--patch-proton`.
- `product/plugins/steam/nix/nixos-module.test.ts`:
  - Assert `"steam-guest-runtime-prep --patch-proton"` is present.
  - Assert pressure-vessel path is not watched by a unit that runs `--apply`.

**Test plan:**
- Nix check: module-check assertions above.
- Boundary seam: nixos-module.test.ts grep assertions.
- Device proof: after Steam self-updates SteamLinuxRuntime_sniper, no relaunch loop occurs; service eventually stabilises.

#### 3. Declare default compat tool in NixOS module (pre-startup VDF seeding) ← Medium

**Files to change:**
- `product/plugins/steam/nix/nixos-module.nix`: add `defaultCompatTool` option; add `korri-steam-config-seed.service` (or extend `steam-arm64-bootstrap` to write CompatToolMapping).
- `product/plugins/steam/packages/steam-korri/scripts/steam-arm64-bootstrap`: add a step to write `config/config.vdf` CompatToolMapping if `STEAM_COMPAT_TOOL` env is set.
- `product/plugins/steam/packages/steam-korri/tests/steam-package-contract.sh`: add assertion that `steam-arm64-bootstrap --help` or `--dry-run` prints the compat tool step.
- `product/plugins/steam/nix/module-check.nix`: assert `defaultCompatTool` defaults to `"proton-cachyos-11.0-20260601-slr-arm64"`.

**Context:** `state-materializer.ts` will continue to write per-game overrides. The global default (for the `0` key in `CompatToolMapping`) moves to the pre-startup service so the gamescoped broker always starts with the correct default — no shutdown/restart cycle needed for first-launch games.

#### 4. Add `betaChannel`-aware installed-file check in `korri-steam-guest` ← Medium

**File to change:**
- `product/plugins/steam/nix/nixos-module.nix`, the `steamLauncher` inline script:
  - Replace the wildcard glob `steam_client_*_linuxarm64.installed` with `steam_client_${STEAM_BETA}_linuxarm64.installed` (where `STEAM_BETA` is set from `cfg.betaChannel` via env in the launcher script — currently it reads from env, so inject via `environment.*` in the service, or pass in the launcher itself).

**Test plan:**
- Boundary seam: nixos-module.test.ts asserts the installed-file check uses the channel-specific name.
- Module check: verify the rendered `korri-steam-guest` script includes the env variable reference.

#### 5. Add recovery helper script for pending-marker clearing ← Low / operational

From the solution doc, a recovery tool that:
1. Stops all Steam services.
2. Backs up `package/`.
3. Removes stale pending marker files.
4. Starts Steam once without GamepadUI or suppressors.

Add as `korri-steam-recover` to `environment.systemPackages` in the module. This is operational tooling, not a runtime code path — it belongs as an inline `writeShellScriptBin` in the NixOS module.

---

### Testing conventions to follow

| Layer | When to use | Location |
|---|---|---|
| Nix pure eval (`module-check.nix`) | Module option defaults, service option shapes, assertion failures, path constraint invariants | `nix/module-check.nix` |
| TypeScript text-grep (`nixos-module.test.ts`) | Shell code patterns inside generated scripts, readiness signals, flag names, guard expressions | `nix/nixos-module.test.ts` |
| Shell contract (`steam-package-contract.sh`) | Package script content, missing-env behavior, README phrases, no `/storage` hardcodes | `packages/steam-korri/tests/steam-package-contract.sh` |
| Nix derivation build (`check.nix`) | Built artifact shape, executables present, manifest contents, runtime smoke patches applied | `packages/steam-korri/check.nix` |
| TypeScript unit (`*.test.ts`) | VDF parse/render, gate-seed logic, launch-spec parsing, materializer policy resolution | `src/*.test.ts` |

### Conventions the plan must respect

- **Package scripts must not reference systemd, gamescope, or product paths.** `steam-package-contract.sh` enforces this with a grep gate.
- **No `/storage` hardcodes in package scripts.** Same gate.
- **Channel label comes from env, not from the script itself.** The `STEAM_BETA` variable is the seam.
- **Module assertions are the enforcement layer for path constraints.** Use `lib.hasPrefix` checks in `assertions`.
- **`steam-guest-runtime-prep --apply` is idempotent** (verified in `check.nix`). New `--patch-proton` mode must be equally idempotent.
- **Nix checks own Nix/NixOS invariants; TypeScript tests own TypeScript runtime behavior.** Do not assert Steam channel logic in TypeScript tests — that lives in the Nix module check.
- **Read before touching.** Verify the installed-file check logic in the full `steamLauncher` inline script before changing it; it has subtle pre-seeding gates for first-time bootstrap.

---

### Key file paths (repo-relative) for implementation

| Purpose | Path |
|---|---|
| NixOS module (main) | `product/plugins/steam/nix/nixos-module.nix` |
| Module Nix checks | `product/plugins/steam/nix/module-check.nix` |
| Module TypeScript boundary tests | `product/plugins/steam/nix/nixos-module.test.ts` |
| Bootstrap script | `product/plugins/steam/packages/steam-korri/scripts/steam-arm64-bootstrap` |
| Seed script | `product/plugins/steam/packages/steam-korri/scripts/steam-arm64-seed` |
| Runtime prep script | `product/plugins/steam/packages/steam-korri/scripts/steam-guest-runtime-prep` |
| Package contract test | `product/plugins/steam/packages/steam-korri/tests/steam-package-contract.sh` |
| Package Nix check | `product/plugins/steam/packages/steam-korri/check.nix` |
| Manifest (URLs, provenance) | `product/plugins/steam/packages/steam-korri/manifest.nix` |
| VDF state materializer | `product/plugins/steam/src/state-materializer.ts` |
| SM8550 platform config (steam options set) | `product/systems/nixos/images/platforms/rocknix-sm8550.nix` |
| Solution doc (relaunch loop) | `docs/solutions/runtime-errors/steam-arm64-stable-self-update-relaunch-loop-2026-06-27.md` |
| Solution doc (proton-cachyos default) | `docs/solutions/runtime-errors/steam-arm64-proton-cachyos-default-matrix-2026-06-20.md` |
| Solution doc (srt-bwrap arch) | `docs/solutions/runtime-errors/steam-sniper-fex-bwrap-architecture-path-2026-06-19.md` |
