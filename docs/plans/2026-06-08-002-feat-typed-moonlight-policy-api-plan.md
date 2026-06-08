---
title: feat: Replace Moonlight Env Launch Config with Typed Policy
type: feat
status: completed
date: 2026-06-08
verify_command: "just test-unit && just typecheck && just lint"
---

# feat: Replace Moonlight Env Launch Config with Typed Policy

## Summary

Replace Korri's Moonlight Embedded launch configuration env ladder with a typed, cascade-inheritable `moonlight` policy that renders `moonlight stream` argv/env through one canonical path. The implementation will model upstream Moonlight Embedded stream options plus Korri's downstream patched flags, preserve fixed Korri product invariants (`stream`, `Korri Stream`, InputPlumber-required launches), and migrate platform defaults from `KORRI_MOONLIGHT_*` environment variables into readable config defaults.

---

## Problem Frame

Moonlight launch behavior is currently split across two option bags and multiple process-env readers: `composeMoonlightLaunchSpec` builds server-composed remote-source launches, while `launchMoonlight` builds CLI/desktop launches and adds local-control socket allocation, Nix fallback behavior, and different defaults. SM8550/x86 platform defaults are expressed as `KORRI_MOONLIGHT_*` service environment, so operators cannot review or override launch policy through the readable library cascade, and call sites can drift or infer behavior from argv instead of explicit policy.

---

## Requirements

- R1. Add a typed `MoonlightPolicy` schema to the readable config cascade, parallel to `GamescopePolicy`, and make it available from host/user/system/app/runtime/library/release/profile/override layers where inheritable launch policy is already accepted.
- R2. Replace `KORRI_MOONLIGHT_*` TypeScript env fallbacks with explicit typed policy inputs; old env names must not remain as a second public configuration channel.
- R3. Preserve Korri product invariants: Moonlight library launches always use the `stream` action, the Sunshine app name remains `Korri Stream`, the peer host is injected at launch time, and product launches require InputPlumber preflight rather than a user-authored `requireInputPlumber` toggle.
- R4. Model Moonlight Embedded stream argv as typed policy: command, process environment overlay, logging, stream dimensions/FPS/bitrate/packet size/codec/remote/unsupported/quit behavior, audio/game settings, key directory, platform name, input devices/mapping/view-only/rotation, audio device, windowed mode, and `extraArgs`. Environment unsets must be executable, not just cascade metadata.
- R5. Model Korri downstream Moonlight flags as typed policy: absolute touch, structured absolute-touch bounds, require-bounds fail-closed mode, and auto-window-resize.
- R6. Model local-control launch configuration as typed policy enough to replace `KORRI_MOONLIGHT_CONTROL*` for spawned sessions, without moving the Moonlight local-control protocol or command semantics into launch policy.
- R7. Define deterministic cascade merge semantics for every `moonlight` sub-object: scalars last-win, nested objects merge by leaf, input device lists and `extraArgs` concatenate in inheritance order, and nullable environment overlays preserve explicit unsets.
- R8. Render Moonlight argv/env from structured policy in one canonical renderer; no call site should hand-compose Moonlight flags, read `KORRI_MOONLIGHT_*`, or infer wrapper policy by sniffing Moonlight argv.
- R9. Wire remote-source launches through local launcher policy resolution so server-composed Moonlight sessions receive the same platform-level Moonlight defaults as CLI/desktop sessions for the local client host/launcher layers, including local-control env when enabled. Game/profile policy from the remote source remains owned by the source-machine prepare flow.
- R10. Keep launch policy separate from runtime-control APIs: runtime bitrate/FPS/resolution command contracts, accepted-vs-applied semantics, and touch-bounds command outcomes remain owned by `product/platform/stream/*control*` protocol modules.
- R11. Update examples, NixOS platform defaults, fixtures, and tests so checked-in config no longer depends on `KORRI_MOONLIGHT_*` for launch policy.

---

## Scope Boundaries

- Do not add or change Moonlight Embedded native patches in this plan; this is Korri config/API work over the currently shipped `moonlight-embedded-korri` package.
- Do not expose Moonlight actions other than `stream` in readable library policy.
- Do not expose Sunshine app name or host as user-authored policy in v1; `Korri Stream` and the selected peer host remain launch-time product inputs. This intentionally removes current `appName` override support from product launch paths, and implementation must update all tests/callers that used it.
- Do not expose Moonlight config-file load/save as product policy; those are CLI/tooling concerns.
- Do not support Moonlight resolution presets (`-720`, `-1080`, `-4k`) as public config; use explicit width/height only.
- Do not expose policy provenance fields such as `platform.source`; NixOS may derive defaults, but the rendered policy only carries the final value.
- Do not add a user-authored InputPlumber requirement toggle; product launches fail closed when the canonical input provider is required by the platform.
- Do not make local-control command capabilities user-configurable. The patched Moonlight binary advertises runtime capabilities; readable config may enable the socket and choose authority, but it must not claim command support the session does not advertise.
- Do not solve live physical-device validation in this plan; device validation can follow implementation.

### Deferred to Follow-Up Work

- Promote or remove spike-only `MOONLIGHT_RUNTIME_SETTINGS_MVP_*` adaptation policy after the runtime adaptation product model is decided. This plan may type the launch-time env hook if needed for migration, but it must not make connection-status adaptation the product quality policy.
- Broaden Moonlight pairing/list/quit/map into product workflows only if a future feature gives those actions a user-facing or agent-facing consumer.
- Enumerate Moonlight platform names as a closed schema only after the built/patched platform inventory is verified across deployed packages and hardware classes.

---

## Context & Research

### Relevant Code and Patterns

- `docs/brainstorms/2026-06-08-002-moonlight-policy-one-to-one.example.yaml` is the draft one-to-one readable policy shape and records the product cuts from user notes.
- `docs/plans/2026-06-08-001-feat-typed-gamescope-policy-api-plan.md` is the structural analogue and overlaps on `composeMoonlightLaunchSpec`, `moonlight-launcher.ts`, and launch handler call sites.
- `product/apps/portal/api/stream/compose-moonlight-launch-spec.ts` currently builds server-side `moonlight stream` launch specs from flat options and `process.env`.
- `product/apps/portal/stream/moonlight-launcher.ts` currently builds CLI/desktop Moonlight args from flat options and `globalThis.Bun?.env`, allocates local-control sockets, and still contains argv sniffing for `-platform wayland` to set Gamescope `exposeWayland`.
- `product/platform/library/config/inheritable-fields.ts` defines strict Effect Schema policy slots and is where `MoonlightPolicy` belongs.
- `product/platform/library/config/cascade-resolver.ts` already has specialized fold helpers and `resolveLocalLauncherGamescopePolicy`; Moonlight needs the equivalent local-launcher policy resolver.
- `product/platform/library/proseql/library-repository.ts` exposes launch-resolution APIs and currently has a deprecated `resolveLocalLauncherGamescopePolicy` seam that fails for some source implementations.
- `product/services/device/game-stream-launch-intent.ts` persists baked `LaunchSpec` values; Moonlight local-control env can ride in `LaunchSpec.env` rather than adding a second intent command surface.
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`, `product/systems/nixos/images/platforms/x86.nix`, `product/systems/nixos/images/kiosk.nix`, and `product/systems/nixos/images/live-usb-runtime.nix` currently carry Moonlight launch defaults as service environment.
- `product/vendor/moonlight-embedded-korri/README.md` documents Korri-owned downstream flags and env-driven local-control/runtime-settings hooks.

### Institutional Learnings

- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`: wrapper behavior should come from explicit cascade-folded policy, not argv/env sniffing heuristics.
- `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md`: Moonlight platform/video settings do not own foreground/session policy; sessiond remains lifecycle truth.
- `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`: Moonlight launches the stable `Korri Stream` Sunshine app and source-machine game identity is carried by launch intent.
- `docs/solutions/architecture-patterns/stream-control-command-outcome-contract-2026-06-03.md`: Moonlight runtime command ACK is not applied state; product outcome semantics stay separate from launch config.
- `docs/solutions/tooling-decisions/vendor-sdl2-mali-fbdev-for-moonlight-on-fbdev-only-handhelds-2026-05-28.md`: display backend/platform values vary by hardware and package build, so v1 should avoid a too-narrow closed enum.
- `docs/acceptance/runtime-settings-protocol-contract.md` and `docs/acceptance/sunshine-korri-runtime-resolution-2026-05-26.md`: runtime settings use operation-specific capability/readback semantics and must not be collapsed into launch-time policy claims.

### External References

- Moonlight Embedded v2.7.1 usage/help surface: source of upstream `stream` flags and action boundaries.
- Pinned nix-on-rocks Moonlight manifest: `.direnv/flake-inputs/d6cx7yxirkngmlryzrzf8kx29pv6m766-source/packages/moonlight-embedded/manifest.nix` documents base platform patch inventory and expected platforms.

---

## Key Technical Decisions

- **Make `moonlight` cascade-inheritable.** Moonlight launch policy is product behavior just like Gamescope launch policy. Keeping it as NixOS env would preserve the current inability to review or override stream launch defaults through readable config.
- **Break the `KORRI_MOONLIGHT_*` TypeScript fallback channel.** Keeping env fallbacks beside typed policy would leave two authorities with unclear precedence. Platform modules should render typed readable defaults instead.
- **Keep product invariants out of schema.** `stream`, `Korri Stream`, injected host, and InputPlumber-required preflight are Korri launch invariants, not user options. The schema should not expose controls the product does not intend to support.
- **Use explicit dimensions only.** Moonlight presets are aliases for dimensions and would add duplicate public spellings. The renderer can always emit `-width`/`-height`.
- **Keep `platform.name` open but non-empty.** The patched platform set depends on package build and hardware; a closed enum risks blocking valid `moonlight-embedded-korri` backends.
- **Treat local-control socket enablement as launch configuration, not runtime protocol configuration.** Policy can request socket env injection and authority; command availability still comes from Moonlight `hello`/`state` capabilities.
- **Keep the Moonlight renderer pure.** Input device discovery, local-control runtime-dir allocation, and peer host extraction are pre-steps; the renderer consumes resolved facts and returns `LaunchSpec`.
- **Represent env unsets explicitly in `LaunchSpec`.** Nullable policy env cannot be implemented by omission because spawned children inherit parent service env. Extend the launch contract with an explicit unset channel (for example `envUnset`) and teach spawners/intents to honor it.
- **Render local-control env before intent enqueue.** For remote-source server-composed launches, the RPC handler/launch adapter allocates the local-control handle and injects `MOONLIGHT_LOCAL_CONTROL_*` into `LaunchSpec.env` before sessiond/game-stream runner receives the baked spec.
- **Sequence after or coordinate with the typed Gamescope plan.** Both plans change the same Moonlight launch call sites. This plan should start from the post-Gamescope policy shape when possible; if implemented earlier, keep changes isolated so Gamescope U4 can still delete argv sniffing cleanly.

---

## Open Questions

### Resolved During Planning

- Should Moonlight readable policy include `action`? No. Product launches always use `stream`; pair/list/quit/map remain CLI workflows.
- Should Moonlight readable policy include app name/host? No. `Korri Stream` remains fixed and host is injected from the selected peer.
- Should Moonlight readable policy include config-file load/save? No. Those are Moonlight CLI tooling concerns, not Korri product policy.
- Should resolution include preset names? No. Use explicit dimensions only.
- Should `platform.source` or provenance live in config? No. The final platform value belongs in policy; how NixOS derived it is module implementation detail.
- Should `requireInputPlumber` be user-authored policy? No. Korri product launches require InputPlumber when the platform declares it; failure behavior belongs in launcher preflight.

### Deferred to Implementation

- Exact handling of `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_*`: implementation should decide whether to include a clearly experimental one-shot launch-hook sub-schema in v1 or leave those env vars as platform env until the follow-up runtime-settings plan, but it must not silently delete working SM8550 behavior. `adaptationSpike` is out of v1 readable policy either way.
- Exact local-control allocation helper names and home directory layout: choose names while touching `moonlight-launcher.ts` and the remote-source launch handler.
- Exact `MoonlightPolicy` location/export name: keep it in the config schema module unless implementation shows a stronger shared module boundary.

---

## Dependencies / Prerequisites

- Rebase or coordinate this plan against `docs/plans/2026-06-08-001-feat-typed-gamescope-policy-api-plan.md` after that plan's U1-U4 land. U4 of this plan must not start from call sites that still use the old flat `GamescopeOptions` shape unless the implementation deliberately carries both migrations in the same branch.
- Confirm the platform-default readable fragment mechanism exists before U5 starts. If the Gamescope plan has not added it yet, U5 must add the shared mechanism once rather than inventing a Moonlight-only path.
- Confirm whether `LaunchSpec` already gained an explicit env-unset mechanism from the Gamescope plan. If not, U3 owns adding it.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
readable YAML / generated platform defaults
  -> strict MoonlightPolicy decode
  -> cascade fold with leaf merge, env set/unset, list concat
  -> resolved host/local-launcher Moonlight policy
  -> launcher preflight
       - inject peer host
       - resolve InputPlumber virtual input device when required
       - allocate local-control runtime/socket env when enabled
  -> single Moonlight renderer
       - command = moonlight.command ?? package/default command
       - args = stream + typed flags + -app "Korri Stream" + host
       - env/envUnset = launch env + moonlight.environment + local-control env
  -> optional sibling Gamescope renderer wraps the Moonlight LaunchSpec
  -> sessiond / ForegroundSessionHost / game-stream intent executes baked LaunchSpec
```

Decision matrix for representative fields:

| Field | Public policy? | Rendered surface | Notes |
|---|---:|---|---|
| `command` | Yes | `LaunchSpec.command` | Replaces `KORRI_MOONLIGHT_COMMAND` |
| `action` | No | Always `stream` | Product invariant |
| `app.name` | No | Always `-app Korri Stream` | Product invariant |
| peer host | No | Final positional arg | Injected from selected source/control URL |
| `stream.resolution.width/height` | Yes | `-width`, `-height` | No preset alias |
| `platform.name` | Yes | `-platform` | Open non-empty value |
| input device | Resolved fact | `-input` | Launcher preflight owns discovery |
| `input.touch.*` | Yes | Korri downstream touch flags | Structured bounds serialize to `x,y,w,h` |
| `window.autoResize` | Yes | `-autowindowresize` / omitted | No Gamescope-dependent default |
| `control.enable/authority` | Yes | `MOONLIGHT_LOCAL_CONTROL_*` env | Protocol capabilities remain runtime facts |
| `control.commands` | No | Runtime capability advertisement | Rejected in readable policy |
| `gamescope` | Sibling policy | Gamescope renderer | Not nested under Moonlight |

---

## Implementation Units

### U1. Define the Moonlight Policy Schema

**Goal:** Add the typed readable `MoonlightPolicy` contract and strict validation for the public YAML shape.

**Requirements:** R1, R3, R4, R5, R6, R10

**Dependencies:** None

**Files:**
- Modify: `product/platform/library/config/inheritable-fields.ts`
- Modify: `product/platform/library/config/records/host.ts`
- Modify: `product/platform/library/config/records/user.ts`
- Modify: `product/platform/library/config/records/system.ts`
- Modify: `product/platform/library/config/records/launcher.ts`
- Modify: `product/platform/library/config/records/profile.ts`
- Modify: `product/platform/library/config/records/preset.ts`
- Modify: `product/platform/library/config/records/app.ts`
- Modify: `product/platform/library/config/records/runtime.ts`
- Modify: `product/platform/library/config/records/source.ts`
- Modify: `product/platform/library/config/records/library-item.ts`
- Test: `product/platform/library/config/inheritable-fields.test.ts`
- Test: `product/platform/library/config/records/readable-schema.test.ts`
- Modify: `docs/brainstorms/2026-06-08-002-moonlight-policy-one-to-one.example.yaml`

**Approach:**
- Add `MoonlightPolicy` and `decodeMoonlightPolicy` beside the existing inheritable policy schemas.
- Add `moonlight: Schema.optional(MoonlightPolicy)` to `InheritableLayer` and every explicit record schema that currently opts in to inheritable fields one-by-one.
- Use strict excess-property rejection for the new schema.
- Model only the product-approved v1 shape from the example: no `action`, no `app`, no config-file load/save, no resolution preset, no platform provenance, no InputPlumber toggle, and no `control.commands` capability booleans.
- Use structured bounds for absolute touch: `{ x, y, w, h }` with positive width/height validation where practical.
- Use nullable environment overlay values (`string | null`) for `moonlight.environment`.
- Keep `platform.name` as a non-empty string rather than a closed enum.
- Decide during implementation whether `runtimeSettings.oneShot` lands as an explicitly experimental launch-hook block or remains absent from the v1 schema; if absent, leave the example comment and platform env migration notes clear. `runtimeSettings.adaptationSpike` is excluded from v1 readable policy.

**Execution note:** Start with failing schema tests for accepted v1 fields and rejected product-cuts before changing launch call sites.

**Patterns to follow:**
- Strict Effect Schema decode in `product/platform/library/config/inheritable-fields.ts`.
- Gamescope schema replacement planned in `docs/plans/2026-06-08-001-feat-typed-gamescope-policy-api-plan.md`.

**Test scenarios:**
- Happy path: decoding a representative policy with command, environment overlay, logging, stream dimensions, FPS, bitrate, codec, platform, input devices, mapping file, touch flags, audio/window fields, control enablement, and extra args succeeds.
- Happy path: `environment.FOO: null` decodes as an explicit process-env unset.
- Happy path: structured touch bounds with positive width/height decode and preserve integer fields.
- Edge case: `platform.name` accepts a non-empty unknown platform string so future patched backends are not blocked.
- Error path: old/env-shaped keys such as `KORRI_MOONLIGHT_PLATFORM`, `client`, `action`, `app`, `config`, `resolution.preset`, `platform.source`, `input.requireInputPlumber`, `control.commands`, and `runtimeSettings.adaptationSpike` fail strict decode.
- Error path: malformed touch bounds with missing fields or non-positive width/height fail decode.

**Verification:**
- `MoonlightPolicy` is exported from the config schema module and `InheritableLayer` accepts `moonlight` everywhere inheritable fields are decoded.

---

### U2. Add Moonlight Cascade Merge Semantics

**Goal:** Resolve `moonlight` policy through the readable cascade with deterministic, documented merge behavior.

**Requirements:** R1, R7, R9

**Dependencies:** U1

**Files:**
- Modify: `product/platform/library/config/cascade-resolver.ts`
- Modify: `product/platform/library/config/resolved-launch-context.ts`
- Modify: `product/platform/library/proseql/library-repository.ts`
- Test: `product/platform/library/config/cascade-resolver.test.ts`
- Test: `product/platform/library/config/readable-cascade-resolver.test.ts`
- Test: `product/platform/library/proseql/library-repository.test.ts`

**Approach:**
- Extend the internal inheritable views with `moonlight`.
- Add a specialized `foldMoonlight` helper; do not use generic object spreading for nested policy.
- Scalars and booleans are last-wins by specificity.
- Nested objects deep-merge by leaf so profiles can override one stream dimension or touch field without replacing siblings.
- `input.devices` and `extraArgs` concatenate least-to-most-specific.
- `environment` merges by key, preserving a more-specific `null` as an explicit unset in the resolved policy.
- Replace the deprecated single-policy local launcher seam with a combined launcher-policy resolver where practical, returning sibling Gamescope and Moonlight policies together. If implementation cannot retire the deprecated Gamescope method in the same slice, add the Moonlight method with the same deprecated annotation and a tracked follow-up note.
- Carry resolved `moonlight` policy in resolved launch contexts where full game resolution is available.

**Patterns to follow:**
- Existing `foldGamescope` and `resolveLocalLauncherGamescopePolicy` in `product/platform/library/config/cascade-resolver.ts`.
- Existing resolved launch context propagation in `product/platform/library/config/resolved-launch-context.ts`.

**Test scenarios:**
- Happy path: host/global, user, system, app/runtime/library item/release/profile, and override Moonlight fields fold into one resolved policy.
- Happy path: `input.devices` and `extraArgs` from multiple layers concatenate in cascade order.
- Happy path: profile-level `stream.resolution.width` overrides only width while inherited height remains.
- Happy path: `environment.FOO: null` in a more-specific layer overrides inherited `FOO: "bar"`.
- Edge case: explicit `false` for `logging.verbose`, `window.windowed`, `window.autoResize`, and `control.enable` is preserved over less-specific true values.
- Integration: local launcher policy resolution reads host/global plus launcher-specific policy for launcher id `moonlight` without requiring a federated game id, and returns Moonlight plus sibling Gamescope policy consistently.

**Verification:**
- Resolved launch contexts and local launcher policy resolution expose folded `moonlight` policy without losing existing `gamescope`, `env`, `cwd`, `argsAppend`, or patch behavior.

---

### U3. Implement the Canonical Moonlight Launch Renderer

**Goal:** Create one pure policy-to-`LaunchSpec` renderer for Moonlight Embedded stream launches.

**Requirements:** R2, R3, R4, R5, R6, R8, R10

**Dependencies:** U1

**Files:**
- Create: `product/platform/stream/moonlight-launch-spec.ts`
- Modify: `product/platform/library/launcher.ts`
- Test: `product/platform/stream/moonlight-launch-spec.test.ts`
- Test: `product/platform/library/launcher.test.ts`
- Modify: `product/apps/portal/api/stream/compose-moonlight-launch-spec.ts`
- Test: `product/apps/portal/api/stream/compose-moonlight-launch-spec.test.ts`

**Approach:**
- Move pure Moonlight argv/env rendering out of `product/apps/portal/api/stream/compose-moonlight-launch-spec.ts` into `product/platform/stream/moonlight-launch-spec.ts`.
- Renderer input should be resolved policy plus launch-time facts: peer host, resolved input device paths, and optional local-control env.
- Always render `stream` and `-app "Korri Stream"` as product invariants.
- Render explicit dimensions with `-width` and `-height`; do not render `-720`, `-1080`, or `-4k`.
- Serialize structured absolute-touch bounds to the Moonlight `x,y,w,h` argument.
- Apply `moonlight.environment` to `LaunchSpec.env` and the new explicit unset channel using string=set and `null`=unset semantics; do not pretend omission unsets inherited parent env.
- Append `extraArgs` after typed flags and before `-app`/host only if this ordering is verified not to disturb Moonlight parsing; otherwise document the chosen safe order in tests.
- Keep Gamescope wrapping outside this renderer: callers wrap the returned Moonlight `LaunchSpec` through the sibling Gamescope renderer. Add a pre-wrap validation that rejects `moonlight.platform.name: wayland` when Gamescope is enabled without sibling `window.exposeWayland: true`.
- Remove all `KORRI_MOONLIGHT_*` reads from the compose-spec path.

**Patterns to follow:**
- Pure `composeGamescopeLaunchSpec` behavior in `product/platform/stream/gamescope-launch-spec.ts`.
- Current `composeMoonlightLaunchSpec` tests that assert exact argv and host handling.

**Test scenarios:**
- Happy path: minimal policy renders `moonlight stream -app "Korri Stream" <host>` with no optional flags.
- Happy path: command override changes `LaunchSpec.command` without affecting args.
- Happy path: stream width/height/FPS/bitrate/codec/platform/mapping/input/touch/window fields render the expected Moonlight flags.
- Happy path: structured touch bounds render as one `-absolutetouchbounds x,y,w,h` pair.
- Happy path: environment string/null overlays set and unset `LaunchSpec.env` without introducing `KORRI_MOONLIGHT_*`.
- Edge case: IPv6 host already stripped by caller is passed through unchanged as the positional host.
- Edge case: empty host is rejected before rendering.
- Error path: post-fold validation rejects a resolved policy that still supplies only one resolution dimension; the renderer receives already-validated complete dimensions or no dimensions.

**Verification:**
- `compose-moonlight-launch-spec.ts` delegates to the shared platform renderer and no longer contains Moonlight flag assembly or env reader helpers.

---

### U4. Realign CLI/Desktop and Remote Launch Paths

**Goal:** Make both Moonlight launch entry points consume the same typed renderer and folded policy, including local-control env for server-composed launches.

**Requirements:** R2, R6, R8, R9, R10

**Dependencies:** U2, U3; coordinate with Gamescope plan U4

**Files:**
- Modify: `product/apps/portal/stream/moonlight-launcher.ts`
- Test: `product/apps/cli/moonlight-launcher.test.ts`
- Modify: `product/apps/portal/api/library/launch.rpc-handler.ts`
- Test: `product/apps/portal/api/library/launch.rpc-handler.test.ts`
- Modify: `product/services/device/game-stream-launch-intent.ts`
- Test: `product/services/device/game-stream-launch-intent.test.ts`
- Modify: `product/platform/library/library-services.ts`
- Modify: `product/platform/library/proseql/library-repository.ts`

**Approach:**
- Split spawn concerns (`runner`, `allowNixFallback`, `startupObserveMs`) from Moonlight policy. They stay on the launcher API/service envelope and do not enter readable config.
- Replace duplicate `moonlightXFromEnv` helpers in `moonlight-launcher.ts` with folded policy inputs and explicit spawn options. Update or delete tests/callers that used `appName` overrides because `Korri Stream` is now fixed product behavior.
- Keep input resolution as a caller preflight. The renderer receives resolved devices; it does not read `/proc/bus/input/devices`.
- Reuse existing local-control handle allocation from `moonlight-launcher.ts`, but make it available to the remote-source path before `LaunchSpec` creation.
- For remote-source launches, resolve local launcher Moonlight policy for launcher id `moonlight`, allocate local-control env if enabled, render the Moonlight spec, then wrap it with the resolved sibling Gamescope policy.
- Ensure `LaunchSpec.env` and explicit env-unset data survive intent enqueue/claim and runner spawn so `MOONLIGHT_LOCAL_CONTROL_*` reaches the Moonlight process and nullable policy env really unsets inherited values.
- Delete the `-platform wayland` sniff in `moonlightCommandSpec`; Gamescope `window.exposeWayland` must come from sibling Gamescope policy.
- Remove `KORRI_MOONLIGHT_CLIENT`; only Moonlight Embedded is supported.

**Execution note:** Add characterization tests around current CLI/remote exact argv before replacing the builders so behavior differences are intentional.

**Patterns to follow:**
- Current local-control handle shape in `product/apps/portal/stream/moonlight-launcher.ts`.
- Remote-source launch flow in `product/apps/portal/api/library/launch.rpc-handler.ts`.
- Launch intent `LaunchSpec.env` decode/persistence in `product/services/device/game-stream-launch-intent.ts`.

**Test scenarios:**
- Happy path: CLI/desktop launch with typed policy starts the installed Moonlight command with the same rendered args as the shared renderer.
- Happy path: remote-source `app.library.launch` resolves local launcher Moonlight policy and dispatches a spec containing command, args, and local-control env when `control.enable` is true.
- Happy path: local-control authority `controller` renders `MOONLIGHT_LOCAL_CONTROL_AUTHORITY=controller` and generated session/runtime/socket env values.
- Edge case: `control.enable: false` produces no local-control env.
- Edge case: InputPlumber missing or ambiguous still returns `input-unavailable` / `input-ambiguous` before spawning Moonlight.
- Error path: invalid or missing peer control URL still surfaces `host-unavailable` and does not attempt Moonlight rendering.
- Integration: a launch intent containing `LaunchSpec.env.MOONLIGHT_LOCAL_CONTROL_SOCKET` decodes, claims, and spawns without dropping the env.
- Regression: no test depends on `KORRI_MOONLIGHT_PLATFORM`, `KORRI_MOONLIGHT_MAPPING_FILE`, `KORRI_MOONLIGHT_ABSOLUTE_TOUCH`, or `KORRI_MOONLIGHT_AUTO_WINDOW_RESIZE` process env.
- Regression: `moonlight.platform.name: wayland` with Gamescope enabled and no sibling `window.exposeWayland: true` fails before spawn instead of silently losing the Wayland socket.

**Verification:**
- Grepping product TypeScript for `KORRI_MOONLIGHT_` finds no live launch-policy env readers; any remaining references are migration tests, Nix modules not yet converted in U5, or historical docs.

---

### U5. Move Platform Defaults into Readable Policy

**Goal:** Replace NixOS service env defaults for Moonlight launch policy with generated readable config fragments and update platform checks.

**Requirements:** R1, R2, R3, R5, R6, R9, R11

**Dependencies:** U1, U2, U3, U4; Gamescope plan U5 if it owns the shared platform-default fragment mechanism

**Files:**
- Modify: `product/systems/nixos/modules/korri-server.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify: `product/systems/nixos/images/platforms/x86.nix`
- Modify: `product/systems/nixos/images/kiosk.nix`
- Modify: `product/systems/nixos/images/live-usb-runtime.nix`
- Modify: `product/systems/nixos/flake/checks.nix`
- Test: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Test: `tools/testing/nix/korri-live-usb-config-check.nix`
- Test: `tools/testing/nix/korri-live-usb-vm-smoke.nix`
- Test: `product/platform/library/config/authoring/examples.test.ts`
- Test: `product/platform/library/proseql/library-db.test.ts`

**Approach:**
- Reuse the platform-default readable YAML fragment mechanism from the Gamescope plan if it exists; otherwise add it once in the Korri server module so Gamescope and Moonlight can share it.
- Render SM8550 Moonlight defaults into the fragment: command, platform name derived from `sm8550.video.decodeBackend`, SDL video/audio env where appropriate, mapping file, touch defaults, auto window resize, and local-control enablement/authority.
- Keep true service/session environment as service environment: Wayland/session identity, SDL substrate env that is not launch policy, Gamescope control bridge env, and runtime spike env if U1 defers it.
- Before editing service env blocks, enumerate every current `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_*` and `MOONLIGHT_RUNTIME_SETTINGS_MVP_*` location and decide whether each is preserved as service env or typed as a one-shot launch hook; do not remove the containing env block blindly.
- Remove `KORRI_MOONLIGHT_COMMAND`, `KORRI_MOONLIGHT_CLIENT`, `KORRI_MOONLIGHT_PLATFORM`, `KORRI_MOONLIGHT_MAPPING_FILE`, `KORRI_MOONLIGHT_ABSOLUTE_TOUCH*`, `KORRI_MOONLIGHT_AUTO_WINDOW_RESIZE`, and `KORRI_MOONLIGHT_CONTROL*` from platform service env once their policy replacements are wired.
- Preserve `KORRI_MOONLIGHT_STATE_HOME` only if implementation confirms Moonlight or wrappers still consume it outside TypeScript launch policy; otherwise move state-home handling to a separate documented launcher/persistence seam.
- Update x86 defaults to generate Moonlight command/mapping policy without carrying the old env into compositor/sessiond.
- Convert existing positive `KORRI_MOONLIGHT_*` Nix assertions into readable-fragment assertions plus explicit absent-assertions in the same unit that removes the env variables.
- Keep the kiosk InputPlumber requirement as platform/product launch invariant, not a YAML toggle.

**Patterns to follow:**
- Platform-default fragment planned in `docs/plans/2026-06-08-001-feat-typed-gamescope-policy-api-plan.md`.
- Existing Nix config checks under `tools/testing/nix/`.
- Existing readable example validation in `product/platform/library/config/authoring/examples.test.ts`.

**Test scenarios:**
- Happy path: evaluated SM8550 config writes a deterministic readable platform-default fragment containing `host.moonlight.command`, `platform.name`, mapping file, touch defaults, window auto-resize, and control authority.
- Happy path: ProseQL/readable library loading includes the generated platform-default fragment and resolves it into local launcher Moonlight policy.
- Happy path: evaluated x86 kiosk config carries Moonlight command and mapping defaults through readable policy rather than `KORRI_MOONLIGHT_*` service env.
- Happy path: live USB persistence checks still route Moonlight state to the expected cache path if that env remains an intentionally separate state seam.
- Error path: Nix checks fail if deprecated `KORRI_MOONLIGHT_*` launch-policy variables reappear in sessiond/server/compositor service env, and no contradictory positive assertions for the same vars remain.
- Integration: remote-source launch on a platform-default-only config can render a complete Moonlight `LaunchSpec` without user-authored `library.yaml` Moonlight fields.

**Verification:**
- Checked-in Nix modules no longer use `KORRI_MOONLIGHT_*` for launch policy defaults; any remaining `KORRI_MOONLIGHT_*` references are explicitly documented non-policy seams or historical docs.

---

### U6. Preserve Runtime-Control Boundaries

**Goal:** Keep Moonlight launch policy, local-control protocol, and runtime settings command semantics separate while migrating launch env.

**Requirements:** R6, R10, R11

**Dependencies:** U1, U4, U5

**Files:**
- Modify: `product/vendor/moonlight-embedded-korri/README.md`
- Test: `product/platform/stream/moonlight-control-protocol.test.ts`
- Test: `product/platform/stream/moonlight-control-client.test.ts`
- Modify: `docs/acceptance/runtime-settings-protocol-contract.md`
- Modify: `docs/acceptance/moonlight-live-settings-validation-sobo-2026-05-25.md`

**Approach:**
- Update native-fork docs to distinguish three surfaces: launch policy, local-control launch socket env, and runtime control command protocol.
- If `runtimeSettings.oneShot` lands in `MoonlightPolicy`, document it as launch-time env hook configuration only; it must not imply the runtime command was applied or supported. `adaptationSpike` remains out of v1 readable policy.
- Keep spike adaptation fields either outside schema or explicitly experimental; do not make them the product quality policy.
- Do not let readable policy configure `control.commands`; command availability comes from Moonlight `protocol.hello`/`state.snapshot` capability advertisement. Do not modify protocol/client implementations to import or depend on `MoonlightPolicy`; U6 is documentation/test-boundary work unless implementation proves a real contract bug.
- Ensure protocol/client tests continue to assert accepted-vs-applied and capability-gated dispatch independently of launch policy.
- Update acceptance docs only where typed launch policy changes how operators configure the session; avoid rewriting protocol contracts as launch config.

**Patterns to follow:**
- `product/vendor/moonlight-embedded-korri/README.md` separation of patch series.
- `docs/solutions/architecture-patterns/stream-control-command-outcome-contract-2026-06-03.md`.
- `docs/acceptance/runtime-settings-protocol-contract.md`.

**Test scenarios:**
- Happy path: local-control protocol tests still derive command capability from protocol state, not from `MoonlightPolicy` fields.
- Happy path: if `runtimeSettings.oneShot` is implemented, renderer tests prove it emits only launch env and does not alter `moonlight-control-protocol` schemas.
- Error path: no readable policy value can force-advertise `runtime.setResolution` when the running Moonlight session does not advertise it.
- Regression: docs and tests still state that accepted local command responses are non-terminal and applied truth arrives later.

**Verification:**
- Runtime-control API files do not import `MoonlightPolicy` except in docs/tests where explicitly justified.

---

### U7. Update Examples, Fixtures, and Retired Vocabulary Checks

**Goal:** Bring checked-in examples and tests onto the new Moonlight policy shape and guard against old env/config vocabulary returning.

**Requirements:** R2, R3, R4, R5, R11

**Dependencies:** U1, U2, U3, U4, U5

**Files:**
- Modify: `korri-catalog-display-metadata.example.yaml`
- Modify: `docs/brainstorms/2026-06-08-002-moonlight-policy-one-to-one.example.yaml`
- Test: `product/platform/library/config/authoring/examples.test.ts`
- Test: `product/platform/library/config/records/readable-schema.test.ts`
- Test: `product/apps/portal/api/stream/compose-moonlight-launch-spec.test.ts`
- Test: `product/apps/cli/moonlight-launcher.test.ts`
- Test: `product/platform/stream/moonlight-launch-spec.test.ts`

**Approach:**
- Add a concise `host.moonlight` example to the canonical readable YAML using the narrowed shape: command, environment, logging, stream dimensions, platform name, mapping file, touch, window auto-resize, control enablement, and extra args.
- Keep `host.gamescope` as a sibling, not nested under `moonlight`.
- Add retired-vocabulary assertions for `action`, `app`, `config`, `resolution.preset`, `platform.source`, `input.requireInputPlumber`, and old `KORRI_MOONLIGHT_*` YAML keys.
- Update tests that currently mutate `process.env.KORRI_MOONLIGHT_*` to build typed policy inputs instead.
- Keep historical docs unchanged unless they are active operator-facing guidance.

**Patterns to follow:**
- Existing readable schema example tests.
- Existing retired Gamescope vocabulary checks planned in the typed Gamescope work.

**Test scenarios:**
- Happy path: canonical example decodes and resolves Moonlight policy under strict readable schema.
- Happy path: example with sibling `host.gamescope` and `host.moonlight` resolves both policies without nesting confusion.
- Error path: examples containing deprecated `KORRI_MOONLIGHT_*`, `moonlight.action`, `moonlight.app`, `moonlight.config`, `moonlight.stream.resolution.preset`, `moonlight.platform.source`, `moonlight.input.requireInputPlumber`, `moonlight.control.commands`, or `moonlight.runtimeSettings.adaptationSpike` fail retired-vocabulary checks.
- Regression: exact-argv tests cover typed policy rendering instead of env mutation.

**Verification:**
- Grepping active examples and tests finds no current-schema dependence on old Moonlight env keys.

---

## Agentic Work Chunks

These chunks are intentionally larger than the implementation units. Each chunk is sized for one coding agent to take a coherent vertical slice, with enough internal scope to avoid handoff churn while still producing reviewable PRs. Agents should preserve the U-ID trace inside their commit/PR notes rather than renumbering units.

### Chunk A — Readable Contract and Cascade Core

**Covers:** U1, U2

**Goal:** Land the public `MoonlightPolicy` contract and make it resolve through the readable cascade before any launch call site depends on it.

**Agent brief:** Add the schema, opt every relevant record type into `moonlight`, implement `foldMoonlight`, propagate resolved policy outputs, and add local launcher policy resolution. Stop before renderer/call-site rewrites except where tests need minimal plumbing.

**Done when:** strict schema tests, per-layer readable decode tests, cascade merge tests, and local launcher policy resolution tests all pass; no launch behavior has been migrated yet.

### Chunk B — Canonical Renderer and Launch Path Migration

**Covers:** U3, U4

**Goal:** Replace duplicate Moonlight argv/env construction with one renderer and migrate CLI/desktop plus remote-source launch paths to typed policy.

**Agent brief:** Create `product/platform/stream/moonlight-launch-spec.ts`, extend `LaunchSpec` for executable env unsets if not already done by Gamescope work, remove `KORRI_MOONLIGHT_*` TypeScript readers, preserve InputPlumber preflight, inject local-control env before intent enqueue, and delete the `-platform wayland` Gamescope sniff with validation for the required sibling Gamescope policy.

**Done when:** CLI/desktop and remote-source tests render identical args for the same policy, launch intents preserve env/env-unset data, and product TypeScript has no live `KORRI_MOONLIGHT_*` launch-policy readers.

### Chunk C — Platform Defaults and Nix Checks

**Covers:** U5

**Goal:** Move platform-owned Moonlight launch defaults from service env into generated readable config fragments without regressing SM8550, x86, or live USB behavior.

**Agent brief:** Reuse or create the shared platform-default YAML fragment mechanism, render SM8550/x86 Moonlight defaults into readable policy, keep true service/session env separate, enumerate/preserve or type MVP runtime-settings env before removing any env blocks, and invert existing positive `KORRI_MOONLIGHT_*` Nix assertions into readable-fragment plus absent-env assertions.

**Done when:** Nix checks prove platform fragments contain expected `host.moonlight` policy, deprecated launch-policy env keys are absent from service env, and any remaining Moonlight env is documented as non-policy or runtime-spike scope.

### Chunk D — Runtime Boundary, Docs, and Retired Vocabulary

**Covers:** U6, U7

**Goal:** Make the migration reviewable and prevent runtime-control or retired config vocabulary from leaking back into the launch policy.

**Agent brief:** Update the vendor README and active acceptance docs to distinguish launch policy, local-control socket env, and runtime command protocol; keep protocol/client implementations independent from `MoonlightPolicy`; update canonical examples; add retired-vocabulary tests for excluded fields and old env-shaped YAML.

**Done when:** examples decode with sibling `host.moonlight`/`host.gamescope`, excluded fields fail retired-vocabulary checks, and docs clearly state that command capability/adapted runtime state is advertised by the running session rather than configured in readable launch policy.

---

## System-Wide Impact

- **Interaction graph:** Readable config, ProseQL repository resolution, portal launch RPCs, CLI/desktop launch helpers, sessiond foreground launch, game-stream intent persistence, and NixOS platform modules all touch this change.
- **Error propagation:** Schema/decode failures should surface as config errors; input preflight failures remain `input-unavailable` or `input-ambiguous`; local-control directory allocation failures surface as launch preparation failures before spawn.
- **State lifecycle risks:** Local-control runtime directories and sockets must remain private per launch and must not be reused after stale sessions. Env unsets must not remove unrelated session identity required by Gamescope/sessiond.
- **API surface parity:** Server-composed remote-source launches and CLI/desktop launches must render identical Moonlight argv for the same policy and launch facts.
- **Integration coverage:** Unit tests prove renderer behavior; integration tests must cover remote-source launch resolution through `app.library.launch`, intent persistence with env, and NixOS-generated platform defaults loaded by the library.
- **Unchanged invariants:** Sessiond remains foreground lifecycle truth; Gamescope remains a sibling wrapper policy; Moonlight runtime-control commands remain capability/readback-driven protocol operations, not launch config outcomes.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Merge conflicts with the active typed Gamescope policy plan | Sequence after Gamescope U1-U4 where practical; otherwise keep Moonlight renderer changes isolated and avoid reintroducing Gamescope argv sniffing. |
| Removing env fallbacks breaks platform launches before Nix defaults are converted | Implement schema/renderer first, then migrate Nix platform defaults and gate removal of env readers on Nix checks. |
| Local-control env is lost across launch-intent persistence | Add explicit intent decode/claim tests for `LaunchSpec.env` carrying `MOONLIGHT_LOCAL_CONTROL_*`. |
| Runtime settings spike env is accidentally deleted | Treat `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_*` as a deliberate migration decision and cover SM8550 platform behavior in Nix checks. |
| Open `platform.name` admits typos | Keep strict non-empty validation and rely on launch failure plus future built-platform inventory checks; do not prematurely block valid patched backends. |
| Readable policy overclaims runtime-control command support | Do not make command capabilities config-driven; keep capability advertisement in local-control protocol tests. |

---

## Documentation / Operational Notes

- Update `product/vendor/moonlight-embedded-korri/README.md` after implementation so operators can map typed policy fields to downstream Moonlight flags/env.
- Platform modules should document which values are substrate-derived before they render final readable defaults.
- Device validation should include at least SM8550 v4l2m2m launch, x86 SDL/fake diagnostic launch, and local-control socket discovery after implementation.
- If runtime-settings one-shot hooks remain as env after this plan, capture a follow-up backlog item for typed runtime-settings launch hooks or spike removal.

---

## Sources & References

- Source example: `docs/brainstorms/2026-06-08-002-moonlight-policy-one-to-one.example.yaml`
- Related plan: `docs/plans/2026-06-08-001-feat-typed-gamescope-policy-api-plan.md`
- Related backlog: `backlog/task-031 - wire-moonlight-local-control-socket-into-server-composed-str.md`
- Related code: `product/apps/portal/api/stream/compose-moonlight-launch-spec.ts`
- Related code: `product/apps/portal/stream/moonlight-launcher.ts`
- Related code: `product/apps/portal/api/library/launch.rpc-handler.ts`
- Related code: `product/platform/library/config/inheritable-fields.ts`
- Related code: `product/platform/library/config/cascade-resolver.ts`
- Related code: `product/services/device/game-stream-launch-intent.ts`
- Related code: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Related code: `product/vendor/moonlight-embedded-korri/README.md`
- Institutional learning: `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`
- Institutional learning: `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md`
- Institutional learning: `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`
- Institutional learning: `docs/solutions/architecture-patterns/stream-control-command-outcome-contract-2026-06-03.md`
- Institutional learning: `docs/solutions/tooling-decisions/vendor-sdl2-mali-fbdev-for-moonlight-on-fbdev-only-handhelds-2026-05-28.md`
- Acceptance contract: `docs/acceptance/runtime-settings-protocol-contract.md`
