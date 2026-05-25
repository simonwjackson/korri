# Flow and edge-case analysis: default-on Gamescope foreground launch policy

Origin: `docs/brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md`

## Codebase context used

- Config cascade already treats `gamescope` as an inheritable tri-state policy in `korri/shared/library/config/inheritable-fields.ts` and merges it in `korri/shared/library/config/cascade-resolver.ts`.
- Stream prepare already carries resolved policy into launch intents via `korri/products/app/api/stream/prepare.rpc-handler.ts` and `tools/device/game-stream-launch-intent.ts`.
- The runner already wraps with the desired minimal command shape in `tools/device/game-stream-fullscreen.ts`, but `tools/device/game-stream-runner.ts` defaults missing policy to disabled.
- Local Moonlight currently bypasses resolved policy and session ownership: `korri/deploy/desktop/launch-bridge.ts` prepares the remote stream, then directly calls `korri/products/app/stream/moonlight-launcher.ts`.
- `tools/device/sessiond.ts` owns home/launch/restore lifecycle but accepts only a raw `LaunchSpec` today.
- `nix/modules/korri-game-stream.nix` makes Gamescope available for stream-runner hosts; `nix/modules/korri-kiosk.nix` does not yet provide a generic local-kiosk Gamescope path.

## Flow gaps to cover in the plan

### 1. Default policy boundary is ambiguous

If default-on is added only in stream prepare, manual launch intents and local Moonlight can still default off. If it is added only in the runner, resolved policy visibility is weak and `app.stream.prepare` cannot explain what will happen.

Plan should define one canonical normalization point and test all entry points against it:

- config resolution / resolved launch output,
- stream prepare intent creation,
- manual/static launch intent paths,
- local Moonlight foreground launch.

Key edge case: `gamescope: { args: [...] }` with no `enabled` should default to enabled while preserving args; explicit `enabled: false` must still win.

### 2. “System” vs host-machine opt-out is not the same concept

The existing cascade `system` layer is the game/content system layer, not necessarily the physical host machine. The requirement says host-machine/system opt-out, so planning must either:

- map host-machine default to global/platform-seeded config, or
- add an explicit host-machine policy layer.

Do not let planning silently use console-system records as the host-machine escape hatch.

### 3. `inherit: false` can accidentally drop the default

If default-on is modeled as a synthetic least-specific cascade layer, a more-specific layer with `inherit: false` but no `gamescope` field may erase the default and produce “no opinion.” That would reintroduce default-off behavior.

Plan should state whether default-on survives `inherit: false` unless explicitly disabled, or whether `inherit: false` intentionally resets to product defaults. The likely user-facing default should be: product default stays enabled unless a layer sets `enabled: false`.

### 4. Local Moonlight has two coupled launch phases

Current desktop launch flow prepares the remote host first, then starts local Moonlight. With default-on local wrapping and session ownership, a local launch failure after remote prepare can leave a pending remote intent that may be consumed by a later Moonlight connection.

Plan should cover terminal states after remote prepare succeeds but local foreground launch fails:

- whether stale prepared intents are acceptable because they expire,
- whether the client should cancel/quarantine the remote intent,
- what UI/status is shown for “prepared but local foreground launch failed.”

### 5. Foreground lifecycle cannot be tied to Gamescope success

Requirement R7 says disabling Gamescope must not disable foreground ownership. That means opt-out launches still need a way to identify/promote the child surface. Existing repair helpers mostly select Gamescope surfaces by app id/title/class.

Plan should cover the non-Gamescope foreground path explicitly:

- how the foreground owner finds an arbitrary child window,
- what happens when no surface appears before timeout,
- whether process exit without a surface is treated as success, failure, or cancellation,
- how Korri is restored in all cases.

### 6. Existing sessiond `/launch` is synchronous and stateful

`tools/device/sessiond.ts` only launches from `home`, stops the renderer, waits for the launched process, then restores Korri. Desktop bridge requests currently expect a quick response after spawning Moonlight.

Plan should decide how local foreground launches behave over HTTP:

- synchronous response after app exits,
- asynchronous accepted/started response with sessiond supervising in the background,
- or a separate foreground-launch controller.

Also cover double-launch while sessiond is `launching`, `game`, `restoring`, or `recovering`; it should reject or queue predictably, not spawn a second Gamescope window.

### 7. Moonlight fallback semantics can change under a wrapper

`korri/products/app/stream/moonlight-launcher.ts` currently tries `moonlight`, then optionally falls back to `nix run nixpkgs#moonlight-embedded`. If the command is wrapped as `gamescope -- moonlight ...`, the initial spawn may succeed even when the child command fails quickly, so fallback may not trigger unless startup observation treats early wrapper exit as failure.

Plan should decide and test whether fallback is preserved under Gamescope or deliberately disabled for appliance launches with a clear failure.

### 8. Minimal wrapper still needs preflight and availability behavior

Default-on makes `gamescope`, `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR`, and foreground repair dependencies part of the common path. Missing dependencies should fail before remote prepare where possible; otherwise the user can get a prepared remote intent but no local visible app.

Plan should include Nix/runtime checks for:

- stream-runner hosts through `nix/modules/korri-game-stream.nix`,
- local kiosk sessions through `nix/modules/korri-kiosk.nix`,
- platform images such as `nix/images/platforms/rocknix-sm8550.nix` and `nix/images/platforms/x86.nix`.

### 9. Direct library launch is a split-brain risk

`korri/products/app/api/library/launch.rpc-handler.ts` still uses `launchSpecFor`, which intentionally drops Gamescope policy. If `app.library.launch` remains a foreground app surface, it must move to policy-aware resolved launch; if it is not in scope, the plan should explicitly exclude it.

### 10. Preset/profile selection is not currently propagated through desktop remote prepare

`app.stream.prepare` supports user/preset/override, but `korri/deploy/desktop/launch-bridge.ts` and `korri/products/app/stream/remote-stream-client.ts` currently prepare by game id only. If opt-out “per profile/preset” must work from the desktop launch path, the plan must add selection propagation or explicitly defer UI/bridge support.

## Edge cases to preserve as planning requirements

- Explicit `enabled: false` at game, launcher, user, preset, `byLauncher`, or launch-time override beats default-on.
- `gamescope.args` without `enabled` means “use default enabled plus these args,” not “args ignored because enabled is absent.”
- Empty args means no extra args; default wrapper remains only `-f -b --`.
- More-specific empty args should not erase inherited args unless the config model deliberately adds a reset mechanism; current cascade concatenates args.
- `byLauncher` Gamescope opt-out applies only after final launcher resolution, including presets that switch launcher.
- Manual/static launch intents with missing Gamescope policy should not become an accidental default-off escape hatch unless explicitly scoped as developer-only.
- Stale or malformed launch intents must keep existing quarantine/requeue behavior; default-on should not weaken the trusted one-shot intent contract.
- Existing Gamescope windows must be ignored when repairing a newly launched surface; otherwise a second launch may focus an old window.
- If Gamescope starts but the child app immediately exits, startup observation should classify the launch as failed, not “started.”
- If foreground surface repair fails, the app should be cleaned up or the failure should be visible; it should not leave Korri hidden with an unmanaged child.
- If Gamescope is opted out and the app never creates a window, session restore should still happen.
- If local input preflight fails, do not prepare the remote stream intent first.
- If remote prepare succeeds but local Gamescope/Moonlight preflight fails, avoid leaving an opaque stale prepared state.
- Wrapping Moonlight must preserve Moonlight-specific env/args such as platform, mapping file, input device, app name, and host after the `--` child boundary.
- Sobo Moonlight `v4l2m2m` validation is a high-risk compatibility path even though the product default includes it; the narrow opt-out path must be easy to validate.

## Verification scenarios to add to the implementation plan

### Config and resolved policy

Target tests:

- `korri/shared/library/config/cascade-resolver.test.ts`
- `korri/shared/library/proseql/library-repository.test.ts`
- `korri/shared/library/proseql/proseql-library-source.test.ts`

Scenarios:

- No `gamescope` config anywhere resolves to enabled with no extra args.
- Args-only policy resolves to enabled and preserves the args.
- Explicit `enabled: false` at game, preset, launcher, user, and override disables wrapping.
- `inherit: false` without `gamescope` does not accidentally make the launch default-off, unless the plan explicitly chooses that behavior.
- `byLauncher` opt-out applies only for the resolved launcher, including a preset that changes launcher.

### Intent creation and stream prepare

Target tests:

- `tools/device/game-stream-launch-intent.test.ts`
- `korri/products/app/api/stream/prepare.rpc-handler.test.ts`
- `korri/products/app/api/server/prepare.rpc-handler.test.ts`
- `korri/products/app/stream/remote-stream-client.test.ts` if prepare payload changes.

Scenarios:

- Prepared stream intent includes default enabled Gamescope when no layer configures it.
- Prepared stream intent includes disabled Gamescope when a more-specific layer opts out.
- Prepared stream intent preserves configured args and does not add scaling/filter args by default.
- Manual/static intent path either defaults enabled or is explicitly documented/tested as requiring callers to pass resolved policy.
- Legacy remote prepare fallback behavior is deliberate: either policy-aware or explicitly treated as older-host compatibility with reduced guarantees.

### Runner wrapping and repair

Target tests:

- `tools/device/game-stream-fullscreen.test.ts`
- `tools/device/game-stream-runner.test.ts`

Scenarios:

- Enabled/default policy spawns `gamescope -f -b -- <child>` with no scaling/filter args.
- Extra args appear before `--`; child command and child args remain after `--` unchanged.
- Disabled policy spawns the raw child command and does not require Gamescope-specific repair prerequisites.
- Missing session env fails before spawning when wrapping or repair requires it.
- Existing Gamescope window ids are ignored and the newly launched Gamescope surface is repaired.
- Repair failure requeues/quarantines/cleans up consistently with existing runner semantics.
- Session lifecycle launches with `wait` wrap only the launch command unless the plan deliberately says otherwise.

### Local Moonlight and launch bridge

Target tests:

- `korri/deploy/desktop/launch-bridge.test.ts`
- `korri/products/app/stream/moonlight-launcher.test.ts` or `tools/cli/moonlight-launcher.test.ts`
- `korri/shared/library/session-launcher.test.ts` if sessiond routing is reused.
- `tools/device/sessiond.test.ts` if sessiond accepts wrapped/resolved foreground launches.

Scenarios:

- Desktop launch does local input preflight before remote prepare.
- Desktop launch prepares remote stream before local foreground launch.
- Default local Moonlight launch is Gamescope-wrapped with minimal args.
- Moonlight opt-out launches unwrapped but still through foreground ownership.
- Moonlight platform, mapping, input-device, host, and app-name args stay on the child side of the wrapper.
- Configured `KORRI_MOONLIGHT_COMMAND` and non-fallback appliance behavior still work when wrapped.
- Nix fallback behavior under wrapping is either preserved or intentionally rejected with a clear failure.
- If local foreground owner is configured but unavailable, the bridge fails closed and does not silently direct-spawn Moonlight.
- If remote prepare succeeds and local launch fails, response/status makes the partial state visible.
- Double-click/concurrent launch while foreground session is active rejects or queues according to the plan.

### Nix and platform wiring

Target checks/tests:

- `nix/modules/korri-game-stream.nix`
- `nix/modules/korri-kiosk.nix`
- `nix/images/platforms/rocknix-sm8550.nix`
- `nix/images/platforms/x86.nix`
- relevant Nix module/eval tests under `nix/tests`.

Scenarios:

- Stream runner hosts still include Gamescope and Sway tools.
- Kiosk foreground launches have Gamescope available without Sobo-specific app rules.
- Platform Moonlight env remains present after adding Gamescope availability.
- Build/eval failure is clear if Gamescope is unavailable for a target platform.

### Device validation

Manual/device scenarios for the plan:

- Sobo default local Moonlight stream launch: Gamescope surface is foregrounded and Korri restores afterward.
- Sobo same Moonlight launch with a narrow Gamescope opt-out: no Gamescope wrapper, still foregrounded, Korri restores.
- Generic non-Moonlight foreground executable: default wrapped and foregrounded.
- A known-bad wrapped app: narrow opt-out works without changing global defaults.
- Remote stream runner launch from Sunshine/Moonlight still consumes a fresh intent and does not replay a stale one.
