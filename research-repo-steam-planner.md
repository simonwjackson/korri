# Steam Planner Productization — Repository Research

**Scope:** architecture · patterns · conventions  
**Date:** 2026-06-14  
**Task:** Productize the mutable Bandai Steam planner handoff into source-controlled TypeScript/Bun argv/env planner + tiny shell exec wrapper, with Nix-resolved runtime paths, stable deployment target, and test coverage.

---

## Architecture & Structure

### Where the Steam stack lives today

```
tools/device/steam/
  korri-steam-gamescope-launch.sh         ← mutable prototype wrapper (the thing to productize)

product/platform/stream/
  steam-launch-spec.ts                    ← typed Steam AppID parser + LaunchSpec renderer
  steam-launch-spec.test.ts

product/platform/library/config/
  steam-state-materializer.ts             ← VDF mutation + lifecycle orchestration (TypeScript)
  steam-state-materializer.test.ts

product/systems/nixos/modules/
  korri-steam.nix                         ← policy module: services, helpers, reconcile scripts

product/vendor/steam-korri/
  package.nix                             ← guest Steam FHS capsule + helper scripts derivation
  scripts/steam-guest-{run,native,runtime-prep,...}
  tests/steam-package-contract.sh         ← Nix-native package contract check
```

The `korri-steam-app` script (in `korri-steam.nix`) is the current foreground runner. It hard-codes the target `LaunchOptions` string at line 577:

```bash
gamescope_launch_options="/run/current-system/sw/bin/bash \
  /var/lib/korri/bin/korri-steam-gamescope-launch --appid $appid -- %command%"
```

The referenced `/var/lib/korri/bin/korri-steam-gamescope-launch` does **not yet exist** as a Nix-installed path — it is the handoff target. The prototype is `tools/device/steam/korri-steam-gamescope-launch.sh` (lives in the repo as a `#!/usr/bin/env -S nix shell ...` script).

### Key architectural decisions already in place

1. **LaunchSpec is the composition contract.** Everything produces or consumes `LaunchSpec` (`product/platform/library/launcher.ts`). It is an Effect Schema struct: `{ command, args, env?, envUnset?, cwd? }`. Launchers receive it as an array — no shell concatenation.

2. **GamescopePolicy drives argv generation.** `product/platform/stream/gamescope-launch-spec.ts` converts a `GamescopePolicy` + inner `LaunchSpec` into a gamescope-wrapped `LaunchSpec`. This is the model to emulate for a Steam-gamescope planner.

3. **Mutable state is owned by TypeScript, not shell.** `steam-state-materializer.ts` owns VDF parsing, LaunchOptions writing, and lifecycle sequencing (shutdown → write → start → ready). It is already well-tested with an in-memory FS seam.

4. **Shell wrappers are thin execs.** The pattern for shell scripts that own a product exec boundary is `pkgs.writeShellScriptBin "name" ''...''` in Nix, wrapping a Bun-compiled or installed binary. The shell never does logic — it is a thin `exec` dispatcher. See `korri-steam-guest`, `korri-fakesuspend-toggle`, etc.

5. **Nix resolves runtime paths.** All Nix-owned scripts use fully-qualified store paths interpolated by Nix: `${pkgs.coreutils}/bin/install`, `${pkgs.gamescope}/bin/gamescope`. No `/nix/store` scanning. The prototype's `find /nix/store` hack must move to Nix-interpolated references.

6. **`/var/lib/korri/bin/` is the deployment target.** The `korri-steam.nix` hard-codes this path for the reconcile target. It is `runtime.stateRoot` + `/bin/`. Currently no Nix module creates or populates that directory.

---

## Implementation Patterns

### Pattern: typed planner → shell exec (the gamescope model)

The precedent for "TypeScript planner produces argv, shell performs exec" is `gamescope-launch-spec.ts` + `shell-launcher.ts`:

```
GamescopePolicy  →  composeGamescopeLaunchSpec(inner, policy)  →  LaunchSpec
                                                                        ↓
                                                              ShellLauncher.run(spec)
                                                                 (Bun.spawn array)
```

For the Steam-gamescope handoff the shape is:

```
SteamGamescopePlan  →  composeSteamGamescopeLaunchSpec(context)  →  LaunchSpec
  { appId, gamescope, LD_PRELOAD strip policy, runtime paths }        ↓
                                                              shell wrapper exec
                                                            (Bun is NOT the parent)
```

Because Bun must not be the game's parent process, the hand-off looks like:

1. TypeScript planner computes `argv[]` and `env{}` (pure function, fully tested).
2. A NUL-delimited plan file (`argv0` file + `env0` file) is written to a temp path.
3. A thin `sh -c exec` wrapper reads those files and calls `exec` — it is the game's actual parent.

Or more simply: the TypeScript process forks the shell wrapper via `Bun.spawn(["sh", "-c", "exec gamescope ..."])` **without waiting** for it, then exits. The shell wrapper inherits exec and becomes PID 1 of the game process tree.

### Pattern: Nix-packaged shell wrapper from repo source

Two patterns exist in the repo:

**`pkgs.writeShellScriptBin` (inline script, path-interpolated)**
```nix
steamUinputPrep = pkgs.writeShellScriptBin "korri-steam-ensure-uinput" ''
  set -eu
  ${pkgs.coreutils}/bin/chgrp input /dev/uinput
'';
```
Used for policy scripts that need full Nix path interpolation. Tools must be explicitly listed.

**`steamHelpers` derivation with `installPhase` (from repo source files)**
```nix
steamHelpers = stdenvNoCC.mkDerivation {
  pname = "steam-korri-helpers";
  src = ./.;
  installPhase = ''
    install -Dm755 scripts/steam-guest-run "$out/bin/steam-guest-run"
    wrapProgram "$out/bin/steam-guest-run"
      --prefix PATH : ${lib.makeBinPath [ bash coreutils ]}
  '';
};
```
Used for vendored scripts with a stable API surface.

**For the new wrapper**, both patterns compose: the TypeScript planner compiles to a Bun-runnable binary (or is invoked with `bun run`), and a thin Nix-wrapped shell script at `/run/current-system/sw/bin/korri-steam-gamescope-launch` calls the planner and then `exec`s the result.

The `/var/lib/korri/bin/` path is the reconcile target (written by `korri-steam-app`). A `systemd.tmpfiles.rules` entry creates the directory; a `system.activationScripts` or a oneshot service copies/symlinks from `/run/current-system/sw/bin/korri-steam-gamescope-launch` into `/var/lib/korri/bin/`.

### Pattern: test conventions for argv planners

All planner tests in the repo use **bun:test** with real in-memory implementations, not mocks:

```ts
// gamescope-launch-spec.test.ts pattern:
it("renders structured flag groups in deterministic order", () => {
  const spec = composeGamescopeLaunchSpec(game, { ... })
  expect(spec.args).toEqual([ "--backend", "wayland", "-f", ... ])
})
```

Steam-materializer tests inject configurable seams:
```ts
// steam-state-materializer.test.ts pattern:
const memoryFs = (initial = {}) => { ... }  // real FS contract, in-memory
const lifecycle = (events: string[]): SteamLifecycle => ({ ... })  // records events
const inlineLock: SteamStateLock = { withLock: async (_key, run) => run() }
```

**Test file naming:** `<unit>.test.ts` co-located with the source file.

**No `Mock*`/`Fake*`/`Stub*` prefixes.** Test doubles are described by behavior: `memoryFs`, `lifecycle`, `inlineLock`.

### Pattern: LD_PRELOAD strip policy

The existing wrapper already defines the strip/restore pattern:
```bash
local original_ld_preload="${LD_PRELOAD:-}"
unset LD_PRELOAD
# ... host-side gamescope setup ...
if [[ -n "$original_ld_preload" ]]; then
  child_command=("env" "LD_PRELOAD=$original_ld_preload" "${child_command[@]}")
fi
```

This is the policy that tests must cover:
- Strip `LD_PRELOAD` from Gamescope's environment (host-side) — prevents Steam overlay from being injected into host gamescope/mangoapp.
- Restore `LD_PRELOAD` on the inner `env` command for the Proton child.
- When `LD_PRELOAD` is empty, do not inject an `env` wrapper at all.

### Pattern: NUL-delimited plan files

The repo does not currently use NUL-delimited argv/env plan files — this is a new pattern. The prior art for exec-handoff without Bun as parent is `shell-launcher.ts`'s `Bun.spawn` which already uses array-form argv. For the exec-without-parent case, the idiomatic approach is:

1. TypeScript serializes `argv[]` as NUL-separated bytes to a temp file (e.g., `/run/korri/launch-artifacts/<id>/steam-plan-argv`).
2. TypeScript serializes `envKey=envVal` pairs NUL-separated to another temp file.
3. The shell wrapper calls `exec` with `xargs -0 < argv-file` or reads via bash `mapfile -d ''`.
4. Cleanup uses `runtime.launchArtifactsDir` (`/run/korri/launch-artifacts`) which already exists per `korri-setup.nix`.

---

## Documentation Insights

### Contribution/style rules (AGENTS.md)

Critical conventions that govern this work:

1. **Read before you touch.** Do not propose changes to code you have not read. Check a nearby similar feature first and follow the local pattern.
2. **Do exactly what was asked. No bonus refactors.**
3. **Never create documentation or Markdown files unless explicitly requested.**
4. **Test/verify commands:** `just typecheck` (whole-repo, path aliases), `just test-unit`, `just lint`, `just format`. TypeScript type-checking is always whole-repo.
5. **Product documentation shape:** plans under `docs/plans/`, solutions under `docs/solutions/`.

### Testing split (from Tooling conventions)

**TypeScript tests** own: argv template expansion, NUL-delimited file format, LD_PRELOAD strip/restore policy, plan file serialization/deserialization, pure adapter behavior.

**Nix checks** own: package attribute exposure, script presence, wrapper correctness, `/var/lib/korri/bin/` symlink or copy integrity, LaunchOptions reconcile target string correctness.

Shell smoke tests (like `steam-package-contract.sh`) own: contract invariants that can be checked structurally without device access.

### Effect Schema as source of truth

New plan types must be declared as Effect Schema structs. Wire serialization of plan files should use `Schema.encodeSync` / `Schema.decodeUnknownSync`. Errors are `Data.TaggedError` with `_tag` discrimination.

---

## Issue Conventions

*(GitHub issue templates were not found in `.github/ISSUE_TEMPLATE/` — not applicable for this scope.)*

---

## Templates Found

No PR or issue templates were found. The repo uses direct commits with conventional-commit messages (`fix(steam):`, `feat(steam):`, `refactor(steam):`), as visible in the recent commit log.

---

## Recommendations for Implementation

### 1. Where the planner TypeScript module lives

Follow the `gamescope-launch-spec.ts` precedent:

```
product/platform/stream/
  steam-gamescope-launch-plan.ts         ← new planner (pure function, tested)
  steam-gamescope-launch-plan.test.ts    ← co-located test
```

Or, given it is specific to the Steam device service rather than a generic platform stream primitive:

```
product/services/device/
  steam-gamescope-launch-plan.ts
  steam-gamescope-launch-plan.test.ts
```

**Decision aid:** if the planner only consumes `LaunchSpec` + `GamescopePolicy` + env-strip policy and produces a new `LaunchSpec` (no device-specific imports), it belongs under `product/platform/stream/`. If it needs Steam-specific runtime facts (gamescope binary path resolution policy, AppID context), it belongs under `product/services/device/`.

### 2. Plan type shape

```ts
// product/platform/stream/steam-gamescope-launch-plan.ts
export interface SteamGamescopeLaunchContext {
  readonly appId: string                     // validated numeric string
  readonly gamescope: GamescopePolicy        // resolved from cascade
  readonly gamescopeCommand: string          // Nix-resolved binary path
  readonly mangoappDir: string               // dirname of mangohud for PATH
  readonly glLibraryPaths: readonly string[] // /run/opengl-driver/lib + libglvnd dirs
  readonly ldPreload: string | undefined     // captured from caller env
  readonly xdgRuntimeDir: string             // from env, with fallback
}

export interface SteamGamescopeLaunchPlan {
  readonly argv: readonly string[]           // [gamescope, ...gamescopeArgs, --, env?, ..., protonChild...]
  readonly env: Record<string, string>       // gamescope process env
  readonly envUnset: readonly string[]       // ["LD_PRELOAD", "MANGOHUD", ...]
  readonly childArgv: readonly string[]      // after "--" in argv, for test assertion
  readonly restoredLdPreload: string | undefined  // value to restore in child via env(1)
}

export function composeSteamGamescopeLaunchPlan(
  steamCommand: readonly string[],          // Steam-expanded %command% argv
  context: SteamGamescopeLaunchContext,
): SteamGamescopeLaunchPlan { ... }
```

### 3. Shell wrapper shape (Nix-packaged)

The shell wrapper should be a `pkgs.writeShellScriptBin` in `korri-steam.nix` (or a separate derivation file):

```nix
steamGamescopeLaunchWrapper = pkgs.writeShellScriptBin "korri-steam-gamescope-launch" ''
  set -eu
  exec ${bunBin} run ${plannerEntrypoint} "$@"
'';
```

Or, if using NUL-plan files, a wrapper that reads the plan and calls `exec`:

```nix
steamGamescopeLaunchWrapper = pkgs.writeShellScriptBin "korri-steam-gamescope-launch" ''
  set -euo pipefail
  plan_file="$(${plannerBin} "$@")"   # TypeScript planner emits plan path to stdout
  exec ${pkgs.bash}/bin/bash -c "$(${pkgs.coreutils}/bin/cat "$plan_file")"
'';
```

The key constraint: **bash must be the process that calls `exec gamescope`**, not Bun/Node. This makes bash (or sh) the direct parent, and gamescope replaces it via exec.

### 4. Stable deployment target

The current hard-coded LaunchOptions target:
```
/run/current-system/sw/bin/bash /var/lib/korri/bin/korri-steam-gamescope-launch --appid $appid -- %command%
```

`/run/current-system/sw/bin/` is already the stable path for system-profile binaries. The module should:

1. Add `steamGamescopeLaunchWrapper` to `environment.systemPackages` so it lands in `/run/current-system/sw/bin/korri-steam-gamescope-launch`.
2. Remove the `/var/lib/korri/bin/` indirection (it adds no value over `/run/current-system/sw/bin/`) **or** populate it via a `systemd.tmpfiles.rules` symlink:
   ```nix
   "L /var/lib/korri/bin/korri-steam-gamescope-launch - - - - /run/current-system/sw/bin/korri-steam-gamescope-launch"
   ```
3. Update the `gamescope_launch_options` variable in `steamAppLauncher` to reference the stable `/run/current-system/sw/bin/bash /run/current-system/sw/bin/korri-steam-gamescope-launch` form.

### 5. Tests to write (TypeScript)

Following the `compose-launch-spec.test.ts` and `gamescope-launch-spec.test.ts` patterns:

```ts
describe("composeSteamGamescopeLaunchPlan — argv template expansion", () => {
  it("places gamescope args before -- and steam command after --")
  it("renders -w/-h from GamescopePolicy display.nested dimensions")
  it("renders --mangoapp from GamescopePolicy steam.mangoapp")
  it("prepends GL library paths to LD_LIBRARY_PATH in env")
  it("adds mangohud bin dirname to PATH in env")
})

describe("composeSteamGamescopeLaunchPlan — LD_PRELOAD strip/restore", () => {
  it("strips LD_PRELOAD from gamescope env when present in caller env")
  it("wraps child command with env(1) to restore LD_PRELOAD")
  it("does not inject env(1) wrapper when LD_PRELOAD was absent")
  it("strips MANGOHUD from gamescope env unconditionally")
})

describe("composeSteamGamescopeLaunchPlan — NUL-delimited plan files", () => {
  it("serializes argv as NUL-delimited bytes with correct token count")
  it("serializes env as NUL-delimited KEY=VALUE pairs")
  it("round-trips argv through write → read without truncation or extra tokens")
})

describe("no-Bun-parent handoff", () => {
  it("the plan's first argv token is the gamescope binary, not bun or node")
  it("exec chain: shell wrapper calls exec with plan argv — no intermediate node process")
})
```

### 6. Nix checks

Following `steam-package-contract.sh` pattern:

```bash
# In product/vendor/steam-korri/tests/ or product/systems/nixos/flake/checks.nix
# Check that wrapper is in the derivation output
[ -x "$out/bin/korri-steam-gamescope-launch" ] || fail "missing wrapper binary"
# Check that the wrapper does NOT embed /nix/store/ paths directly
grep -r '/nix/store' "$out/bin/korri-steam-gamescope-launch" \
  && fail "wrapper must not hardcode store paths"
```

Or as a Nix check in `product/systems/nixos/flake/checks.nix`:

```nix
korri-steam-gamescope-launch-contract = pkgs.runCommand "check-steam-wrapper" {} ''
  wrapper="${steamGamescopeLaunchWrapper}/bin/korri-steam-gamescope-launch"
  test -x "$wrapper" || (echo "missing wrapper" && exit 1)
  echo "ok" > "$out"
'';
```

### 7. Key files to read before editing

Before touching anything, read these in order:

1. `product/platform/stream/gamescope-launch-spec.ts` — the compositional model to follow
2. `product/platform/stream/gamescope-launch-spec.test.ts` — test style to match
3. `product/platform/library/launcher.ts` — `LaunchSpec` definition and `launchEnvironment`
4. `product/platform/library/config/inheritable-fields.ts` (lines 330–465) — `GamescopePolicy` schema
5. `tools/device/steam/korri-steam-gamescope-launch.sh` — the prototype being productized
6. `product/systems/nixos/modules/korri-steam.nix` (lines 540–600) — deployment target and LaunchOptions reconcile logic
7. `product/vendor/steam-korri/package.nix` — Nix packaging pattern for scripts

### 8. Boundary clarifications

- **The TypeScript planner is pure.** It takes inputs and returns a plan. It does not read `process.env` directly — callers pass the relevant env values as typed context. This makes it fully testable without environment stubbing.
- **The shell wrapper is the boundary.** It reads `process.env` and calls the planner. It is thin and untested by TypeScript tests; Nix smoke tests verify it exists and is executable.
- **Nix resolves all binary paths.** Gamescope path, mangohud path, bash path — all come from Nix interpolation in the `writeShellScriptBin` context. The TypeScript planner receives them as constructor arguments (or module-level env constants injected by the wrapper).
- **No `/nix/store` scanning in TypeScript.** The prototype's `find /nix/store` logic lives in the shell wrapper and must be replaced by Nix path interpolation before the wrapper is installed.
- **Steam lifecycle (VDF mutation, restart) stays in `steam-state-materializer.ts`.** The gamescope launch planner does not own VDF writes — those are already separated.

### 9. Effect/Schema integration (if graduating to Effect service)

If the planner needs to be available as an Effect service (e.g., consumed from the sessiond launch path), follow the naming conventions:

```ts
class SteamGamescopePlanner extends Context.Service<SteamGamescopePlanner, PlannerShape>()("SteamGamescopePlanner") {}
const SteamGamescopePlannerLayerLive = Layer.succeed(SteamGamescopePlanner)({ ... })
const SteamGamescopePlannerLayerMemory = ...  // configurable test double
```

For the initial productization, a pure function module (no Effect wrapper) is simpler and matches the `gamescope-launch-spec.ts` pattern.

---

## Summary Table: Existing Seams to Compose

| Concern | Existing module | Notes |
|---|---|---|
| LaunchSpec type | `product/platform/library/launcher.ts` | Schema.Struct; use as output type |
| GamescopePolicy type | `product/platform/library/config/inheritable-fields.ts` | `GamescopePolicy` Schema |
| Gamescope argv rendering | `product/platform/stream/gamescope-launch-spec.ts` | `composeGamescopeLaunchSpec(inner, policy)` |
| LaunchSpec → Bun spawn | `product/platform/library/shell-launcher.ts` | `createShellLauncher()` |
| VDF mutation | `product/platform/library/config/steam-state-materializer.ts` | Already tested; do not duplicate |
| Steam AppID parsing | `product/platform/stream/steam-launch-spec.ts` | `parseSteamAppId(target)` |
| Launch artifact dir | `product/systems/nixos/modules/korri-runtime.nix` | `/run/korri/launch-artifacts` |
| Script → Nix packaging | `product/systems/nixos/modules/korri-steam.nix` | `pkgs.writeShellScriptBin` pattern |
| Fake game for tests | `tools/testing/fake-game.sh` | Real implementation, `KORRI_FAKE_GAME_EXIT` |
| Test double pattern | `product/platform/library/launcher-layer-memory.ts` | `createInMemoryLauncherLayer` |
