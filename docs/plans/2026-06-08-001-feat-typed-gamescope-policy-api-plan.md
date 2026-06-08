---
title: feat: Replace Gamescope Policy with Typed API
type: feat
status: completed
date: 2026-06-08
verify_command: "just test-unit && just typecheck && just lint"
---

# feat: Replace Gamescope Policy with Typed API

## Summary

Replace Korri's shallow `gamescope` policy with a full, breaking, typed configuration API that mirrors the Gamescope 3.16.x launch surface while keeping Korri's existing runtime-control API as a separate contract. The implementation will remove old flat fields, render launch argv/env from declarative nested options, and express the Bandai/RG353M RetroArch workaround as `gamescope.app.environment.WAYLAND_DISPLAY: null` rather than a special `forceXwayland` switch.

---

## Problem Frame

Gamescope behavior is currently encoded through a few first-class fields (`enabled`, `backend`, `exposeWayland`, `command`, `args`, `forceXwayland`) plus raw argv. That shape is too shallow for a readable canonical config contract: it hides upstream Gamescope options, forces device fixes into special-case booleans/env fallbacks, and makes policy/argv behavior harder to review as the product grows across Bandai/SM8550 and RG353M/RK3566.

---

## Requirements

- R1. Replace the old Gamescope policy contract with a breaking schema; old flat fields must be rejected, not aliased.
- R2. Model the complete Gamescope 3.16.x launch-time option surface as typed, NixOS-module-style nested config groups.
- R3. Keep `gamescope.command` as the only executable override in readable config; do not expose a `package` field.
- R4. Add explicit environment overlays: `gamescope.environment` for the Gamescope process and `gamescope.app.environment` for the wrapped app after `--`, where string sets/overrides and `null` unsets.
- R5. Preserve kiosk-correct defaults through the new shape: Gamescope enabled by default, nested `wayland` backend, fullscreen/borderless window, and exposed Wayland socket unless explicitly overridden.
- R6. Replace `forceXwayland` and `KORRI_GAMESCOPE_FORCE_XWAYLAND` behavior with normal policy/env rendering; RG353M and Bandai RetroArch fixes must use `gamescope.app.environment.WAYLAND_DISPLAY: null`.
- R7. Define deterministic cascade merge semantics for every new Gamescope sub-object, including nullable env overlays and concatenated `extraArgs`.
- R8. Render final Gamescope launch specs from structured policy in one place; no call site should hand-compose Gamescope flags or sniff child argv/env for policy intent.
- R9. Keep Korri's runtime-control bridge contract separate from readable launch policy; this plan must not add per-game control lifecycle settings without a concrete consumer.
- R10. Update examples, fixtures, platform defaults, and tests so no checked-in config/test depends on old fields.

---

## Scope Boundaries

- Do not add or resurrect Gamescope patches; this is Korri config/API work over the currently shipped `gamescope-korri` package.
- Do not solve ROM/IPS patch materialization or Super Mario Advance content patching.
- Do not perform a live Bandai/RG353M deployment in this plan; device validation can happen after implementation.
- Do not introduce backwards-compatibility decoders, deprecated aliases, or silent migrations for old Gamescope keys.

### Deferred to Follow-Up Work

- Future Gamescope vendor bumps should add a dedicated help/source-diff check, but this plan only needs the initial 3.16.x parity implementation.
- Product automation of live `mode.set` remains governed by `docs/acceptance/gamescope-scaling-policy.md`; this plan should not broaden runtime-control automation without new physical-device proof.

---

## Context & Research

### Relevant Code and Patterns

- `product/platform/library/config/inheritable-fields.ts` defines the current `GamescopePolicy`, `DEFAULT_GAMESCOPE_POLICY`, strict decoders, and the `InheritableLayer.gamescope` field shared by readable records.
- `product/platform/library/config/cascade-resolver.ts` owns `foldGamescope`, currently using scalar last-wins plus `args` concatenation.
- `product/platform/stream/gamescope-launch-spec.ts` is the current launch renderer and the right seam for a single structured policy-to-argv/env builder.
- `product/apps/portal/api/library/launch.rpc-handler.ts`, `product/services/device/game-stream-runner.ts`, `product/apps/portal/api/stream/compose-moonlight-launch-spec.ts`, and `product/apps/portal/stream/moonlight-launcher.ts` are current callers that translate or pass `GamescopeOptions`.
- `korri-catalog-display-metadata.example.yaml` is the readable contract example and currently uses old `host.gamescope.enabled/backend/exposeWayland` and profile-level `gamescope.args`.
- `product/systems/nixos/images/platforms/rocknix-rk3566.nix` currently relies on `KORRI_GAMESCOPE_FORCE_XWAYLAND=1`, which must be replaced by policy-driven `app.environment` configuration.
- `product/vendor/gamescope-korri/package.nix` documents Korri's downstream patch toggles and control manifest (`GAMESCOPE_XWAYLAND_MODE_CONTROL`, `GAMESCOPE_SCALING_FILTER`, `GAMESCOPE_SHARPNESS`, `GAMESCOPE_FSR_FEEDBACK`).

### Institutional Learnings

- `docs/solutions/runtime-errors/gamescope-backend-auto-fights-sway-for-drm-master-2026-05-27.md`: nested kiosk launches must default to `--backend wayland`; `auto` is not a safe missing-field fallback.
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`: Gamescope behavior must come from explicit cascade-folded policy, not argv/env sniffing heuristics.
- `docs/solutions/architecture-patterns/gamescope-runtime-control-contract-2026-06-02.md`: runtime controls are individual bridge operations with readback semantics; no quality-profile shortcut belongs in v1.
- `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md`: Gamescope is a presentation adapter, not the owner of foreground/window promotion.
- `backlog/task-036 - product-level-config-defaults-platforms-inherit-gamescope-policy-env.md`: RG353M gamescope defaults are currently duplicated across env seams and should become config/policy defaults.
- `backlog/task-038 - minimize-rg353m-gamescope-patch-set-after-xwayland-routing.md`: RG353M's stable path is Xwayland routing for RetroArch; the new schema should express that mechanism directly.

### External References

- Upstream Gamescope 3.16.23 `src/main.cpp`: source of truth for launch flags and the fact that 3.16.20→3.16.23 did not add CLI options.
- Upstream Gamescope 3.16.23 `src/backend.h`: source of truth for backend and virtual connector strategy values.
- Upstream Gamescope 3.16.23 `protocol/gamescope-control.xml` and `src/Apps/gamescopectl.cpp`: source of truth for the upstream private Wayland control surface; Korri should keep this distinct from its current X11-atom bridge.

---

## Key Technical Decisions

- **Break, don't bridge:** old keys (`enabled`, flat `backend`, `exposeWayland`, `args`, `forceXwayland`) are removed from the schema and become strict-decode errors. The new public gate is `gamescope.enable`.
- **Policy names describe capability, not CLI syntax:** config groups are named by domain (`backend`, `window`, `display`, `scaling`, `hdr`, `vr`, etc.). Only the renderer knows Gamescope flag spellings.
- **One renderer owns argv/env mapping:** introduce or centralize a Gamescope policy renderer under `product/platform/stream/` so call sites pass resolved policy rather than spreading individual flags.
- **Defaults preserve current kiosk behavior:** `DEFAULT_GAMESCOPE_POLICY` moves to the nested shape and includes `enable: true`, `backend.type: wayland`, `window.fullscreen: true`, `window.borderless: true`, and `window.exposeWayland: true`.
- **Environment overlays use nullable maps:** `Record<string, string | null>` means string=set and `null`=unset. This applies to both Gamescope process env and wrapped-app env.
- **`extraArgs` remains the escape hatch:** it replaces `args` and concatenates across cascade layers in least-to-most-specific order. Typed fields should cover the full 3.16.x surface, but `extraArgs` remains for urgent unmodelled flags.
- **Runtime control stays separate:** do not introduce a per-game `gamescope.control` readable block in this change unless a concrete UI/runner consumer is added. Keep bridge lifecycle and capability negotiation in the existing Gamescope control contract.
- **Launch and runtime FPS semantics stay distinct:** launch-time `--framerate-limit` is not the same as the runtime `GAMESCOPE_FPS_LIMIT` atom and must not share one ambiguous config field.

---

## Open Questions

### Resolved During Planning

- Should the new schema preserve backwards compatibility? **No.** The user explicitly requested a full break and fix.
- Should readable config expose both `package` and `command`? **No.** The readable contract uses only `gamescope.command`.
- How should Xwayland routing be represented? **As environment mutation:** `gamescope.app.environment.WAYLAND_DISPLAY: null`.
- Should the public schema have a `cli:` bucket? **No.** The schema follows NixOS-module-style capability groups.

### Deferred to Implementation

- Exact helper/module names for the renderer and merge helpers: the plan requires one renderer seam, but implementation can choose final names consistent with local imports.
- Whether to enforce every numeric range at Effect Schema decode time or split some constraints into semantic validation helpers: implementation should prefer decode-time validation where Effect Schema supports it cleanly, but cross-layer constraints such as nested width/height pairing must validate after cascade folding.
- Exact helper names for the NixOS-rendered policy/default fragment may be chosen during implementation, but the mechanism is settled: `services.korri.server.library.platformDefaults` renders a deterministic YAML fragment under the library root (for example `00-korri-platform-defaults.yaml`) using canonical readable sections, and ProseQL reads that fragment alongside user-authored YAML. Platform defaults are readable Gamescope policy data, not a `KORRI_GAMESCOPE_FORCE_XWAYLAND` renderer env fallback.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```yaml
host:
  gamescope:
    enable: true
    command: gamescope
    backend:
      type: wayland
    window:
      fullscreen: true
      borderless: true
      exposeWayland: true

apps:
  retroarch:
    gamescope:
      app:
        environment:
          WAYLAND_DISPLAY: null
      scaling:
        filter: nearest

profiles:
  handheld-640x480:
    gamescope:
      display:
        output:
          width: 640
          height: 480
```

Renderer flow:

```text
readable YAML
  -> strict GamescopePolicy decode
  -> cascade fold with deep leaf merge / extraArgs concat / nullable env overlay
  -> normalized kiosk-shaped default
  -> single Gamescope renderer
      -> LaunchSpec.command = gamescope.command ?? "gamescope"
      -> LaunchSpec.env = app launch env + gamescope.environment overlay
      -> LaunchSpec.args = typed flags + extraArgs + "--" + app env wrapper + app command
```

Representative mapping groups:

| Policy group | Examples | Rendered surface |
|---|---|---|
| `command` | `gamescope` or wrapper path | LaunchSpec command for Gamescope |
| `environment` | `GAMESCOPE_DISABLE_EXPLICIT_SYNC: "1"`, `FOO: null` | Gamescope process env set/unset |
| `app.environment` | `WAYLAND_DISPLAY: null` | app-side env overlay after `--` |
| `backend` | `type`, `allowDeferred`, `preferVkDevice` | `--backend`, `--allow-deferred-backend`, `--prefer-vk-device` |
| `window` | `fullscreen`, `borderless`, `exposeWayland`, `xwaylandCount` | `-f`, `-b`, `--expose-wayland`, `--xwayland-count` |
| `display` | output/nested dimensions, refresh, orientation, framerate divisor | `-W/-H`, `-w/-h`, `-r`, `--force-orientation`, `--framerate-limit` |
| `scaling` | `scaler`, `filter`, `sharpness` | `-S`, `-F`, pinned-source-verified sharpness flag |
| `extraArgs` | emergency unmodelled flags | appended last before `--` |

---

## Implementation Units

### U1. Replace the Gamescope Policy Schema

**Goal:** Define the full breaking typed `GamescopePolicy` contract and strict validation for the new public YAML shape.

**Requirements:** R1, R2, R3, R4, R5, R8, R9

**Dependencies:** None

**Files:**
- Modify: `product/platform/library/config/inheritable-fields.ts`
- Test: `product/platform/library/config/inheritable-fields.test.ts`
- Modify: `docs/brainstorms/2026-06-08-001-gamescope-policy-one-to-one.example.yaml`

**Approach:**
- Before locking the schema, verify the exact 3.16.23 option inventory against pinned Gamescope source (`src/main.cpp`, `src/backend.h`) and record any corrected flag names/enums in `product/vendor/gamescope-korri/patches/README.md`.
- Replace the flat Gamescope schema with nested optional structs for the complete 3.16.x launch surface: `backend`, `window`, `display`, `scaling`, `cursor`, `input`, `scheduling`, `stats`, `steam`, `embedded`, `hdr`, `vr`, `reshade`, `steamDeck`, `debug`, `app`, `environment`, and `extraArgs`.
- Use `enable` as the gate and remove `enabled`.
- Use nullable env overlay records for `environment` and `app.environment`.
- Include source-verified enums and constraints only after the pinned-source verification step: backend includes `openvr` when present in the build; scaling filter includes launch-time `pixel`; virtual connector strategy includes `SingleApplication`, `SteamControlled`, `PerAppId`, `PerWindow`; orientation uses Gamescope's lowercase values; touch mode exposes the CLI-valid 0-4 modes as a typed public union or constrained representation.
- Normalize to kiosk-safe defaults in the new nested shape.
- Keep strict excess-property rejection so all old keys fail loudly.

**Execution note:** Start with schema tests that demonstrate old-field rejection and new-field decode before changing call sites.

**Patterns to follow:**
- Strict Effect Schema decode in `product/platform/library/config/inheritable-fields.ts`.
- Current `DEFAULT_GAMESCOPE_POLICY` tests in `product/platform/library/config/inheritable-fields.test.ts`.

**Test scenarios:**
- Happy path: decoding an empty policy returns no opinions; normalizing it yields the nested kiosk default.
- Happy path: decoding a representative full policy with backend, window, display, scaling, env overlays, HDR, VR, and debug groups succeeds.
- Happy path: `gamescope.environment.FOO: null` and `gamescope.app.environment.WAYLAND_DISPLAY: null` decode as explicit unset values.
- Edge case: `display.nested.width` and `display.nested.height` may decode independently so different cascade layers can provide each value; the paired-dimension constraint is validated only after cascade folding/render preparation.
- Edge case: range-constrained HDR and sharpness values reject invalid out-of-range values where practical.
- Error path: old `enabled`, flat `backend`, `exposeWayland`, `args`, and `forceXwayland` keys throw strict decode errors.
- Error path: unknown enum values for backend, scaler, filter, orientation, virtual connector strategy, and DRM mode throw strict decode errors.

**Verification:**
- The exported `GamescopePolicy` type reflects only the new contract.
- Old Gamescope policy fixtures fail until downstream units update them.

---

### U2. Define Gamescope Cascade Merge Semantics

**Goal:** Replace `foldGamescope` with deterministic deep merge behavior for the new nested policy.

**Requirements:** R4, R5, R7

**Dependencies:** U1

**Files:**
- Modify: `product/platform/library/config/cascade-resolver.ts`
- Modify: `product/platform/library/config/resolved-launch-context.ts`
- Test: `product/platform/library/config/readable-cascade-resolver.test.ts`
- Test: `product/platform/library/config/cascade-resolver.test.ts`
- Test: `product/platform/library/config/inheritable-fields.test.ts`

**Approach:**
- Define explicit merge helpers rather than generic object spreading for the Gamescope tree.
- Scalars and booleans are last-wins by cascade specificity.
- Nested objects deep-merge leaf-by-leaf so a profile can override `display.output.width` without replacing the entire display block.
- `extraArgs` concatenates least-to-most-specific, matching old `args` behavior.
- Nullable env overlays merge by key, with a more-specific `null` preserved as an explicit unset in the resolved policy.
- Ensure `normalizeGamescopePolicy` applies defaults after folding without erasing explicit `false`, `null`, or empty arrays.

**Patterns to follow:**
- Existing `foldGamescope` scalar/list merge rules in `product/platform/library/config/cascade-resolver.ts`.
- Existing `mergeLaunchSettings` separation for specialized merge logic.

**Test scenarios:**
- Happy path: host, user, system, source, app, runtime, library item, release, profile, and override Gamescope fields all fold into one resolved policy.
- Happy path: `extraArgs` from multiple layers concatenate in cascade order.
- Happy path: a more-specific scalar overrides a less-specific scalar without replacing sibling fields.
- Edge case: a profile-level `app.environment.WAYLAND_DISPLAY: null` survives normalization and overrides/inherits correctly across less-specific app environment values.
- Edge case: explicit `enable: false`, `window.fullscreen: false`, and `window.exposeWayland: false` are preserved over defaults.
- Error path: invalid nested Gamescope config in any layer surfaces as a schema error with the offending path.

**Verification:**
- Readable launch contexts carry the fully folded new Gamescope policy.
- No old `args` cascade fixture remains.

---

### U3. Implement the Structured Gamescope Launch Renderer

**Goal:** Render the full typed Gamescope policy to `LaunchSpec` argv/env through one tested path.

**Requirements:** R2, R3, R4, R5, R6, R8

**Dependencies:** U1, U2

**Files:**
- Modify: `product/platform/stream/gamescope-launch-spec.ts`
- Test: `product/platform/stream/gamescope-launch-spec.test.ts`
- Modify: `product/services/device/game-stream-fullscreen.ts`
- Test: `product/services/device/game-stream-fullscreen.test.ts`

**Approach:**
- Remove standalone `GamescopeBackend` and `GamescopeOptions` declarations from the renderer; import the resolved policy type from the config schema so backend enums cannot drift.
- Build argv from typed groups in a deterministic order, with `extraArgs` appended last before `--`.
- Apply `gamescope.environment` to the returned Gamescope `LaunchSpec.env` using string=set and `null`=unset semantics.
- Apply `gamescope.app.environment` to the wrapped app after `--`; for unset/set overlays, use an app-side environment wrapper only when necessary.
- Remove the `KORRI_GAMESCOPE_FORCE_XWAYLAND` process-env fallback and all `forceXwayland` logic.
- Preserve disabled behavior: `enable: false` returns the original app `LaunchSpec` unchanged.
- Emit the sharpness flag name verified from pinned Gamescope 3.16.23 source; prefer `--sharpness` only if the source confirms it is accepted, and document `--fsr-sharpness` as an alias if applicable.
- Keep launch-time `display.framerateLimit` mapped to `--framerate-limit` and do not conflate it with runtime FPS control.

**Patterns to follow:**
- Pure `composeGamescopeLaunchSpec` behavior in `product/platform/stream/gamescope-launch-spec.ts`.
- Existing tests that locate the `--` separator and assert inner app argv.

**Test scenarios:**
- Happy path: default normalized policy emits `gamescope --backend wayland -f -b --expose-wayland -- <app>`.
- Happy path: `app.environment.WAYLAND_DISPLAY: null` renders the wrapped app equivalent of `env -u WAYLAND_DISPLAY <app>`.
- Happy path: `app.environment` with both null and string values renders unset and set operations for the inner app without changing the Gamescope process env.
- Happy path: `environment` string/null overlays affect the Gamescope `LaunchSpec.env` and do not leak into the app wrapper except by normal process inheritance.
- Happy path: representative fields from each launch group emit expected Gamescope flags and values.
- Edge case: `extraArgs` appears after typed flags and before `--`.
- Edge case: disabled Gamescope ignores policy fields and returns the original launch spec.
- Edge case: nested width and height supplied by different cascade layers render successfully once folded together.
- Error path: a folded policy with only one nested dimension is rejected before argv rendering rather than producing a bad command.

**Verification:**
- There is one canonical policy-to-argv/env renderer; call sites no longer compose flag spreads manually.
- Grepping product TypeScript for `export type GamescopeBackend` and `export interface GamescopeOptions` finds no remaining declarations outside the schema module.

---

### U4. Realign Launch Callers and Intent Transport

**Goal:** Update all launch entry points to carry and consume the new Gamescope policy without old-field adapters.

**Requirements:** R1, R5, R6, R8, R9

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `product/apps/portal/api/library/launch.rpc-handler.ts`
- Test: `product/apps/portal/api/library/launch.rpc-handler.test.ts`
- Modify: `product/apps/portal/api/stream/compose-moonlight-launch-spec.ts`
- Test: `product/apps/portal/api/stream/compose-moonlight-launch-spec.test.ts`
- Test: `product/apps/portal/api/stream/prepare.rpc-handler.test.ts`
- Modify: `product/apps/portal/stream/moonlight-launcher.ts`
- Modify: `product/services/device/game-stream-runner.ts`
- Modify: `product/services/device/game-stream-launch-intent.ts`
- Test: `product/services/device/game-stream-fullscreen.test.ts`
- Modify: `product/platform/library/library-source.ts`
- Modify: `product/platform/library/library-services.ts`
- Modify: `product/platform/library/proseql/library-repository.ts`

**Approach:**
- Pass resolved `GamescopePolicy` through launch result and intent surfaces directly in the new shape.
- Replace `hasGamescopeOpinion` with a new-shape check: either always persist a normalized Gamescope policy when one exists, or treat `enable`, `command`, non-empty `extraArgs`, `environment`, `app.environment`, and any nested group key as an opinion. A policy with `enable: true` and no command must still be written to the intent.
- Remove process-env fallback handling for `KORRI_GAMESCOPE_FORCE_XWAYLAND`.
- Delete the `-platform wayland` inference in `moonlightCommandSpec`. Callers that launch Moonlight with a Wayland platform must contribute `window.exposeWayland: true` explicitly in their resolved Gamescope policy.

**Patterns to follow:**
- Existing `GameStreamLaunchIntent.gamescope` transport in `product/services/device/game-stream-launch-intent.ts`.
- Explicit-policy-over-heuristics guidance from `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`.

**Test scenarios:**
- Happy path: `app.library.launch` with app-level `gamescope.app.environment.WAYLAND_DISPLAY: null` delegates a launch whose final spec clears `WAYLAND_DISPLAY` for the app.
- Happy path: a remote Moonlight launch preserves explicit `window.exposeWayland` policy in the new nested shape, with no `-platform wayland` sniffing in `moonlightCommandSpec`.
- Edge case: a policy with `enable: false` still records enough intent for callers to avoid unnecessary Gamescope wrapping.
- Edge case: a policy with `enable: true` and no `command` appears in the written intent and decodes/requeues/claims successfully.
- Error path: an intent or RPC fixture with old flat Gamescope fields fails strict decode rather than being silently translated.

**Verification:**
- Grepping product TypeScript for `forceXwayland`, `KORRI_GAMESCOPE_FORCE_XWAYLAND`, `exposeWayland`, and `gamescope.args` finds no live code references except retired-vocabulary tests or historical docs.

---

### U5. Update Readable Examples, Fixtures, and Platform Defaults

**Goal:** Convert checked-in readable config and platform defaults to the new Gamescope API, including RG353M/Bandai-style app env policy.

**Requirements:** R1, R3, R5, R6, R10

**Dependencies:** U1, U2, U3, U4

**Files:**
- Modify: `korri-catalog-display-metadata.example.yaml`
- Test: `product/platform/library/config/authoring/examples.test.ts`
- Test: `product/platform/library/config/records/readable-schema.test.ts`
- Modify: `product/platform/library/rocknix/rocknix-source.ts`
- Test: `product/platform/library/rocknix/rocknix-source.test.ts`
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify: `product/systems/nixos/modules/korri-server.nix`
- Modify: `product/systems/nixos/flake/checks.nix`
- Modify: `product/platform/library/proseql/library-db.test.ts`
- Create: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`
- Test: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`

**Approach:**
- Update the canonical example: `host.gamescope.enable`, nested `backend.type`, `window.exposeWayland`, and profile display sizing via `display.output.width/height` instead of raw `args`.
- Add a RetroArch app-level example for `gamescope.app.environment.WAYLAND_DISPLAY: null` only if the example is meant to document the Bandai/RG353M path; otherwise keep it in the brainstorm/plan and let device configs set it.
- Update readable schema tests and retired-vocabulary checks so old Gamescope keys are forbidden in canonical examples.
- Remove both RK3566 `KORRI_GAMESCOPE_FORCE_XWAYLAND` locations: the value inside `gamescopeRuntimeEnvironment` passed to sessiond and the explicit `systemd.services.korri-server.environment.KORRI_GAMESCOPE_FORCE_XWAYLAND` assignment.
- Add `services.korri.server.library.platformDefaults` (name may be refined locally) as a NixOS option whose attrset is rendered by the module to a deterministic YAML fragment under `services.korri.server.library.root`, such as `00-korri-platform-defaults.yaml`. The fragment uses canonical readable sections (`host`, `apps`, etc.) and is loaded by ProseQL's existing `**/*.yaml` document source rather than by process-env magic.
- Use that platform-default fragment in `rocknix-rk3566.nix` to express RG353M Xwayland routing as `apps.retroarch.gamescope.app.environment.WAYLAND_DISPLAY: null`.
- Add ProseQL/library tests proving the platform-default YAML fragment is discovered and contributes to resolved Gamescope policy without clobbering the user-authored `library.yaml`.
- Enumerate and cover every path that previously received the force-Xwayland env var: server-composed local launches, sessiond/game-stream intent launches, and any Rocknix source fallback.
- Keep RK3566 PanVK/Gamescope process env requirements as process environment unless the new readable default hook can safely own them; do not mix them with the app-env Xwayland route.
- Keep SM8550's `gamescopeKorriControlEnvironment` as NixOS service environment for the bridge/control surface in this plan, and document that `gamescope.environment` is launch-policy scope, not a replacement for all platform service environment. Preserve the `gamescope.command`-based portal workaround behavior in the new schema shape.

**Patterns to follow:**
- Existing readable example test pattern in `product/platform/library/config/authoring/examples.test.ts`.
- Product/platform checks under `tools/testing/nix/` for cross-tree Nix invariants.

**Test scenarios:**
- Happy path: the example YAML decodes under strict readable schema with the new Gamescope policy.
- Happy path: profile display sizing resolves to `-W/-H` through structured `display.output` fields.
- Happy path: generated/evaluated RK3566 config shows neither the sessiond unit nor the korri-server unit sets `KORRI_GAMESCOPE_FORCE_XWAYLAND`.
- Happy path: generated/evaluated RK3566 config contains `00-korri-platform-defaults.yaml` (or the chosen deterministic fragment name) with `apps.retroarch.gamescope.app.environment.WAYLAND_DISPLAY: null`, and ProseQL includes it in resolved launch policy.
- Happy path: SM8550 keeps the Gamescope command/control environment behavior needed by the no-portal/control-bridge path, with a Nix assertion or config check documenting that these remain service env values.
- Error path: example/fixture checks reject old `gamescope.args`, `gamescope.enabled`, flat `gamescope.backend`, `gamescope.exposeWayland`, and `gamescope.forceXwayland`.

**Verification:**
- Checked-in examples and platform fixtures contain no old Gamescope schema fields.
- Device-specific requirements are represented as config/policy, not special-case renderer env fallbacks.

---

### U6. Keep Runtime Control Separate from Launch Policy

**Goal:** Prevent the new launch policy schema from over-claiming runtime-control behavior, while keeping docs/protocol types coherent with launch-time enum additions.

**Requirements:** R2, R8, R9

**Dependencies:** U1, U4

**Files:**
- Modify: `product/platform/gamescope-control/gamescope-control-protocol.ts`
- Test: `product/platform/gamescope-control/gamescope-control-protocol.test.ts`
- Modify: `docs/acceptance/gamescope-control-api-coverage-contract.md`
- Modify: `docs/acceptance/gamescope-scaling-policy.md`

**Approach:**
- Keep runtime control protocol types separate from the launch-policy schema.
- Do not add a per-launch `gamescope.control` YAML block in this change unless a concrete consumer is introduced in the same unit.
- Decide and encode the launch/runtime filter split: `scaling.filter` may accept upstream launch-time `pixel`, while runtime `filter.set` either remains on the current bridge enum or gains an explicit unsupported/readback-safe representation.
- Keep runtime FPS/direct atom semantics separate from launch-time `display.framerateLimit`.
- Update docs only where the typed launch config changes how operators describe launch defaults or where enum naming could be confused with runtime controls.

**Patterns to follow:**
- `docs/solutions/architecture-patterns/gamescope-runtime-control-contract-2026-06-02.md`.
- Existing protocol/backend tests in `product/platform/gamescope-control/`.

**Test scenarios:**
- Happy path: existing filter/sharpness/readback tests still pass with any enum updates.
- Edge case: launch-time `pixel` filter is accepted by launch config while runtime mutation either remains unsupported with clear typing or gains verified readback-safe support.
- Error path: no per-game control lifecycle fields are accepted by `GamescopePolicy` unless a concrete consumer is added.

**Verification:**
- Control docs and protocol tests agree on which values are launch policy only, runtime controls, API-only, or automation-gated.

---

### U7. Update Readable Records and Cross-Layer Test Fixtures

**Goal:** Repair all record tests, RPC tests, and fixtures that currently depend on the old Gamescope shape.

**Requirements:** R1, R7, R10

**Dependencies:** U1, U2, U3, U4, U5

**Files:**
- Modify: `product/platform/library/config/records/preset.test.ts`
- Modify: `product/platform/library/config/ephemeral-override.test.ts`
- Modify: `product/platform/library/config/app-materializer.test.ts`
- Modify: `product/platform/library/config/compose-readable-launch-spec.test.ts`
- Modify: `product/apps/portal/api/server/prepare.rpc-handler.test.ts`
- Modify: `product/apps/portal/api/stream/prepare.rpc-handler.test.ts`
- Modify: `product/apps/portal/api/library/launch.rpc-handler.test.ts`
- Modify: `product/apps/portal/api/server/prepare.rpc.ts`
- Modify: `product/apps/portal/api/stream/prepare.rpc.ts`

**Approach:**
- Convert every old fixture to the new nested shape rather than adding compatibility helpers.
- Update RPC response/request schema expectations if Gamescope policy appears on the wire.
- Replace `args` cascade tracing with `extraArgs` or a richer combination of typed fields that proves the same cascade ordering.
- Keep test intent focused: schema tests prove decode/rejection, cascade tests prove merge, renderer tests prove argv/env, API tests prove transport.

**Patterns to follow:**
- Current fixture style in the listed tests.
- Strict retired-vocabulary checks from the readable schema work.

**Test scenarios:**
- Happy path: every readable record layer that accepts `gamescope` accepts the new nested shape.
- Happy path: ephemeral override can add `extraArgs`, override `window` flags, and set/unset `app.environment`.
- Integration: portal prepare/launch handlers serialize and deserialize the new Gamescope policy unchanged.
- Error path: old-field fixtures fail until rewritten, ensuring no compatibility bridge remains.

**Verification:**
- Whole-repo typecheck no longer exposes stale `GamescopeOptions`/`GamescopePolicy` field references.

---

### U8. Document the New Contract and Guard Future Drift

**Goal:** Make the new Gamescope API discoverable and protect it against upstream drift and accidental old-vocabulary reintroduction.

**Requirements:** R2, R8, R9, R10

**Dependencies:** U1-U7

**Files:**
- Modify: `docs/brainstorms/2026-06-08-001-gamescope-policy-one-to-one.example.yaml`
- Modify: `product/vendor/gamescope-korri/patches/README.md`
- Modify: `product/vendor/gamescope-korri/package.nix`
- Create: `docs/solutions/design-patterns/typed-gamescope-policy-over-raw-argv-2026-06-08.md` *(only if implementation confirms a reusable pattern worth preserving)*
- Test: `product/platform/library/config/authoring/examples.test.ts`

**Approach:**
- Update the brainstorm/example file to match the final public shape and pinned-source-verified enums.
- Document that `extraArgs` is an escape hatch, not the primary API.
- Update Gamescope package/patch docs with the 3.16.x flag inventory source and the distinction between upstream CLI, Korri patch env vars, and Korri control atoms.
- Add or extend vocabulary guards for old fields in the canonical example/tests.
- Only add a new `docs/solutions/` pattern if the implementation establishes a reusable architectural rule beyond this plan; otherwise keep documentation local to the config/API files and example.

**Patterns to follow:**
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md` for concise reusable design-pattern docs.
- Existing vendor patch README style in `product/vendor/gamescope-korri/patches/README.md`.

**Test scenarios:**
- Happy path: documentation examples are parseable or mirrored by executable fixtures where possible.
- Error path: old field names are caught by tests that scan the canonical example.

**Verification:**
- An implementer/operator can read the example and understand how to set Gamescope process env vs wrapped-app env.
- Future vendor-bump reviewers have a clear source-of-truth note for CLI parity.

---

## System-Wide Impact

- **Interaction graph:** Readable YAML decode, cascade resolution, launch RPC, stream preparation, sessiond/game-stream intent transport, and Gamescope control docs all share the `GamescopePolicy` type.
- **Error propagation:** Strict decode should surface old/invalid Gamescope keys at config load/launch resolution rather than rendering partial commands.
- **State lifecycle risks:** Ephemeral launch intent files containing old policy shape may fail after update; acceptable because this is a breaking config change and intent files are runtime state, not durable user data.
- **API surface parity:** Local UI launch, remote stream prepare, Moonlight launcher, and source-machine runner must all consume the same renderer path.
- **Integration coverage:** Unit tests must prove schema/cascade/rendering, while later device validation should prove Bandai/RG353M behavior.
- **Unchanged invariants:** Sessiond remains foreground lifecycle owner; Gamescope remains a presentation adapter. ROM target resolution and artifact/media behavior are unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Old config silently accepted through a forgotten schema path | Keep strict decode and add tests that old fields throw across policy/layer decoders. |
| RG353M regresses because `KORRI_GAMESCOPE_FORCE_XWAYLAND` is removed without replacement | Include platform-default realignment in U5 and require `app.environment.WAYLAND_DISPLAY: null` coverage. |
| Launch/control enum split misleads operators (especially `pixel` filter) | Keep launch-time and runtime-control filter types distinct unless the X11 backend mapping/readback is verified; document unsupported runtime values explicitly. |
| Flag parity drifts from upstream Gamescope | Centralize mapping in one renderer and document the 3.16.x source reference. |
| Full typed surface becomes too large to implement safely | Sequence schema, cascade, renderer, callers, fixtures, and docs as separate atomic units with targeted tests. |
| `environment` null semantics confuse authors if inconsistent | Use the same string/null convention for both `gamescope.environment` and `gamescope.app.environment`; document outer app `env` as separate existing behavior. |

---

## Documentation / Operational Notes

- Existing deployed configs using old fields must be rewritten before or with the binary update; this plan intentionally does not include a compatibility reader.
- Bandai's temporary app-level workaround should become:

  ```yaml
  apps:
    retroarch:
      gamescope:
        app:
          environment:
            WAYLAND_DISPLAY: null
  ```

- RG353M still needs PanVK/Gamescope process environment and Gamescope patches `0001`-`0003`; this plan only changes how Korri policy expresses the wrapped-app Xwayland route.
- Physical device verification remains the right evidence for visual freeze fixes after code implementation.

---

## Sources & References

- Draft API shape: `docs/brainstorms/2026-06-08-001-gamescope-policy-one-to-one.example.yaml`
- Current schema: `product/platform/library/config/inheritable-fields.ts`
- Cascade resolver: `product/platform/library/config/cascade-resolver.ts`
- Launch renderer: `product/platform/stream/gamescope-launch-spec.ts`
- Gamescope package manifest: `product/vendor/gamescope-korri/package.nix`
- RG353M platform defaults: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- SM8550 platform defaults: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Current readable example: `korri-catalog-display-metadata.example.yaml`
- Related learning: `docs/solutions/runtime-errors/gamescope-backend-auto-fights-sway-for-drm-master-2026-05-27.md`
- Related learning: `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`
- Related learning: `docs/solutions/architecture-patterns/gamescope-runtime-control-contract-2026-06-02.md`
- Related backlog: `backlog/task-036 - product-level-config-defaults-platforms-inherit-gamescope-policy-env.md`
- Related backlog: `backlog/task-038 - minimize-rg353m-gamescope-patch-set-after-xwayland-routing.md`
