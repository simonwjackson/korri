# Scope Guardian Review: Steam self-managed lifecycle plan

Target: `work/items/active/01K01KW51RPBVMTEAXE6R6NJW9-steam-self-managed-lifecycle/plan.md`

## What already exists

- `product/plugins/steam/nix/nixos-module.nix` already owns the systemd service envelope, seed service env, first-launch flag filtering, runtime-prep service/path units, and `korri-steam-service-control`.
- `product/plugins/steam/packages/steam-korri/scripts/steam-guest-run` already invokes `steam-guest-runtime-prep --apply` before Steam; removing that default call is the smallest direct fix for Steam-owned runtime mutation.
- `product/plugins/steam/src/state-materializer.ts` already owns VDF parsing/rendering, `config.vdf` compatibility-tool mapping, localconfig writes, shutdown/restart sequencing, and tests for malformed VDF / missing compat tools.
- `product/plugins/steam/src/plugin.ts` already declares `DEFAULT_STEAM_COMPAT_TOOL = "proton-cachyos-11.0-20260601-slr-arm64"` in plugin policy.

## Findings

### 1. Narrow U3 so it does not create a second VDF authority

**Severity:** P2  
**Confidence:** 75

U3 is aligned with the goal of keeping Korri responsible for Proton and VDF state, but its current approach risks expanding that into duplicate ownership:

> `product/plugins/steam/src/state-materializer.ts` and `product/plugins/steam/src/steam-gate-seed.ts` own VDF parsing/rendering, compatibility-tool mapping, EULA/interstitial seeds, and localconfig writes.

Yet U3 proposes:

> Add or expose a module-level default compat tool option for the ARM64 CachyOS Proton runtime.  
> Add an idempotent pre-start config seed for global `config.vdf` default compat mapping where feasible.

and touches both Nix/package scripts and the TypeScript materializer.

**Why it matters:** the plan can satisfy R3 by reusing the existing materializer as the VDF writer. Adding shell/Nix-side `config.vdf` seeding and a new module-level compat-tool option creates two places that can encode the same mapping and drift from `DEFAULT_STEAM_COMPAT_TOOL`.

**Suggested narrowing:** keep U3 focused on ensuring the Proton compatibility tool symlink/metadata exists before Steam starts, and keep VDF mutation behind `state-materializer.ts` (or a tiny entrypoint that reuses it). Defer a configurable `defaultCompatTool` module option unless the plan names multiple current consumers.

### 2. Narrow U5 recovery to stale package-state recovery, not a custom launch policy

**Severity:** P2  
**Confidence:** 75

R5 asks for:

> an operator-safe recovery path for stale pending update markers and mixed package metadata.

U5 expands that into a broader operational launch path:

> stop Steam services, stop/wind down keep-warm where applicable, clear stale Steam IPC shared-memory handles, back up `package/`, remove only the configured channel's pending marker, ensure `package/beta` matches the configured channel, and start a repair pass without GamepadUI or update suppressors.

The plan separately says GamepadUI policy is outside this lifecycle change:

> This plan does not make `-gamepadui` healthy; it keeps GamepadUI policy separate from the Steam self-management contract.

**Why it matters:** adding a recovery-specific “repair pass without GamepadUI” quietly pulls launch/UI policy into an operator recovery helper. That is more surface than R5 requires and overlaps deferred GamepadUI decisions.

**Suggested narrowing:** keep `korri-steam-recover` to backup-first package-state repair: stop services, back up `package/`, remove only configured-channel pending markers, align `package/beta`, preserve `.installed` / `.manifest`, and report next steps. Use existing service-control/start behavior afterward. Defer any special no-GamepadUI repair-launch mode unless implementation evidence proves recovery cannot work without it.

### 3. Remove U1 as a dependency of U2

**Severity:** P3  
**Confidence:** 100

U2 declares:

> **Dependencies:** U1

but its goal is independent:

> Stop normal Steam service startup and reactive path watches from modifying Steam-owned Steam Runtime or pressure-vessel files.

The existing mutation points are already identifiable without channel policy: `steam-guest-run` invokes `steam-guest-runtime-prep --apply`, and the Nix module wires `korri-steam-runtime-prep.service` plus path watches for `SteamLinuxRuntime_sniper/pressure-vessel`.

**Why it matters:** the primary loop fix can ship without first adding `betaChannel`. Keeping the dependency inflates the critical path and couples two distinct changes: channel policy and Steam-owned runtime self-management.

**Suggested narrowing:** make U2 dependency-free, or note that U1/U2 can proceed in parallel. U4 should remain dependent on U1 because channel-specific installed markers need the configured channel.
