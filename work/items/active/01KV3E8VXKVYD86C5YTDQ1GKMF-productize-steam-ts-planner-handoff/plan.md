# Productize Steam TS planner handoff

## Status

- **Mode:** parked / superseded as of 2026-06-15.
- **Current decision:** Do not productize this per-game Gamescope LaunchOptions wrapper as a default path. Bandai validation showed the wrapper's Gamescope boundary breaks Stray/Steam Input; Steam-inside-Gamescope is the supported direction.
- **Preservation:** Keep the design below as recoverable research only. Reactivation must be opt-in behind `services.korri.steam.enableExperimentalPerGameGamescopeWrapper` and must preserve native app LaunchOptions, EULA keys, and unknown per-app Steam state.
- **Handoff:** `docs/handoffs/steam-launchoptions-wrapper-parked-2026-06-15.md`.

## Original Status

- **Mode:** `/se-plan`
- **Scope:** Productize the already-validated mutable Bandai prototype where a typed TS/Bun planner computes the Steam Gamescope launch plan and a tiny Bash handoff performs the final `exec`.
- **Out of scope:** Normalizing all foreground launch lifecycles under one supervisor; rewriting emulator/native/stream launch ownership; changing Korri catalog semantics; making Steam itself own the kiosk shell.
- **Deferred adjacent work:** Convert `korri-steam-launch-options` from inline Python-in-shell to TS/Bun after this seam is stable.

## Problem

Bandai now launches Steam AppIDs reliably through Steam-owned `LaunchOptions` that call:

```text
/run/current-system/sw/bin/bash /var/lib/korri/bin/korri-steam-gamescope-launch --appid <appid> -- %command%
```

The live prototype proved the preferred architecture:

1. Steam expands `%command%` and invokes Korri's wrapper with Steam's launch environment.
2. The wrapper captures Steam's `LD_PRELOAD`, unsets host-unsafe preload state, then calls a TS/Bun planner.
3. The planner computes Gamescope/MangoHud argv/env using typed inputs.
4. The wrapper reads a NUL-delimited plan and `exec`s the final Gamescope argv, so Bun is not the parent of Gamescope or the game.

This is still mutable state under `/var/lib/korri/dev` and references a raw `/nix/store/.../bun` path. Product code must move this into source/Nix while preserving the validated runtime behavior.

## Non-negotiable requirements

- Steam AppID launches continue to go through Steam `-applaunch` and per-AppID `LaunchOptions`; do not bypass Steam for Steamworks titles.
- `LaunchOptions` target stays stable as `/var/lib/korri/bin/korri-steam-gamescope-launch` during migration.
- Final hot-path process handoff remains Bash `exec`; Bun/TS computes only the plan and exits.
- Gamescope owns MangoHud via `gamescope --mangoapp`; do not restore `MANGOHUD=1`.
- Host tools (`bun`, `gamescope`, `env`, `coreutils`) must not inherit Steam's `LD_PRELOAD`.
- The Steam-expanded Proton/game command must receive Steam's `LD_PRELOAD` back when Steam provided it.
- Steam VDF writes remain owned by `korri-steam-app`/`korri-steam-launch-options`; Steam is stopped before writes.
- Bandai launch validation must use the real Korri Steam service wrappers, not raw `steam.sh` or raw `steamrtarm64/steam`.

## Architecture decisions

### D1. Handoff shape

Use the validated **shell-calls-Bun** shape:

```text
Steam LaunchOptions
  -> bash /var/lib/korri/bin/korri-steam-gamescope-launch --appid N -- <expanded Steam command>
      -> capture LD_PRELOAD; unset host preload
      -> bun planner CLI --appid N --out-dir <private temp dir> -- <expanded Steam command>
      -> read argv0/env0
      -> remove temp dir
      -> exec env <host env pairs> <gamescope argv...>
```

Do not use a Bun-spawns-shell detached variant for this slice; it adds PID/error semantics that are not needed.

### D2. Plan file format

Use raw NUL-delimited files because the consumer is Bash:

- `argv0`: final argv tokens, NUL-delimited.
- `env0`: host env `KEY=VALUE` pairs, NUL-delimited.
- The TS planner validates the in-memory `SteamGamescopeLaunchPlan` shape before writing; the wire format is intentionally shell-simple, not JSON.

The wrapper creates a per-launch private temp dir with mode `0700`, passes it to the planner, reads both files with Bash `mapfile -d ''`, then removes the temp dir before `exec`. Unique per-launch temp dirs avoid same-AppID races.

### D3. Stable deployment target

Keep the existing VDF target stable:

```text
/var/lib/korri/bin/korri-steam-gamescope-launch
```

Nix should install the real wrapper in the system closure and create a `systemd.tmpfiles` symlink under `/var/lib/korri/bin`. This avoids forcing every existing `LaunchOptions` entry to change during the migration. Add a module/check assertion that the `LaunchOptions` string and tmpfiles target remain consistent.

### D4. Nix owns executable/tool paths

The planner receives resolved tool paths from the Nix-generated wrapper/context, not by scanning `/nix/store` at runtime. Required context includes at least:

- `gamescopeCommand`
- `envCommand` (`${pkgs.coreutils}/bin/env`)
- `bunCommand`/bundled planner path handled by wrapper generation
- `glLibraryPaths`, defaulting to Nix-resolved libGL paths plus `/run/opengl-driver/lib`, with a module option for SM8550 overrides if needed
- `mangohudConfig`
- Gamescope size/refresh policy defaults

## Proposed source layout

Add a Steam launch planner under the device runtime source set:

```text
product/services/device/steam/steam-gamescope-launch-plan.ts
product/services/device/steam/steam-gamescope-launch-plan.test.ts
product/services/device/steam/steam-gamescope-launch-planner-cli.ts
product/services/device/nix/steam-gamescope-launcher.nix
product/vendor/steam-korri/tests/steam-gamescope-launcher-smoke.sh  # or adjacent wrapper smoke
```

`product/systems/nixos/flake/sources.nix` already includes `product/services/device` for device packages, so the planner can build with the existing Bun dependency cache pattern.

## Implementation units

### Unit 1 — Capture the planner contract in TypeScript

Create the typed planner core with no process spawning and no filesystem access:

```ts
interface SteamGamescopeLaunchContext {
  readonly appId: string
  readonly steamCommandArgv: readonly string[]
  readonly steamLdPreload: string | undefined
  readonly xdgRuntimeDir: string
  readonly dbusSessionBusAddress: string | undefined
  readonly waylandDisplay: string | undefined
  readonly display: string | undefined
  readonly gamescopeCommand: string
  readonly envCommand: string
  readonly glLibraryPaths: readonly string[]
  readonly mangohudConfig: string
  readonly gamescope: {
    readonly width: number
    readonly height: number
    readonly outputWidth: number
    readonly outputHeight: number
    readonly refreshRate?: number
    readonly extraArgs: readonly string[]
  }
}

interface SteamGamescopeLaunchPlan {
  readonly argv: readonly string[]
  readonly env: readonly string[] // KEY=VALUE pairs for host gamescope process
  readonly unset: readonly string[] // at least LD_PRELOAD and MANGOHUD
}
```

Planner behavior:

- Reject non-numeric AppIDs.
- Reject missing `steamCommandArgv` after `--`.
- Build host Gamescope argv with `--mangoapp`, fixed size/output policy, `--`, then the child command.
- If `steamLdPreload` is set, wrap the child command as:

  ```text
  <envCommand> LD_PRELOAD=<steamLdPreload> <steam-expanded-command...>
  ```

  so only the Steam-expanded command gets the preload back.
- Include `MANGOHUD_CONFIG=<configured value>` and `LD_LIBRARY_PATH=<glLibraryPaths joined by ':' plus any safe existing value if explicitly allowed>` in host env.
- Always include `LD_PRELOAD` and `MANGOHUD` in `unset`.
- Do not read `KORRI_GAMESCOPE_EXTRA_ARGS`; typed policy replaces shell-split env overrides.

Tests:

- Valid 30XX/Sonic/Downwell-style inputs produce Gamescope as first argv token.
- Steam-expanded command is preserved byte-for-byte as argv tokens.
- Steam `LD_PRELOAD` is absent from host env and restored only through child `envCommand` argv.
- `MANGOHUD=1` is never emitted; `--mangoapp` and `MANGOHUD_CONFIG` are emitted.
- Invalid AppID and empty command fail with typed errors.
- `KORRI_GAMESCOPE_EXTRA_ARGS` in the test process env has no effect.

### Unit 2 — Add the planner CLI and NUL serializer

Create `steam-gamescope-launch-planner-cli.ts`:

- Parses `--appid`, `--out-dir`, and `--` command tail.
- Receives Nix-resolved context via explicit flags/env generated by the wrapper, not by scanning `/nix/store`.
- Writes `argv0.tmp`/`env0.tmp`, then atomically renames to `argv0`/`env0`.
- Writes no shell-quoted strings; every value is a raw argv/env token ending in NUL.
- Emits concise errors to stderr and non-zero exits for validation failures.

Tests:

- Round-trip NUL files with spaces, quotes, percent signs, and Steam paths.
- Atomic output names are used; partial temp files do not masquerade as complete plans.
- Missing `--out-dir`, unwritable output, invalid AppID, and missing command fail.

### Unit 3 — Package the planner and Bash handoff wrapper

Add a Nix package derivation similar to `inputd.nix`:

- Bundle `steam-gamescope-launch-planner-cli.ts` with `bun build --target=bun`.
- Install bundled JS under `$out/share/korri-steam-gamescope-launcher/`.
- Install `$out/bin/korri-steam-gamescope-launch` as a Bash script using `${pkgs.bash}/bin/bash`.
- The wrapper invokes `${pkgs.bun}/bin/bun $out/share/.../planner.js`, never a raw prototype store path.
- The wrapper resolves `XDG_RUNTIME_DIR` fallback as `/run/user/$(id -u)` before invoking the planner.
- The wrapper captures `LD_PRELOAD`, unsets `LD_PRELOAD` and `MANGOHUD`, calls planner, reads `argv0`/`env0`, deletes the temp dir, and `exec`s:

  ```bash
  exec ${pkgs.coreutils}/bin/env "${env_pairs[@]}" "${argv[@]}"
  ```

- Keep a small `--help` path for diagnostics.

Smoke test:

- Use a fake Gamescope binary that records its own parent process and argv/env.
- Invoke the real wrapper against a fake expanded Steam command.
- Assert the final executed process is not parented by Bun/Node and that the fake Gamescope receives expected argv/env.
- Assert `LD_PRELOAD` is not visible to the fake Gamescope host process, but the child argv includes `env LD_PRELOAD=...` before the fake Steam command.

### Unit 4 — Integrate with `korri-steam.nix`

Wire the new package into the Steam module:

- Add module options for planner policy where product-specific tuning is needed:
  - `services.korri.steam.gamescope.width`
  - `height`
  - `outputWidth`
  - `outputHeight`
  - optional `refreshRate`
  - `extraArgs` as `listOf str`
  - `glLibraryPaths` as `listOf str`
  - `mangohudConfig`
- Add the launcher package to `environment.systemPackages`.
- Add tmpfiles entries:

  ```text
  d /var/lib/korri/bin 0755 <runtime.user> <runtime.group> -
  L /var/lib/korri/bin/korri-steam-gamescope-launch - - - - /run/current-system/sw/bin/korri-steam-gamescope-launch
  ```

  If tmpfiles symlink owner semantics are awkward, use a root-owned symlink; only executability matters.
- Keep `korri-steam-app`'s desired LaunchOptions string unchanged.
- Add a Nix/module check proving:
  - the wrapper is installed/executable;
  - the `/var/lib/korri/bin/...` symlink rule exists;
  - the desired LaunchOptions string references the symlink path;
  - `keepWarm` still defaults `KORRI_STEAM_APP_STOP_SERVICE_ON_EXIT=0` when enabled;
  - `korri-steam-launch-options` remains in the closure.

### Unit 5 — Retire mutable Bandai prototype state through deployment

After source/Nix tests pass:

1. Build Bandai system.
2. Switch Bandai.
3. Verify on device:

   ```bash
   readlink -f /var/lib/korri/bin/korri-steam-gamescope-launch
   /run/current-system/sw/bin/korri-steam-app 1029210
   ```

4. Confirm Steam `localconfig.vdf` still contains the stable wrapper target.
5. Confirm process tree for a launched Steam game is:

   ```text
   gamescope
     -> Steam launch wrapper / reaper / runtime / Proton / game
   ```

   with no Bun process left as a parent.
6. Screenshot/observe at least 30XX plus one of Downwell/Sonic/Caveblazers.
7. Leave the game running only if the user requested manual confirmation; otherwise clean up through the normal kill path.

Rollback:

- If productized wrapper fails on Bandai, restore the live symlink target to `/var/lib/korri/bin/korri-steam-gamescope-launch.pre-ts-proto` or revert the Nix switch. Do not edit VDF manually while Steam is running.

### Unit 6 — Documentation and cleanup

- Update or add a solution note documenting the productized handoff and why final `exec` remains in Bash.
- Mark the mutable prototype paths as retired in the active work item.
- Keep the lifecycle-supervisor backlog item parked and explicitly link it as follow-up.

## Verification plan

Local/unit:

```bash
bun test product/services/device/steam/steam-gamescope-launch-plan.test.ts
bun test product/services/device/steam/steam-gamescope-launch-planner-cli.test.ts
```

Nix/module:

```bash
nix build .#checks.x86_64-linux.korri-steam-module
nix build .#checks.x86_64-linux.steam-korri-check
# plus the new launcher package/check if exported separately
```

Known baseline:

- `just typecheck` is already red on unrelated pre-existing issues; do not use it as the sole gate for this slice.

Device acceptance:

- `korri-steam-runtime-verify` or equivalent read-only checks still pass.
- `/dev/uinput` remains `root:input 0660`.
- Warm Steam stays running after `korri-steam-app` returns.
- Steam AppID launch returns promptly through `app.library.launch`/sessiond managed spawn acknowledgement.
- Process/log checks show no Bun parent after wrapper exec.
- Visual confirmation for at least 30XX and one other AppID.
- Physical kill-current-game chord still kills the Steam foreground tree and leaves warm Steam alive.

## Risks and mitigations

- **LaunchOptions path drift:** Keep `/var/lib/korri/bin/...` stable and add Nix checks tying the desired VDF string to the symlink rule.
- **Host `LD_PRELOAD` contamination:** Wrapper unsets before Bun/Gamescope; tests assert restoration only inside child argv.
- **Same-AppID double launch race:** Unique per-launch temp dirs avoid plan-file collisions.
- **GL path mismatch on SM8550:** Make `glLibraryPaths` an explicit module option with Bandai override if defaults miss Freedreno/libGL.
- **Bash portability:** Use Bash explicitly; `mapfile -d ''` is not POSIX sh.
- **Silent planner failures:** Wrapper logs planner stderr and exits non-zero before `exec`; `korri-steam-app` timeout/log monitoring remains the outer guard.

## Acceptance criteria

- The mutable `/var/lib/korri/dev/korri-steam-launch-planner.ts` prototype is no longer required for launches.
- `/var/lib/korri/bin/korri-steam-gamescope-launch` is Nix-managed.
- Existing Steam `LaunchOptions` keep working without manual VDF edits.
- Unit and Nix/module checks cover the planner, serializer, wrapper deployment, and LaunchOptions target consistency.
- Bandai launches validated Steam AppIDs through the productized wrapper with Gamescope/MangoHud and no Bun parent.
