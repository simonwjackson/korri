# Steam Lifecycle Plan — Flow Analysis & Gap Report

**Scope of plan under review:** Codify Korri Steam lifecycle changes in
`product/plugins/steam` — Steam self-manages mutable client/runtime files;
Korri declares Proton runtimes and VDF/config before startup; default ARM
channel becomes `steamdeck_stable`; stop pre-start runtime prep from mutating
Steam-owned pressure-vessel files; preserve debugging and recovery helper.

**Date:** 2026-06-27  
**Analyst role:** spec/UX reviewer (pre-implementation)

---

## Phase 1: Codebase Anchors

Files examined before analysis:

| Path | Purpose |
|---|---|
| `product/plugins/steam/nix/nixos-module.nix` | NixOS module: options, services, inline helper scripts |
| `product/plugins/steam/nix/module-check.nix` | Pure-Nix evaluation checks — the verification layer that will reject or accept the plan |
| `product/plugins/steam/nix/nixos-module.test.ts` | TypeScript boundary-seam tests that grep module source |
| `product/plugins/steam/packages/steam-korri/scripts/steam-guest-runtime-prep` | The mutating prep script — central to the PV-ownership question |
| `product/plugins/steam/packages/steam-korri/scripts/steam-arm64-bootstrap` | Writes `package/beta`, VDF resources |
| `product/plugins/steam/packages/steam-korri/scripts/steam-arm64-seed` | Downloads ARM64 runtime + client; links compat tool |
| `product/plugins/steam/packages/steam-korri/scripts/steam-guest-run` | Execs Steam from FHS capsule; calls `--apply \|\| true` |
| `product/plugins/steam/packages/steam-korri/manifest.nix` | Provenance record — contains `clientManifestUrl` pointing at `publicbeta` |
| `product/plugins/steam/packages/steam-korri/tests/steam-package-contract.sh` | Shell gate — currently **enforces** `publicbeta` literal |
| `product/plugins/steam/src/state-materializer.ts` | Effect-wrapped VDF write protocol; calls `lifecycle.shutdown()` before writes |
| `product/systems/nixos/images/platforms/rocknix-sm8550.nix` | SM8550 platform wiring; sets `keepWarm=true`, `useGamepadUi=true` |
| `docs/solutions/runtime-errors/steam-arm64-stable-self-update-relaunch-loop-2026-06-27.md` | Root-cause analysis and recovery steps the plan must encode |
| `steam-learnings.md` / `steam-repo-research.md` | Institutional learning and research artifacts |

Key patterns already in the codebase:
- `korri-steam-runtime-prep.path` currently watches BOTH Proton scripts AND `SteamLinuxRuntime_sniper` PV binaries, triggering `--apply` on any change.
- `module-check.nix` has a passing check that **asserts PV files are in PathChanged** — removing them makes the existing check fail.
- `steam-package-contract.sh` has two `grep -q 'publicbeta'` assertions — removing `publicbeta` from the scripts will make these fail.
- `steam-guest-run` calls `"$runtime_prep" --apply || true` — prep failures are silently swallowed.
- The `korri-steam-seed.service` is `Type=oneshot` with no restart/path-watch mechanism; it runs once per boot.

---

## Phase 2: User Flows

### Flow 1: First-boot / fresh install

```
boot
  └─ korri-steam-uinput.service       (prepare /dev/uinput)
  └─ korri-steam-seed.service         (downloads ARM64 steamrtarm64 runtime + client zip)
       └─> writes package/beta        ← betaChannel written here
       └─> writes compatibilitytool.vdf / registry.vdf
  └─ korri-steam-prepare-fex-rootfs.service  (downloads ArchLinux squashfs → Mesa26 overlay)
  └─ korri-steam-runtime-prep.service (--apply → FEX-wraps PV helpers + patches Proton)
       └─> STEAM_HOME/steamapps/common/SteamLinuxRuntime_sniper/ NOT YET PRESENT
           ← Steam downloads it on first launch, not during seed
  └─ korri-steam-gamescope.service    (Gamescope -- korri-steam-guest <defaultArgs>)
       └─> Steam starts, downloads SteamLinuxRuntime_sniper        ← KEY: PV files appear HERE
       └─> Steam exits 42 ("Update complete, launching Steam")
       └─> Restart=on-failure → service restarts
       └─> Steam starts normally (if update loop broken)
```

Decision point: SteamLinuxRuntime_sniper arrives **after** runtime-prep runs at boot.  
Today: path watcher fires on new/changed PV files → triggers `--apply`.  
After plan: path watcher no longer fires on PV files → PV files are **never wrapped** until next reboot.

### Flow 2: Steam self-update cycle (status=42)

```
Steam running
  └─> Steam self-updates SteamLinuxRuntime_sniper
  └─> Steam exits 42 ("Update complete, launching Steam")
  └─> systemd: Restart=on-failure → 2s → restarts service
  [TODAY]
  └─> korri-steam-runtime-prep.path fires on changed PV files
  └─> --apply wraps PV files
  └─> Steam starts → BVerifyInstalledFiles detects mutations → exits 42 again ← THE BUG
  [AFTER PLAN]
  └─> path watcher no longer fires on PV files (only Proton)
  └─> Steam starts → PV files are what Steam wrote → no BVerify mutation → settles ← GOAL
```

Decision point: If Steam exits 42 several times rapidly (update pass + real-client launch), systemd's default `StartLimitBurst=5` within `StartLimitIntervalSec=10s` can stop the service permanently.

### Flow 3: AppID launch (korri-steam-app <appid>)

```
korri-steam-app <appid>
  └─> check gamescope service active
  └─> if inactive: request_steam_service_start()
      ├─> sudo korri-steam-service-control start (reset-failed + --no-block start)
      └─> fallback: systemctl --user restart korri-steam-warm.service
  └─> wait_for_steam_ready() [gamescope socket + console_log readiness signals]
  └─> focus_korri_output / hide_steam_hat
  └─> timeout $forward_timeout korri-steam-guest steam://rungameid/$appid
  └─> observe AppID via console_log byte offset
      ├─> "Game process added": focus_game + repair_game_audio
      └─> "Game process removed": cleanup + exit
```

Decision point: The installed-file check in `korri-steam-guest` uses a wildcard glob (`steam_client_*_linuxarm64.installed`) that matches any channel's installed file. A stale `steam_client_publicbeta_linuxarm64.installed` alongside a missing `steam_client_steamdeck_stable_linuxarm64.installed` produces a false positive: update suppressors are kept even though the new channel needs a bootstrap pass.

### Flow 4: VDF state write (state-materializer.ts)

```
AppID launch → materializer.ts
  └─> build write set (parse config.vdf + localconfig.vdf)
  └─> if no changes: skip
  └─> lifecycle.shutdown() → lifecycle.waitForShutdown() [15s deadline]
      ← WITH keepWarm=true: THIS STOPS THE WARM GAMESCOPED BROKER
  └─> re-read VDF after stop
  └─> atomic write (tmpfile → rename)
  └─> lifecycle.start() → lifecycle.waitUntilReady()
```

Decision point: Pre-seeding `config.vdf` at boot reduces writes for the global compat tool. But `localconfig.vdf` EULA/interstitial seeds are per-Steam-account and require a live `userdata/<steamid>/` directory. Pre-boot seeding cannot write them if the user hasn't logged in yet.

### Flow 5: Channel switch (betaChannel config change)

```
operator: changes betaChannel from "publicbeta" to "steamdeck_stable"
nixos-rebuild switch
  └─> korri-steam-seed.service: already ran today (Type=oneshot); does NOT re-run
      └─> $STEAM_HOME/package/beta still contains "publicbeta"
  └─> korri-steam-gamescope.service: restarts with new Nix closure
      └─> Steam reads package/beta = "publicbeta"
      └─> Steam tracks the wrong channel
```

### Flow 6: Recovery (proposed korri-steam-recover)

```
operator runs korri-steam-recover
  └─> stop korri-steam-gamescope.service (systemctl)
  └─> stop korri-steam-warm.service (user service — requires different invocation)
  └─> [missing] clear /dev/shm/u*-ValveIPCSharedObj-Steam
  └─> backup $STEAM_HOME/package/
  └─> rm $STEAM_HOME/package/steam_client_${betaChannel}_linuxarm64 (pending marker only)
  └─> launch Steam once without suppressors or GamepadUI
```

---

## Phase 3: Gaps

### Critical

---

**C1 — PV wrapping after first-time SteamLinuxRuntime_sniper download is lost**

What's missing: `steam-arm64-seed` downloads only the ARM64 runtime (`steam-runtime-steamrt-arm64`) and client zip. `SteamLinuxRuntime_sniper` is downloaded by Steam itself on first launch. By then, `korri-steam-runtime-prep.service` has already run `--apply` and found no Sniper directory to wrap. Today, `korri-steam-runtime-prep.path` catches the new/changed PV files and re-runs `--apply`. After removing PV files from PathChanged, there is no mechanism to wrap the Sniper PV helpers after Steam first downloads them.

Why it matters: All `x86`/`x86_64` Proton games depend on the FEX-trampoline wrappers in `pressure-vessel/`. Without them, `pressure-vessel-wrap` and `pv-adverb` are x86_64 ELF binaries executed directly on ARM64 — immediate `Exec format error`. The first Proton game launch on a freshly seeded device fails silently until the user reboots.

Codebase pattern: `steam-guest-runtime-prep --check` explicitly validates that `pv_wrap` and `pv_adverb` are proper FEX trampolines. The plan removes the mechanism that ensures they are.

Default assumption (if unaddressed): users will see Proton game failures on first install and need to know to reboot.

---

**C2 — `steamdeck_stable_linuxarm64` zip availability for initial seed is unverified**

What's missing: `steam-arm64-seed` resolves the ARM64 client zip by fetching `steam_client_${STEAM_MANIFEST_URL_channel}_linuxarm64` and parsing `bins_linuxarm64_linuxarm64.zip.*` entries. The script currently hardcodes `STEAM_MANIFEST_URL` to the `publicbeta` endpoint. The plan says to switch the channel label but explicitly defers verifying whether `steamdeck_stable_linuxarm64` publishes the same zip format. If it does not, all fresh installs break at `install_client()` with a "could not resolve ARM64 client zip" error.

The solution doc confirms `steam_client_steamdeck_stable_linuxarm64` manifest is valid as a metadata URL (for update tracking), but this is distinct from whether the manifest body contains a `bins_linuxarm64_linuxarm64.zip.*` line.

Why it matters: If the download URL doesn't work, `steam-arm64-seed --apply` exits non-zero and `korri-steam-seed.service` fails, blocking all dependent services.

Default assumption: `publicbeta_linuxarm64` continues to serve as the seed download URL (separate from the channel label), which is architecturally allowed and documented in research. Confirm this is explicit policy, not an oversight.

---

**C3 — Existing module-check.nix assertion actively contradicts the plan**

What's missing: The current `module-check.nix` check "runtime prep path watches mutable Proton and Sniper updates" passes today and **explicitly asserts** that `SteamLinuxRuntime_sniper/pressure-vessel/bin/pressure-vessel-wrap` IS in `PathChanged`:

```nix
(check "runtime prep path watches mutable Proton and Sniper updates" (
  ...
  && lib.hasInfix "SteamLinuxRuntime_sniper/pressure-vessel/bin/pressure-vessel-wrap" (pathChangedText runtimePrepPath)
  && lib.hasInfix "SteamLinuxRuntime_sniper/pressure-vessel/libexec/steam-runtime-tools-0/pv-adverb" (pathChangedText runtimePrepPath)
))
```

The plan to remove PV files from the path watcher will cause this check to fail. The check must be updated atomically in the same commit. Without this, `just test-nix` fails the moment the module changes are applied.

Why it matters: A failed check in CI without a corresponding fix creates a broken intermediate state if the implementation lands in parts.

Default assumption: the implementation commit updates both the module and the check in the same change set.

---

**C4 — `steam-package-contract.sh` enforces `publicbeta` literal — will fail the check gate**

What's missing: The package contract test contains two assertions that will fail if `publicbeta` is removed from the scripts:

```bash
grep -q 'publicbeta' "$SCRIPT_DIR/steam-arm64-bootstrap" \
  || fail "ARM64 bootstrap should default to the publicbeta channel that ROCKNIX used"
grep -q 'publicbeta' "$SCRIPT_DIR/steam-arm64-seed" \
  || fail "ARM64 seed should default to the publicbeta channel that ROCKNIX used"
```

These run inside `check.nix` as part of `just test-nix`. If `publicbeta` is removed from the scripts and these grep checks are not updated, `nix build .#checks.*korri-steam*` fails.

The research doc describes updating these assertions to check for `STEAM_BETA` variable usage instead, but the exact replacement assertion is not defined. The new assertion must still prove the channel comes from environment (not hardcoded) without accidentally passing on an unmodified file.

Default assumption: the assertions become `grep -q '\$\{STEAM_BETA\}' "$SCRIPT_DIR/steam-arm64-bootstrap"` or `grep -q 'STEAM_BETA' "$SCRIPT_DIR/steam-arm64-bootstrap"`.

---

### Important

---

**I1 — betaChannel config change does not propagate to a live system without manual intervention**

What's missing: `korri-steam-seed.service` is `Type=oneshot`. On `nixos-rebuild switch`, systemd does not re-run oneshot services whose environment changed. If an operator changes `betaChannel` in the NixOS config and rebuilds, `$STEAM_HOME/package/beta` still contains the old channel string. Steam continues tracking the old channel until either a manual `systemctl restart korri-steam-seed.service` or a full reboot.

Why it matters: the "switch to steamdeck_stable" fix is rendered ineffective on devices that already ran once with `publicbeta`. Operators applying the fix to a running fleet won't see the channel change take effect automatically.

Codebase pattern: `korri-steam-seed.service` has no `ConditionPathExists=!$STEAM_HOME/package/beta` guard or path-triggered restart. There is no mechanism for oneshot re-run on environment change.

Default assumption if unspecified: operators must manually restart the seed service or reboot after a betaChannel change.

---

**I2 — `localconfig.vdf` EULA seeding cannot happen before first Steam login; pre-boot seeding leaves the gap**

What's missing: The plan proposes a `korri-steam-config-seed.service` that writes `config.vdf` globally before Steam starts. But per-game EULA seeds and interstitial bypasses live in `userdata/<steamid>/config/localconfig.vdf`. This directory doesn't exist until Steam creates it after the first successful login. A pre-boot service cannot write localconfig.vdf on a fresh device.

`state-materializer.ts` discovers all `userdata/*/config/localconfig.vdf` files and writes to each. On first launch the glob finds nothing and the seeds are not applied, which means new-game interstitials can block the AppID launch flow.

Why it matters: on a fresh device, the first game launch will hit Steam interstitials (EULA, Deck configurator) even after the config-seed service ran. The AppID launcher (`korri-steam-app`) currently has no code to wait for or respond to Steam interstitial prompts.

Default assumption if unspecified: EULA seeds must still be applied reactively at AppID-launch time via the materializer write cycle (shutdown → write → start), accepting the disruption for first-game launches only.

---

**I3 — IPC shared-memory handle cleanup is missing from the recovery helper design**

What's missing: The solution document explicitly requires clearing `/dev/shm/u*-ValveIPCSharedObj-Steam` before recovery. A newly started Steam process can discover an existing dead IPC handle, treat it as a live session, and behave erratically (crash, hang in IPC negotiation, or skip the update cycle that was supposed to self-repair). The proposed `korri-steam-recover` helper script design doesn't include this step.

Why it matters: the recovery helper is the last-resort tool for broken update loops. If it leaves stale IPC objects, operators may run it and still see a failing Steam session — the tool doesn't fully solve the problem it was written for.

Default assumption: recovery helper includes `rm -f /dev/shm/u*-ValveIPCSharedObj-Steam` before starting Steam.

---

**I4 — systemd `StartLimitBurst` defaults can freeze the gamescope service during update loops**

What's missing: `korri-steam-gamescope.service` has `Restart=on-failure` and `RestartSec=2s` but no `StartLimitBurst` or `StartLimitIntervalSec` override. systemd's default limit is 5 starts within 10 seconds. Steam exits 42 during a normal update pass (update complete → relaunch). If a pending marker survives and causes a second rapid restart, a stale IPC handle causes a third, and a BVerify failure causes a fourth, the service may hit the burst limit and enter `failed` state — stopping all Steam-dependent flows until `systemctl reset-failed` is run manually.

This matters for the plan because the channel switch from `publicbeta` to `steamdeck_stable` will likely cause at least two status-42 cycles on first startup with a mixed `package/` state.

Codebase pattern: `korri-steam-app` uses `systemctl reset-failed korri-steam-gamescope.service` before starting, which handles one failed cycle. But a sustained loop can exhaust the burst limit faster than `korri-steam-app`'s retry logic catches up.

Default assumption if unspecified: add `StartLimitBurst = 0` (unlimited) or `StartLimitIntervalSec = 0` to `korri-steam-gamescope.service`.

---

**I5 — `steam-guest-run` silently ignores `--apply` failures; PV wrapping problems are invisible**

What's missing: `steam-guest-run` calls:
```bash
"$runtime_prep" --apply || true
```

If `FEX_BIN` is not found, if filesystem permissions fail, or if the wrapping logic exits non-zero, Steam starts anyway. The only signal is Steam itself failing later with `Exec format error` when pressure-vessel runs. There is no gate that verifies srt-bwrap properties (the three required properties documented in `steam-learnings.md`) after `--apply` completes.

Why it matters: silent prep failures are the hardest category to debug. An operator sees a failed game launch and nothing in `korri-steam-gamescope.service` logs indicating the root cause. The `--check` mode exists but is never invoked automatically in the service path.

Default assumption: either run `--check` after `--apply` in `steam-guest-run` (not `|| true`) and log the result, or add a separate gate service `korri-steam-runtime-verify.service` ordered before `korri-steam-gamescope.service`.

---

**I6 — New Proton version downloaded by Steam during runtime is not patched until next reboot**

What's missing: The proposed `korri-steam-proton-prep.path` watches specific hardcoded Proton paths:
```
${cfg.home}/compatibilitytools.d/proton-cachyos-11.0-20260601-slr-arm64/proton
${cfg.home}/steamapps/common/Proton 10.0/proton
```

Steam can download a new Proton version (e.g. `Proton 10.1` or an updated CachyOS build) into a new directory. The path watcher doesn't know about the new path; the new Proton is not patched until the next boot-time `--apply` run.

Why it matters: a game that requires the new Proton will launch it with an unwrapped x86_64 Python script on ARM64 — immediate failure. This is an existing gap but the plan introduces a new, explicitly named `korri-steam-proton-prep.service` that implies complete Proton coverage, which it doesn't provide.

Default assumption: document the limitation explicitly and note that Proton coverage depends on the boot-time `--apply` pass, not the reactive path watcher.

---

**I7 — Recovery helper stopping `korri-steam-warm.service` (a user unit) from a root/system context is unspecified**

What's missing: With `keepWarm = true`, `korri-steam-warm.service` runs under the Korri user's systemd manager. The recovery helper runs as root or via sudo. Stopping a user-session service from root requires `systemctl --user -M korri@.slice stop korri-steam-warm.service` or a `systemctl --user` invocation within the user's session. Neither the plan nor the research doc specifies how the recovery helper addresses this.

Why it matters: if `korri-steam-warm.service` is not stopped before recovery, it can re-start `korri-steam-gamescope.service` mid-recovery (via the warmup service's `korri-steam-service-control start` call), racing with the recovery helper's cleanup steps.

Default assumption: recovery helper must `systemctl stop korri-steam-gamescope.service` (system unit) AND call `systemctl --user -M korri@0 stop korri-steam-warm.service` (or equivalent) before proceeding.

---

### Minor

---

**M1 — `manifest.nix` clientManifestUrl references `publicbeta` but is not in the plan's file list**

What's missing: `manifest.nix` line:
```nix
clientManifestUrl = "https://client-update.fastly.steamstatic.com/steam_client_publicbeta_linuxarm64";
```
This URL appears in the built artifact `manifest.txt` (via `package.nix`). If the plan changes `steam-arm64-seed`'s download URL or channel, `manifest.nix` is a provenance record that must stay aligned. The research doc's "files to change" lists don't mention `manifest.nix`.

Default assumption: `manifest.nix` is updated to reflect the resolved policy (either the download URL stays `publicbeta_linuxarm64` as the seed-only endpoint, or it changes to `steamdeck_stable_linuxarm64` — whichever is chosen, the file must match).

---

**M2 — `betaChannel` interpolation in `korri-steam-guest` requires Nix-eval-time baking, not runtime env injection**

What's missing: The plan says to fix the installed-file check in `korri-steam-guest` to use the channel-specific name instead of the wildcard glob. But `korri-steam-guest` is a `writeShellScriptBin` — Nix values are interpolated at eval time. The fix must use `${lib.escapeShellArg cfg.betaChannel}` directly in the Nix string, not `$STEAM_BETA` as a runtime variable (the launcher doesn't currently receive `STEAM_BETA` via its environment). If the implementation injects `STEAM_BETA` via a service environment block but the launcher script uses `$STEAM_BETA` inside the `writeShellScriptBin`, the variable will be unset at runtime since the launcher is invoked standalone (e.g., `korri-steam-guest steam://rungameid/1234`) outside a service environment block.

Default assumption: the fix reads `${lib.escapeShellArg cfg.betaChannel}` at Nix eval time, producing a hardcoded string in the generated script.

---

**M3 — No module-check fixture for `betaChannel` override**

What's missing: `module-check.nix` currently tests `enabled`, `enabledKeepWarm`, `enabledKeepVisible`, `runtimeOverride`, `invalidPath`, `x86Enabled`, and `disabled`. There is no fixture for `betaChannelOverride`. The check that `STEAM_BETA = cfg.betaChannel` flows into the seed service environment cannot be verified without a fixture that changes the option and asserts the environment variable.

Default assumption: add a `betaChannelOverride` fixture:
```nix
betaChannelOverride = evaluateWith "aarch64-linux" ({ pkgs, ... }: {
  services.korri.steam = { enable = true; package = pkgs.steam-korri; betaChannel = "steamdeck_stable"; };
});
```
and check `(betaChannelOverride.systemd.services.korri-steam-seed.environment.STEAM_BETA or null) == "steamdeck_stable"`.

---

**M4 — Download URL / channel-label distinction is not encoded in any test**

What's missing: There are two distinct URLs/labels in play:
1. `STEAM_MANIFEST_URL` in `steam-arm64-seed` (used only for the initial zip download)
2. `STEAM_BETA` / `package/beta` (the ongoing update channel)

The plan conflates these in places. No test currently verifies that `STEAM_BETA` is independent of `STEAM_MANIFEST_URL`. If a developer updates `STEAM_BETA` to `steamdeck_stable` but forgets that `STEAM_MANIFEST_URL` is also still hardcoded, the download still works (publicbeta URL delivers a zip) but the channel label changes correctly — which is the intended outcome. But the test suite has no assertion that makes this policy explicit.

Default assumption: add a comment in `steam-arm64-seed` separating these two roles explicitly, and add a `steam-package-contract.sh` assertion that `STEAM_MANIFEST_URL` and `STEAM_BETA` are independent variables.

---

**M5 — `steam-guest-runtime-prep --patch-proton` has no dedicated smoke test**

What's missing: `steam-guest-runtime-prep-smoke.sh` (via `check.nix`) tests the `--apply` mode. The `--patch-proton` mode is invoked by the new `korri-steam-proton-prep.service` but has no dedicated smoke test. The `--apply` mode tests verify idempotency for Proton patches as a side effect, but not the `--patch-proton` mode's behaviour when PV wrapping is explicitly excluded.

Default assumption: add a `steam-guest-runtime-prep --patch-proton` mode smoke test to `check.nix` that verifies: (a) Proton scripts are patched, (b) no PV executables under `SteamLinuxRuntime*/` are touched.

---

## Phase 4: Questions

**Q1 (blocks C1, C2) — What is the intended mechanism for wrapping PV files when SteamLinuxRuntime_sniper arrives after the boot-time runtime-prep?**

*Stakes:* Without an answer, all Proton games fail on first-time install. The boot-time `--apply` cannot wrap files that don't exist yet.

*Options to specify:*  
a) Add a `PathExists`/`DirectoryNotEmpty` path unit that watches `$STEAM_HOME/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/` and triggers a PV-only `--apply` pass.  
b) Accept that a reboot is required after first-time Sniper download, and document this as a known first-boot constraint.  
c) Modify the path watcher to use only `DirectoryNotEmpty` on `SteamLinuxRuntime_sniper/pressure-vessel/` (fires once when the directory first appears) rather than `PathChanged` on specific binaries.

*Default assumption:* option (b) with an explicit note — acceptable for a kiosk device where first-boot provisioning is operator-controlled. The recovery helper (`korri-steam-recover`) doubles as the post-Sniper-download repair path.

---

**Q2 (blocks C2) — Does `steam_client_steamdeck_stable_linuxarm64` publish a `bins_linuxarm64_linuxarm64.zip.*` entry in its manifest body?**

*Stakes:* If it doesn't, `steam-arm64-seed --apply` fails at `resolve_client_zip()` on any fresh install after the plan lands. This must be verified before the channel change reaches production.

*Default assumption:* the download URL stays `publicbeta_linuxarm64` as a seed-only endpoint (valid and confirmed to exist), while `STEAM_BETA` (the package/beta tracking label) changes to `steamdeck_stable`. This is explicitly architecturally allowed — the two are independent — but must be documented as deliberate policy.

---

**Q3 (blocks I1) — How does a betaChannel config change propagate to a live system?**

*Stakes:* If the answer is "it doesn't until next reboot," the fix for the update loop won't help operators who apply the NixOS change to a running fleet. They will see no behavior change until the next reboot.

*Default assumption:* `nixos-rebuild switch` does not re-run the oneshot seed service. Operators must run `systemctl restart korri-steam-seed.service` (which re-writes `package/beta`) and then restart the gamescope service. This should be documented in the solution doc and recovery helper.

---

**Q4 (blocks I2) — Does the pre-startup `config.vdf` seeding replace or supplement the materializer's write cycle for first-game launches?**

*Stakes:* If the materializer still calls `lifecycle.shutdown()` for every new game's EULA seed (because pre-boot seeding can't write `localconfig.vdf` without a known steamid), the `keepWarm` mode still incurs shutdown/start cycles on first-game plays. The claimed benefit of "declaring VDF state before startup" only applies to the global compat tool mapping.

*Default assumption:* pre-boot seeding writes `config.vdf` (global compat tool) only. EULA/interstitial seeding via `localconfig.vdf` remains reactive at launch time. The materializer's `lifecycle.shutdown()` path is preserved for per-game writes. The plan should state this explicitly.

---

**Q5 (blocks I4) — Should `korri-steam-gamescope.service` have `StartLimitBurst = 0` or `StartLimitIntervalSec = 0`?**

*Stakes:* Without this, a multi-step update loop (pending marker → status=42 → BVerify failure → status=42 again) can exhaust the 5-start burst limit in under 10 seconds and put the service in `failed` state permanently until manual intervention.

*Default assumption:* `StartLimitBurst = 0` to allow unlimited restarts. The update loop self-terminates when the pending marker is cleared (either by Steam finishing the update or by the recovery helper). Unlimited restarts are appropriate for a kiosk service that must self-recover.

---

**Q6 (blocks I5) — Should `steam-guest-run` treat a failed `--apply` as a hard failure or continue with a warning?**

*Stakes:* `"$runtime_prep" --apply || true` means PV files are never wrapped if prep fails, but Steam starts anyway and fails games in a cryptic way. Changing to a hard failure (`set -e` + no `|| true`) means Steam won't start at all if prep fails — which is safer but blocks all Steam use for any prep failure including transient ones.

*Default assumption:* change to `"$runtime_prep" --apply` (no `|| true`) and let the service's `Restart=on-failure` handle transient failures. Log the error to stderr so `journalctl -u korri-steam-gamescope` shows the prep failure as the root cause.

---

## Recommended Next Steps

**Before any code lands (unblock critical blockers first):**

1. **Resolve Q2** — test whether `steam_client_steamdeck_stable_linuxarm64` manifest publishes zip entries. Do this with a one-off `curl -fsSL https://client-update.fastly.steamstatic.com/steam_client_steamdeck_stable_linuxarm64 | strings | grep bins_linuxarm64` on a device with network access. The result determines whether the seed download URL changes or stays on `publicbeta`.

2. **Resolve Q1** — decide the first-boot PV-wrapping mechanism. Pick option (a), (b), or (c) and encode it explicitly before writing any path-watcher code. The choice materially changes what new services are needed.

3. **Plan the atomic commit boundary** — the module-check.nix assertion change (C3) and the nixos-module.nix path-watcher change must land in the same commit. Confirm both are in the same implementation unit.

**Implementation order (respecting dependencies):**

4. Change `steam-package-contract.sh` assertions (C4) — update `grep -q 'publicbeta'` to check for `STEAM_BETA` variable usage. This must land before or with the script changes.

5. Add `betaChannel` NixOS option and propagate it through seed service env, launcher installed-file check (as Nix-eval-time interpolation, not `$STEAM_BETA` runtime var — M2), and module-check fixture (M3).

6. Separate path watchers — create `korri-steam-proton-prep.path` + `korri-steam-proton-prep.service`, update `korri-steam-runtime-prep.path` to exclude PV files (or remove it), update module-check.nix assertions atomically (C3).

7. Add `StartLimitBurst = 0` to `korri-steam-gamescope.service` (I4, Q5).

8. Remove `|| true` from `steam-guest-run` prep call (I5, Q6).

9. Implement `korri-steam-recover` helper including IPC handle cleanup (I3) and user-service stop machinery (I7).

10. Update `manifest.nix` (M1) — align provenance URL with the resolved channel policy from step 1.

11. Add `--patch-proton` smoke test to `check.nix` (M5).

**Before declaring done:**

- Verify `just test-nix` passes with the new module-check assertions.
- Verify `just typecheck && just test-unit && just lint` green.
- Verify on a freshly seeded device that the first Proton game launch succeeds (the first-boot PV-wrapping flow from Q1).
- Verify `cat /var/lib/korri/steam/package/beta` returns `steamdeck_stable` after the seed service runs.
- Verify that after Steam self-updates SteamLinuxRuntime_sniper, the gamescope service stabilizes (no BVerify loop).
