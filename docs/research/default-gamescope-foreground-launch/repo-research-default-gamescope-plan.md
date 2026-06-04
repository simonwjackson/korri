# Repo research: default Gamescope foreground launch policy

## Scope researched

Origin: `../../../work/01KSBMG31W82JBVJBJ5TT15MZN-feat-default-gamescope-foreground-launch/requirements.md`.

Focus areas: config cascade / resolved launch policy, game-stream runner Gamescope support, local Moonlight launch path, foreground/sessiond patterns, and Nix tool availability.

## High-signal findings

- The config cascade already has a first-class `gamescope` inheritable field. It resolves across `global → user → system → launcher → game → preset → ephemeral override`, deep-merges `gamescope.args`, and preserves explicit `enabled: false` as a more-specific override.
- The stream-launch path already carries resolved `gamescope` policy beside the `LaunchSpec` into the one-shot game-stream launch intent.
- The runner already knows how to wrap a `LaunchSpec` as `gamescope -f -b [args...] -- <command> <args...>` and repairs the resulting Gamescope Sway surface, but it currently treats missing policy as disabled.
- The local Moonlight path does **not** use the resolved launch policy or session ownership. It directly prepares the remote host, then spawns Moonlight locally from the desktop Bun process.
- `sessiond` already models the right home/launch/game/restore lifecycle for foreground ownership, but its current `/launch` contract accepts only a raw `LaunchSpec`; it does not carry Gamescope policy and current desktop Moonlight bypasses it.
- Nix tool availability is split: `services.korri.gameStream` installs `gamescope` and `sway` for the Sunshine runner path, but `services.korri.kiosk` / platform kiosk paths currently do not generally add `gamescope` for local foreground launches.

## Relevant files and current behavior

### Requirements / institutional guidance

- `../../../work/01KSBMG31W82JBVJBJ5TT15MZN-feat-default-gamescope-foreground-launch/requirements.md`
  - Product decision: Gamescope default-on for foreground app launches, minimal wrapper only, opt-out via normal config layers, foreground policy remains separate.
- `docs/briefs/2026-05-21-korri-config-cascade-brief.md`
  - Defines the cascade model and states policy fields like `gamescope` belong in the unified logical config tree.
  - Important nuance: existing `system` layer means game/platform system (`snes`, `gba`, etc.), not necessarily host machine. If the plan needs a true host-machine layer, that is a model extension; otherwise use `global` / platform-seeded config for host defaults.
- `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md`
  - Keep the two-layer boundary: Gamescope is a presentation adapter; session/kiosk policy owns focus/fullscreen/workspace/restore.
- `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`
  - Preserve the trusted one-shot launch intent workflow; do not turn Sunshine into per-game config.

### Config cascade / resolved launch policy

- `korri/shared/library/config/inheritable-fields.ts`
  - `GamescopePolicy` shape is `{ enabled?: boolean; args?: string[] }`.
  - Comments already document tri-state semantics: `true` wraps, `false` disables, absent inherits.
- `korri/shared/library/config/records/{global,user,system,launcher,game,preset}.ts`
  - All relevant layers inline `gamescope` from `InheritableLayer.fields.gamescope`.
- `korri/shared/library/config/ephemeral-override.ts`
  - Runtime override supports `gamescope` as the most-specific layer.
- `korri/shared/library/config/cascade-resolver.ts`
  - `foldGamescope` deep-merges policy; `enabled` is last-wins and `args` concatenate least-to-most specific.
  - `resolveLaunchContext` returns `gamescope` only when a layer contributed policy. With no policy anywhere, it currently returns no `gamescope` field.
- `korri/shared/library/config/resolved-launch-context.ts`
  - Keeps `gamescope` separate from `LaunchSpec`; this is the correct boundary because wrapping happens at execution time.
- `korri/shared/library/config/compose-launch-spec.ts`
  - Explicitly says Gamescope wrapping does not happen here.
- Existing tests:
  - `korri/shared/library/config/cascade-resolver.test.ts` already covers `enabled: false` overriding inherited `true`, args concat, preset and override contribution.
  - `korri/shared/library/config/inheritable-fields.test.ts` covers strict decoding and explicit false.
  - `korri/shared/library/config/ephemeral-override.test.ts` covers override gamescope decoding.

Planning implication: default-on can be added either as a product default injected after cascade resolution / at intent creation, or as a broad synthetic/default cascade layer. Prefer a visible policy boundary that still lets explicit `false` win. Be careful with `inherit: false`: if default-on is modeled as a less-specific cascade layer, `inherit: false` may accidentally drop the default unless intentionally handled.

### ProseQL library source and stream prepare

- `korri/shared/library/proseql/library-repository.ts`
  - `resolveLaunchForGame` loads the full snapshot, resolves context, composes the `LaunchSpec`, and returns `{ spec, gamescope? }`.
- `korri/shared/library/proseql/proseql-library-source.ts`
  - New path `resolveLaunchForGame` preserves `gamescope`; legacy `launchSpecFor` drops it.
- `korri/shared/library/library-services.ts` and `korri/shared/library/library-source.ts`
  - Service interfaces already expose full `ResolvedLaunch { spec, gamescope? }`.
- `korri/products/app/api/stream/prepare.rpc.ts`
  - Prepare payload already carries `userId`, `presetId`, and `override`.
- `korri/products/app/api/stream/prepare.rpc-handler.ts`
  - Resolves launch policy and writes `createLaunchIntent(resolved.spec, { gamescope: resolved.gamescope })`.
- `korri/products/app/api/server/prepare.rpc.ts` / `prepare.rpc-handler.ts`
  - Server-facing prepare RPC currently accepts only `{ id }`; it does not expose user/preset/override selection.
- Existing tests:
  - `korri/products/app/api/stream/prepare.rpc-handler.test.ts` asserts resolved Gamescope policy reaches the intent when configured.
  - `korri/products/app/api/server/prepare.rpc-handler.test.ts` asserts server prepare writes an intent but does not currently assert default Gamescope.
  - `korri/shared/library/proseql/library-repository.test.ts` asserts configured Gamescope policy is returned.
  - `korri/shared/library/proseql/proseql-library-source.test.ts` exercises resolved launch but does not assert Gamescope in the default case.

Planning implication: stream prepare is the cleanest place to make default-on visible in launch intents. Add tests for “no config still produces Gamescope enabled” and “game/preset/override false produces disabled.”

### Game-stream runner Gamescope support

- `tools/device/game-stream-launch-intent.ts`
  - Intent shape includes `gamescope?: GamescopePolicy` next to `launch`.
  - `createLaunchIntent` currently omits `gamescope` if policy has no opinion.
  - Commands in launch intents must be absolute.
- `tools/device/game-stream-fullscreen.ts`
  - `composeGamescopeLaunchSpec` already implements the desired minimal wrapper: `gamescope -f -b -- <game command> ...` plus configured extra args only.
  - `DEFAULT_GAMESCOPE_SELECTOR` finds Gamescope by app id/title/class.
  - `repairStreamSurface` focuses/fullscreens/border-removes by `con_id`.
- `tools/device/game-stream-runner.ts`
  - Current default is `const gamescope = launchClaim.intent.gamescope ?? { enabled: false }`.
  - Sway repair is enabled only when `gamescope.enabled === true`.
  - Preflight requires `XDG_RUNTIME_DIR` and `WAYLAND_DISPLAY` for Gamescope, plus `SWAYSOCK` when repair is enabled.
  - CLI enqueue path has no Gamescope flags; it creates a launch intent without policy.
- Existing tests:
  - `tools/device/game-stream-fullscreen.test.ts` covers wrapper args and Sway surface repair.
  - `tools/device/game-stream-runner.test.ts` covers enabled wrapping, fullscreen repair failure/requeue, missing session env failures, cleanup, locks, lifecycle, and status.
  - `tools/device/game-stream-launch-intent.test.ts` covers secure intent IO and absolute command validation but not default Gamescope policy.

Planning implication: the runner already contains most execution behavior. The plan should decide whether default-on is enforced in `createLaunchIntent`, stream prepare, the runner fallback, or a shared helper. Avoid creating a second wrapper implementation for the runner; reuse/rename `composeGamescopeLaunchSpec` if it becomes generic.

### Local Moonlight launch path

- `korri/deploy/desktop/launch-bridge.ts`
  - Desktop bridge flow is: input preflight → remote `prepareGame(controlUrl, id)` → local `launchMoonlight({ host })`.
  - Request payload is only `{ id }`; no user/preset/override/policy is passed through this bridge today.
  - The launch bridge is dependency-injected, so tests can assert wrapper/foreground calls without starting real processes.
- `korri/deploy/desktop/main.ts`
  - Wires `launchMoonlight({ host, runner: diagnosticMoonlightRunner })`.
  - `diagnosticMoonlightRunner` fire-and-forgets Moonlight, drains output, observes early exit, and unrefs the child. It does not wait for session exit or restore Korri.
- `korri/products/app/stream/moonlight-launcher.ts`
  - Builds Moonlight Embedded args from env/options: command, platform, mapping file, input device, `Korri Stream` app name, host.
  - Defaults to command `moonlight` with optional `nix run nixpkgs#moonlight-embedded` fallback when not appliance-pinned.
  - Appliance env can pin `KORRI_MOONLIGHT_COMMAND`, `KORRI_MOONLIGHT_CLIENT`, `KORRI_MOONLIGHT_MAPPING_FILE`, `KORRI_MOONLIGHT_PLATFORM`, etc.
  - No Gamescope option and no foreground/session owner integration.
- Existing tests:
  - `korri/deploy/desktop/launch-bridge.test.ts` covers prepare-before-Moonlight, host normalization, failure mapping, and input preflight.
  - `tools/cli/moonlight-launcher.test.ts` covers installed Moonlight, Nix fallback, appliance no-fallback command, InputPlumber preflight, SDL platform/input conflict, mapping file, and early exit.

Planning implication: local Moonlight is the main gap for “all foreground app launches.” Add a local foreground launch abstraction that can build a Moonlight `LaunchSpec`, wrap it with Gamescope by default, and route it through the session/foreground owner rather than direct fire-and-forget spawn. Watch fallback semantics: wrapping `moonlight` inside Gamescope may change the current Nix fallback behavior unless explicitly preserved in tests.

### Foreground / session ownership patterns

- `tools/device/sessiond-state.ts`
  - Models `stopped`, `starting`, `home`, `launching`, `game`, `restoring`, and `recovering`.
  - Home invariant repair focuses/fullscreens the Korri renderer and closes duplicate windows.
- `tools/device/sessiond.ts`
  - `/launch` only works from `home`; it stops the renderer, runs a launch spec, then relaunches/reconciles Korri home.
  - Current launch payload is `{ spec }`; no `gamescope` policy or already-resolved foreground metadata.
- `tools/device/sessiond-sway.ts`
  - Existing Sway helpers find Korri windows and build focus/fullscreen/border commands by `con_id`.
- `tools/device/game-stream-fullscreen.ts`
  - Has generic-ish surface wait/repair primitives but names are stream/Gamescope-specific.
- Existing tests:
  - `tools/device/sessiond.test.ts` covers start, authenticated control, launch/restore, non-zero app restore, launch rejection outside home, and stop.
  - `tools/device/sessiond-state.test.ts` covers state transitions and home invariant decisions.
  - `tools/device/sessiond-sway.test.ts` covers Sway tree parsing and repair commands.

Planning implication: sessiond is the right pattern for “session-owned,” but it is not yet wired into the desktop Moonlight path and does not yet own a generic foreground-app surface. A plan should either extend sessiond to accept/apply resolved Gamescope policy or wrap before calling sessiond, then use sessiond for lifecycle/restore. If an async launch API is needed so the bridge can return quickly, make that an explicit plan-time decision.

### Nix packaging / runtime availability

- `nix/modules/korri-game-stream.nix`
  - `services.korri.gameStream.gamescope.package` defaults to `pkgs.gamescope`.
  - `environment.systemPackages` includes the runner package, `cfg.gamescope.package`, `cfg.sway.package`, and `cfg.path`.
  - Wrapper exports display compatibility defaults and trusted runtime paths; Gamescope requires real session env.
- `nix/korri-game-stream.nix`
  - Builds runner/enqueue wrappers only; it does not bundle Gamescope into the package itself. Module PATH/system packages provide it.
- `nix/modules/korri-kiosk.nix`
  - Owns the appliance kiosk service, Sway config, session env, PATH, XDG roots, and input provider assertions.
  - Generated Sway config is minimal and has no generic foreground-app policy.
  - Default `path` is only `coreutils` and `dbus`; platform modules add more.
- `nix/images/platforms/rocknix-sm8550.nix`
  - Adds Sobo/ROCKNIX substrate packages including `moonlight-embedded`, Cemu, Sway utilities, etc., but not Gamescope.
  - Pins Moonlight platform env to `KORRI_MOONLIGHT_PLATFORM = "v4l2m2m"` and `SDL_VIDEODRIVER = "wayland"`.
- `nix/images/platforms/x86.nix`
  - Adds `moonlight-embedded`, input services, and Moonlight env, but not Gamescope.

Planning implication: remote stream runner hosts already get Gamescope via `services.korri.gameStream`; local kiosk/Moonlight foreground launches need Gamescope added to kiosk PATH/system packages through a generic product option, not as a Sobo-specific hack. Also validate whether `pkgs.gamescope` is available on the target aarch64/ROCKNIX substrate before relying on it there.

## Constraints / gotchas to preserve

- Do not reintroduce `KORRI_GAME_STREAM_USE_GAMESCOPE` or another hidden env-only product policy knob; policy belongs in resolved config/launch intent.
- Keep tool/session facts in Nix/env (`gamescope` availability, `swaymsg`, runtime dirs, `SWAYSOCK`, `WAYLAND_DISPLAY`) and user-facing policy in the config cascade.
- Existing `system` config records are console/platform systems, not host machines. If host-machine opt-out is required as a distinct layer, the plan must add or map that concept deliberately.
- Direct `app.library.launch` still uses `launchSpecFor` and drops Gamescope. If it remains a foreground launch surface, it must move to `resolveLaunchForGame` or a new policy-aware launch service.
- Local Moonlight fallback semantics are fragile under wrapping. Current behavior can fall back from `moonlight` to `nix run nixpkgs#moonlight-embedded`; wrapping the first attempt in Gamescope may require wrapping both installed and fallback attempts separately.
- Gamescope default-on will increase reliance on `XDG_RUNTIME_DIR`, `WAYLAND_DISPLAY`, and `SWAYSOCK`; missing session env should fail clearly before spawning.
- Prior Sobo Moonlight `v4l2m2m + SDL/Wayland` validation is a risk area. The new requirement explicitly includes Moonlight, but opt-out must remain narrow and easy if validation fails.

## Suggested implementation units and tests

### U1. Normalize default Gamescope policy at the launch-policy boundary

**Goal:** Make absent Gamescope policy resolve to default enabled, while preserving explicit `enabled: false` and inherited args.

**Likely files:**
- Modify: `tools/device/game-stream-launch-intent.ts` or a new shared policy helper under `korri/shared/library/config/`
- Modify: `korri/products/app/api/stream/prepare.rpc-handler.ts` if defaulting is applied at prepare time
- Test: `tools/device/game-stream-launch-intent.test.ts`
- Test: `korri/products/app/api/stream/prepare.rpc-handler.test.ts`
- Test: `korri/products/app/api/server/prepare.rpc-handler.test.ts`
- Test: `korri/shared/library/proseql/library-repository.test.ts`

**Test scenarios:**
- No configured Gamescope policy produces an intent with enabled Gamescope and no extra args.
- Configured args without `enabled` still default to enabled and preserve args.
- Explicit `enabled: false` from game/preset/override remains disabled.
- Server prepare does not expose host paths but writes an intent whose Gamescope policy reflects default/opt-out.

### U2. Preserve and harden runner wrapping/repair semantics under default-on policy

**Goal:** Ensure the runner wraps by default when the intent/policy says enabled, does not wrap when disabled, and keeps foreground/Sway repair separate from wrapping.

**Likely files:**
- Modify: `tools/device/game-stream-runner.ts`
- Modify: `tools/device/game-stream-fullscreen.ts` only if renaming/generalizing helpers
- Test: `tools/device/game-stream-runner.test.ts`
- Test: `tools/device/game-stream-fullscreen.test.ts`

**Test scenarios:**
- Enabled/default policy spawns `gamescope -f -b -- <absolute command> ...`.
- Extra policy args are inserted between `-b` and `--`.
- Explicit disabled policy spawns the raw command and does not require `SWAYSOCK` for Gamescope repair.
- Missing `XDG_RUNTIME_DIR` / `WAYLAND_DISPLAY` / `SWAYSOCK` fails before spawn when wrapping/repair requires them.

### U3. Add local Moonlight Gamescope wrapping without losing existing Moonlight options

**Goal:** Apply the same minimal default wrapper to local Moonlight launches, including appliance-pinned commands, mapping file, input device, platform flags, and startup observation.

**Likely files:**
- Modify: `korri/products/app/stream/moonlight-launcher.ts`
- Modify: `tools/cli/moonlight-launcher.ts` only remains a re-export shim
- Test: `tools/cli/moonlight-launcher.test.ts`

**Test scenarios:**
- Default Moonlight launch runs through Gamescope with `-f -b --` and no scaling/filter args.
- Explicit Gamescope disabled runs the current unwrapped Moonlight command.
- Appliance env (`KORRI_MOONLIGHT_COMMAND`, mapping file, input device, platform) appears after `--` as child Moonlight args.
- Nix fallback behavior is either preserved under Gamescope or intentionally disabled with a clear failure; whichever the plan chooses must be tested.

### U4. Route local foreground launches through session ownership

**Goal:** Stop the desktop bridge from treating Moonlight as a direct fire-and-forget sibling surface; launch it through a foreground/session owner that can restore Korri.

**Likely files:**
- Modify: `korri/deploy/desktop/launch-bridge.ts`
- Modify: `korri/deploy/desktop/main.ts`
- Modify/extend: `tools/device/sessiond.ts`
- Modify/extend: `tools/device/sessiond-state.ts`
- Modify/extend: `tools/device/sessiond-sway.ts` or generalize `tools/device/game-stream-fullscreen.ts`
- Test: `korri/deploy/desktop/launch-bridge.test.ts`
- Test: `tools/device/sessiond.test.ts`
- Test: `tools/device/sessiond-state.test.ts`
- Test: `tools/device/sessiond-sway.test.ts`

**Test scenarios:**
- Launch bridge still prepares the remote stream first, then asks the local foreground owner to launch Moonlight.
- If foreground owner/sessiond is configured but unavailable, the bridge fails closed instead of falling back to direct spawn.
- Foreground lifecycle restores Korri after a successful or failed foreground app exit.
- Disabling Gamescope does not disable foreground ownership.

### U5. Make local kiosk Gamescope available through Nix product wiring

**Goal:** Ensure local kiosk sessions that launch foreground apps have `gamescope` available, without putting hardware-specific policy in platform adapters.

**Likely files:**
- Modify: `nix/modules/korri-kiosk.nix` or add a generic foreground-launch option module
- Modify: `nix/images/platforms/x86.nix`
- Modify: `nix/images/platforms/rocknix-sm8550.nix`
- Possibly modify: `flake.nix` checks/packages if adding evaluation fixtures
- Test: existing or new Nix eval/check fixtures under `nix/tests/` or `tools/testing/nix/`

**Test scenarios:**
- Kiosk service PATH/system packages include Gamescope when foreground Gamescope default is enabled.
- Platform adapters do not hard-code app-specific foreground rules.
- Sobo/x86 kiosk env still includes Moonlight platform/input env after adding Gamescope availability.

### U6. Update direct library-launch path if it remains a foreground surface

**Goal:** Avoid a split brain where stream prepare honors Gamescope policy but `app.library.launch` drops it through `launchSpecFor`.

**Likely files:**
- Modify: `korri/products/app/api/library/launch.rpc-handler.ts`
- Modify: `korri/shared/library/library-services.ts`
- Modify: `korri/shared/library/session-launcher.ts` if sessiond must accept policy-aware launches
- Test: `korri/products/app/api/library/launch.rpc-handler.test.ts`
- Test: `korri/shared/library/session-launcher.test.ts`

**Test scenarios:**
- Direct library launch uses policy-aware resolution or is explicitly documented as not a foreground-app surface.
- Config failure diagnostics remain structured.
- Sessiond-enabled direct launch fails closed when sessiond is unavailable.

## Recommended planning shape

1. Start with the policy boundary (U1) and runner behavior (U2), because remote stream launches already have the data path and tests.
2. Add local Moonlight wrapping (U3), then wire it into session ownership (U4). Keep these separate so a wrapping regression is not confused with a foreground lifecycle regression.
3. Add Nix availability checks (U5) before device validation; otherwise default-on Gamescope will become a runtime `ENOENT` failure on kiosk images.
4. Decide explicitly whether `app.library.launch` is in-scope as a foreground launch surface (U6). If yes, make it policy-aware; if no, call it out in the implementation plan’s scope boundaries.

## Suggested verification commands

- `just test-unit`
- `just typecheck`
- `just lint`
- Relevant Nix eval/check target once the plan identifies the exact fixture/check to update.
- Device validation on Sobo with:
  - a default-on local Moonlight stream launch,
  - the same launch with a narrow Gamescope opt-out,
  - at least one non-Moonlight foreground executable.
