# Feasibility findings

## 1. `--patch-proton` is not yet a safe startup substitute

**Severity:** P1  
**Confidence:** 100

U2/U3 say the product can keep a Proton-only prep path and ensure it does not touch Steam-owned runtime files. In the current script, `--patch-proton` skips the pressure-vessel loops, but it still mutates every `steamapps/common/Proton*` tree: it links `files/share/fex-emu`, restores Wine wrappers, rewrites `#!/usr/bin/env python3` shebangs, and only then conditionally applies ARM64-specific patches. That includes Steam-managed Proton installs, not just Korri's `compatibilitytools.d/proton-cachyos-11.0-20260601-slr-arm64` symlink.

**Evidence:**
- `product/plugins/steam/packages/steam-korri/scripts/steam-guest-runtime-prep` loops over `"$common"/Proton*` for FEX share links before the `mode != patch-proton` guard.
- The same script loops over `"$common"/Proton*/files/bin`, `files/bin-wow64`, and `files/lib/wine/*-unix` to restore wrappers unconditionally.
- The Proton shebang rewrite loop over `"$common"/Proton*/proton` also runs in `patch-proton` mode.

**Plan change needed:** Before wiring any normal startup service to `--patch-proton`, add an implementation unit to split or scope Proton prep so the default path only touches Korri-owned compatibility-tool artifacts. Otherwise the plan removes Steam Runtime mutation but keeps startup-time mutation of Steam-managed Proton trees.

## 2. The recovery helper cannot currently launch a repair pass without update suppressors

**Severity:** P1  
**Confidence:** 100

U5 requires `korri-steam-recover` to start a repair pass without GamepadUI or update-suppressing flags. The current launch surfaces do the opposite by default: `korri-steam-guest` injects `cfg.defaultArgs` when called with no args, and `defaultSteamArgs` includes `-noverifyfiles`, `-nobootstrapupdate`, `-skipinitialbootstrap`, and `-norepairfiles`. The systemd services also call the same launcher with the rendered default args.

**Evidence:**
- `product/plugins/steam/nix/nixos-module.nix` defines default args with all four update suppressors.
- `korri-steam-guest` does `if [ "$#" -eq 0 ]; then set -- ${... cfg.defaultArgs ...}; fi`.
- `korri-steam-gamescope.service` executes `korri-steam-guest ${steamClientArgs}`.

**Plan change needed:** Specify a dedicated recovery entrypoint or launcher mode that bypasses `cfg.defaultArgs` and GamepadUI even when the configured channel already has an `.installed` marker. Do not leave this to “start a repair pass” via the existing service-control path.

## 3. Exit-42 relaunch handling needs concrete systemd policy

**Severity:** P2  
**Confidence:** 100

R4 says Steam's update-complete relaunch exit should be recoverable and not enter a permanent failed state, but the implementation units only say to preserve restart behavior. The current units use `Restart=on-failure` with `RestartSec=2s` and no explicit `SuccessExitStatus`, `RestartForceExitStatus`, or start-limit policy. Exit 42 will restart because it is a failure, but repeated legitimate update relaunches still count as failures and can hit systemd start limiting.

**Evidence:**
- `docs/solutions/runtime-errors/steam-arm64-stable-self-update-relaunch-loop-2026-06-27.md` documents `Update complete, launching Steam` with service status 42 as a relaunch request.
- Both `korri-steam-gamescope.service` and `korri-steam.service` currently set only `Restart = "on-failure"` and `RestartSec = "2s"`.

**Plan change needed:** Add an explicit service-envelope step that chooses and tests the intended systemd semantics for exit 42 and start limits. For example, the plan should name whether 42 is treated with `SuccessExitStatus` plus an always/forced restart, or kept as failure with a deliberate `StartLimit*` policy. Module checks should assert that exact contract.

## 4. U2 omits package smoke tests that still encode the old mutation contract

**Severity:** P2  
**Confidence:** 100

U2 lists package contract checks, but the colocated smoke tests already assert the old behavior. Those tests will either fail or pressure the implementer to preserve Steam-owned runtime mutation unless the plan explicitly updates them and redefines `--check` semantics.

**Evidence:**
- `product/plugins/steam/packages/steam-korri/tests/steam-guest-run-smoke.sh` asserts `--run should apply runtime prep` and expects the prep hook to receive `--apply`.
- `product/plugins/steam/packages/steam-korri/tests/steam-guest-runtime-prep-smoke.sh` asserts pressure-vessel helpers are replaced with FEX trampolines, font `.uuid` markers are written, runtime python symlinks are created, and `--check` validates the pressure-vessel trampolines.

**Plan change needed:** Add these smoke tests to U2's file/test list and state the new expected behavior for `steam-guest-run --check` and `steam-guest-runtime-prep --check` after Steam-owned runtime files are no longer patched by default.

## 5. A Nix compat-tool option will not affect the TS materializer default without a bridge

**Severity:** P2  
**Confidence:** 75

U3 proposes a module-level default compat-tool option, but the existing app materialization path has its own TypeScript default. If the Nix option is made configurable without a bridge into plugin policy, launch materialization can later rewrite `config.vdf` back to the TS default even though the Nix service seeded a different global default.

**Evidence:**
- `product/plugins/steam/src/plugin.ts` defines `DEFAULT_STEAM_COMPAT_TOOL = "proton-cachyos-11.0-20260601-slr-arm64"` and uses it in `defaultSteamPluginPolicy`.
- `product/plugins/steam/src/materializer.ts` passes `policy["compat-tool"]` into `materializeSteamDesiredState`, which writes `config/config.vdf` compat mappings.
- U3's file list includes `state-materializer.ts` but not `plugin.ts` or `materializer.ts`.

**Plan change needed:** Either keep the compat tool as a fixed product constant shared by Nix/package/TS, or add a concrete config bridge and tests proving the Nix module default and the TypeScript materializer default cannot diverge.
