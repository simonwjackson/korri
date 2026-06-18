---
title: refactor: Convert Steam to a first-party plugin
type: refactor
status: active
date: 2026-06-18
origin: direct prompt: product/plugins/AGENTS.md and .worktrees/refactor/retroarch-plugin/
verify_command: "bun test product/plugins/steam/src/plugin.test.ts product/plugins/steam/src/materializer.test.ts product/plugins/steam/src/launch-spec.test.ts product/plugins/steam/src/state-materializer.test.ts product/plugins/steam/src/observability/*.test.ts product/plugins/index.test.ts product/plugins/library-source-layer.test.ts product/platform/library/config/records/app.test.ts product/platform/library/config/app-choice-selection.test.ts product/platform/library/config/readable-cascade-resolver.test.ts product/platform/library/config/app-materializer.test.ts product/platform/library/proseql/library-repository.test.ts product/services/device/game-stream-launch-intent.test.ts product/platform/plugin/launch-companion.test.ts product/plugins/gamescope/src/plugin.test.ts product/apps/portal/api/stream/prepare.rpc-handler.test.ts product/apps/portal/api/plugin-diagnostics/*.test.ts product/apps/portal/api/server/rpc-server.test.ts product/services/device/sessiond.test.ts product/services/device/inputd-actions.test.ts product/systems/nixos/flake/plugins.test.ts && just test-nix && just typecheck && just lint"
---

# refactor: Convert Steam to a first-party plugin

## Summary

Move Steam from a platform-known app kind into a first-party `@korri:steam` plugin. After this migration, generic Korri platform/services/API/Nix code should route through provider-qualified plugin ids, generic plugin policy payloads, registered launch integrations, lifecycle hooks, diagnostics handlers, and product composition. Steam-specific launch parsing, Steam state mutation, log observation, residual process cleanup, package/module wiring, and UI diagnostics live under the Steam plugin or explicit product composition, not Korri core.

This plan intentionally builds on the landed RetroArch plugin work on `trunk`, which introduced the provider-qualified app/integration pattern Steam needs.

---

## Problem Frame

Korri currently knows Steam in several layers:

- readable config schemas expose `kind: steam`, `state`, `extra`, and `launch-options` as first-class app fields;
- platform launch materialization dispatches `isSteamAppRecord(...)` directly;
- platform stream code parses Steam AppIDs and renders `steam -applaunch` specs;
- device services install Steam log observers and Steam residual-process cleanup directly;
- portal RPC exposes `app.steam.status` as a hardcoded app API;
- Nix modules/images/checks know `services.korri.steam` and Steam package helpers;
- the Vigie live cockpit polls and renders Steam-specific status directly.

That violates the desired plugin boundary: Korri should know how to resolve provider-qualified app records and invoke plugin-owned operations; it should not know what Steam is.

---

## Requirements

- R1. Introduce `@korri:steam` as the stable first-party plugin/provider id and expose the Steam app as `@korri:steam/steam`.
- R2. Replace `kind: steam` with provider-qualified app kind `@korri:steam`; generic app records must not special-case Steam ids or fields.
- R3. Move Steam launch policy from top-level app fields (`state`, `extra`, `launch-options`) into `plugin."@korri:steam"` payloads decoded by the Steam plugin.
- R4. Move Steam launch-spec parsing/rendering and state materialization into `product/plugins/steam/` behind a registered readable launch integration.
- R5. Remove direct Steam dispatch from generic library repository/materializer code; provider-qualified app kinds fail closed without an enabled registered integration.
- R6. Move Steam diagnostics and log observation behind plugin-owned diagnostics surfaces; remove hardcoded `app.steam.status` from every RPC group and handler map in the same slice.
- R7. Move Steam foreground residual cleanup out of sessiond/inputd special cases and into generic plugin lifecycle/session cleanup hooks.
- R8. Move Steam Nix package/module/check ownership into the Steam plugin boundary or explicit product composition, so core Nix module/flake code does not hardcode Steam behavior.
- R9. Preserve the current validated product behavior: Steam AppID launches must use Korri's Gamescope integration/runtime as the safe default; the parked per-game LaunchOptions Gamescope wrapper remains opt-in/experimental and is not reintroduced as default.
- R10. Preserve Steam safety constraints: no Steamworks emulators, DRM bypass tooling, or direct non-Steam launch path for Steamworks-heavy games.
- R11. Update fixtures/examples/tooling/tests to the plugin-qualified shape and add boundary checks that prevent new platform/service/API Steam coupling.
- R12. Replace the stream-launch `appIntegration: "steam"` sideband with generic provider-qualified launch metadata so Steam-inside-Gamescope survives without core Steam branches.
- R13. Prove Steam availability through the live `PluginLibrarySourceLayerLive` composition path, not only manually constructed repository options.
- R14. Validate all Steam plugin handler inputs at operation boundaries; malformed `context.input` must fail safely.
- R15. Decide ownership for Steam-dependent adjacent runtime plugins (`@korri:proton-runtime`, `@korri:fex-runtime`) so Steam paths do not remain accidental cross-plugin globals.
- R16. Migrate acquisition/protocol examples and provider facts that already use `@korri:steam` so the Steam plugin is the provider source of truth even if live Steam-store search remains out of scope.

---

## Scope Boundaries

- This is a breaking alpha migration. Do not keep `apps.steam`, `kind: steam`, top-level `launch-options`, or top-level Steam `state/extra` as primary authoring shapes.
- Do not build third-party/user-installed plugin loading, marketplace behavior, sandboxing, trust tiers, or semver plugin dependencies.
- Do not solve Steam first-run UX, account login, self-update failures, Proton install UX, or per-game compatibility research except where existing behavior must keep working.
- Do not revive the parked per-game Gamescope LaunchOptions wrapper as the default path.
- Do not add Steam-specific compatibility branches, shims, migration indicators, or old/new coexistence paths. This is a full breaking alpha migration.
- Do not migrate unrelated plugins or integrations except where generic plugin seams need to support Steam.

### Allowed Steam References After Completion

Steam-specific names may remain only in:

- `product/plugins/steam/**`;
- Steam-owned package/vendor sources, until moved under the plugin package layout;
- integration-specific plugin code with an explicit provider contract to `@korri:steam` (for example Gamescope's internal Steam-session flag handling), but not generic platform/services/apps code;
- plugin tests and plugin docs;
- explicit product/image composition that opts into `@korri:steam`;
- historical docs/work items that describe prior behavior.

Generic code under `product/platform/**`, `product/services/**`, `product/apps/portal/api/**`, and shared Nix module plumbing should not contain Steam-specific launch, status, process, or policy logic.

---

## Context & Research

### Plugin Authoring Contract

`product/plugins/AGENTS.md` establishes the target shape:

- plugin identity is descriptor-owned: `namespace` + `name` -> `@korri:steam`;
- non-provider config maps are registry-namespaced as `<plugin-id>/<local-id>`;
- plugins can contribute static config (`apps`, `storage`, `modules`, `runtimes`, `profiles`, `catalog`) and operation-scoped handlers;
- launch/materialization behavior belongs behind plugin-owned handlers or registered integration seams;
- default-enabled infrastructure plugins must update enablement logic and tests deliberately.

### RetroArch Plugin as Precedent

The landed RetroArch plugin is the immediate implementation pattern:

- `product/plugins/retroarch/src/plugin.ts` contributes app id `@korri:retroarch/retroarch` with kind `@korri:retroarch`.
- `product/plugins/retroarch/src/materializer.ts` exports a provider-owned `retroarchReadableLaunchIntegration`.
- `product/plugins/index.ts` filters first-party launch integrations by enabled plugin registry.
- `product/platform/library/proseql/library-repository.ts` fails closed for provider-qualified app kinds without a registered integration.
- `product/platform/library/config/records/app.ts` removes RetroArch typed fields from the generic app schema while Steam remains as the next hardcoded integration to remove.

Steam should follow the same shape, but with additional work for observability, lifecycle cleanup, and Nix ownership.

### Post-RetroArch Gap Review

The landed RetroArch branch exposed several Steam-specific gaps that this plan must cover explicitly:

- Launch intent metadata still carries `appIntegration: "steam"` in `product/services/device/game-stream-launch-intent.ts`, `product/apps/portal/api/stream/prepare.rpc-handler.ts`, `product/apps/cli/stream-launch.ts`, and `product/platform/plugin/launch-companion.ts`. This is the critical sideband Gamescope uses to add Steam-session behavior, so it must become generic provider-qualified launch metadata before `kind: steam` disappears.
- Session lifecycle hooks are not yet plugin-contributed. `product/services/device/sessiond-plugin-composition.ts` hardcodes Gamescope hook construction; Steam cleanup needs a generic plugin-to-sessiond hook factory/registration seam, not another hardcoded plugin import.
- `app.steam.status` is registered in both `product/apps/portal/api/handlers.ts` and `product/apps/portal/api/server/rpc-server.ts`; replacing the RPC file alone would leave the endpoint live.
- Live plugin-library wiring flows through `product/plugins/library-source-layer.ts`; Steam must be tested through that production layer, not only through manually-passed launch integrations.
- Existing acquisition/protocol tests already use `@korri:steam` provider ids with unqualified app choice ids. Those examples need plugin-qualified app ids or an explicit statement that they are provider-claim examples, not launch config examples.
- Adjacent runtime plugins currently bake Steam paths (`product/plugins/proton-runtime/src/plugin.ts`, `product/plugins/fex-runtime/src/plugin.ts`). They either need declared dependency on `@korri:steam`, provider-owned config input, or migration under the Steam plugin boundary.

### Existing Steam Surfaces to Migrate

Config/materialization:

- `product/platform/library/config/records/app.ts`
- `product/platform/library/config/inheritable-fields.ts`
- `product/platform/library/config/app-choice-selection.ts`
- `product/platform/library/config/cascade-resolver.ts`
- `product/platform/library/config/resolved-launch-context.ts`
- `product/platform/library/config/app-integrations.ts`
- `product/platform/library/config/app-materializer.ts`
- `product/platform/library/config/steam-state-materializer.ts`
- `product/platform/stream/steam-launch-spec.ts`
- `product/platform/library/proseql/library-repository.ts`
- `product/platform/library/config/fixtures/steam-full.korri.yaml`

Device/runtime:

- `product/services/device/korrid.ts`
- `product/services/device/sessiond.ts`
- `product/services/device/sessiond-plugin-composition.ts`
- `product/services/device/inputd-actions.ts`
- `product/services/device/steam-foreground-processes.ts`
- `product/services/device/steam-log-observer.ts`
- `product/services/device/steam-log-tailer.ts`
- `product/services/device/steam-log-signals.ts`
- `product/services/device/steam-launch-state.ts`
- `product/services/device/steam-evidence-sanitizer.ts`

API/UI/tooling:

- `product/apps/portal/api/steam/status.rpc.ts`
- `product/apps/portal/api/steam/status.rpc-handler.ts`
- `product/apps/portal/api/app-rpc-group.ts`
- `product/apps/portal/api/server/rpc-group.ts`
- `product/themes/vigie/cockpit/live/VigieLiveCockpitRoot.tsx`
- `product/themes/vigie/cockpit/live/VigieLiveCockpitData.ts`
- `product/apps/cli/stream-launch.ts`

Nix/package composition:

- `product/systems/nixos/modules/korri-steam.nix`
- `product/systems/nixos/overlays/korri-packages.nix`
- `product/systems/nixos/flake/packages.nix`
- `product/systems/nixos/flake/checks.nix`
- `product/systems/nixos/flake/modules.nix`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `product/systems/nixos/images/desktop-lab.nix`
- `tools/testing/nix/korri-steam-module-check.nix`
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- `product/vendor/steam-korri/**`

### Institutional Learnings

- `docs/solutions/architecture-patterns/steam-inside-gamescope-preserves-steam-input-2026-06-15.md`: Steam-inside-Gamescope is the current validated default for controller-sensitive Steam games.
- `docs/handoffs/steam-launchoptions-wrapper-parked-2026-06-15.md`: the per-game LaunchOptions wrapper is explicitly parked.
- `docs/solutions/architecture-patterns/steam-applaunch-with-silent-steam-and-per-app-launchoptions-gamescope-wrap-aka-x86-2026-05-27.md`: Steamworks-heavy titles must launch through Steam itself; VDF mutation must happen only while Steam is shut down.
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`: launch behavior should come from explicit policy, not argv/env heuristics.
- `docs/solutions/architecture-patterns/korri-plugin-architecture-2026-06-02.md`: plugin ids are provider-style identities and handlers stay operation-scoped.
- `docs/solutions/architecture-patterns/gamescope-as-plugin-owned-composition-2026-06-17.md`: plugin conversions must remove conceptual coupling from generic code, not just move files.

### Pre-Conversion Baseline Verification (2026-06-18)

Before implementation, Bandai was stabilized and re-verified so the plugin conversion starts from a known-working Steam baseline:

- A launch regression was traced to `korri-steam-app` using hardcoded `/bin/systemctl` for its warm-Steam active check. On Bandai, `/bin/systemctl` is absent in the `korri` runtime, so the wrapper misclassified already-running Steam as newly-started and timed out waiting for readiness logs before forwarding `-applaunch`.
- The fix is to use the Nix-provided `${pkgs.systemd}/bin/systemctl` path consistently. A focused regression test now asserts the generated wrapper source does not use `/bin/systemctl` for this check.
- Direct Steam `-applaunch 1029210` and the full Korri launch path both launched 30XX through Steam/Proton/FEX with Freedreno available. After switching Bandai from a clean worktree with the Steam fix, `app.library.launch` for `thirty-xx` reached `mode: game`, `phase: running`.
- The final Sway state after launch had `30XX 1.4.0` visible/focused/fullscreen and the Steam window hidden/not visible. Steam may briefly surface for Steam interstitial confirmation during launch; the design requirement is that the final running state hides Steam to avoid the “hat on a hat” feel.
- Stopping the session returned sessiond to `home`, but some 30XX/Proton child processes remained and required manual cleanup. This confirms U4 must preserve and strengthen residual Steam cleanup through plugin lifecycle hooks.

---

## Key Technical Decisions

- **Plugin identity:** Use `@korri:steam` as the provider/plugin id and `@korri:steam/steam` as the app record id.
- **App kind:** Use `kind: "@korri:steam"`; remove `kind: "steam"` from the primary authored/runtime shape.
- **Policy carrier:** Use `plugin."@korri:steam"` for Steam state root, startup args, LaunchOptions, runtime/tool selection, and any Steam-specific mutation policy.
- **Materialization seam:** Add a `steamReadableLaunchIntegration` exported from `product/plugins/steam/` and registered through `firstPartyLaunchIntegrationsForRegistry(...)`.
- **No generic Steam context field:** Remove `ReadableResolvedLaunchContext.steam`; the resolved context carries plugin payloads generically.
- **Status/diagnostics seam:** Replace `app.steam.status` with generic provider diagnostics in the same slice. Do not keep a compatibility shim; this is a full breaking alpha migration.
- **Launch metadata seam:** Provider-qualified launch metadata lives in the resolved launch result and is persisted into stream launch intents. Do not put plugin metadata inside `LaunchSpec`, and do not hide it only in artifacts.
- **Lifecycle cleanup seam:** Sessiond/inputd should ask enabled typed plugin lifecycle hooks to clean residual foreground work. They should not parse `steam -applaunch`, `korri-steam-app`, or Steam process names directly.
- **Enablement:** `@korri:steam` is enabled only by explicit product or device composition. It is not globally enabled for every first-party plugin registry.
- **Nix ownership:** Steam package/module/check implementation lives under `product/plugins/steam/`; product systems import or enable it explicitly. Generic Nix module plumbing should not imply Steam.
- **Default launch posture:** Require Korri's Gamescope integration/runtime for Steam AppID launches and express Steam-inside-Korri-Gamescope as plugin-contributed app launch companion policy, not as platform Steam logic.
- **Safety posture:** Keep direct Steamworks emulators/DRM bypass integrations out of Korri and out of the Steam plugin.
- **Adjacent runtime posture:** Deeply coupled FEX/Proton behavior may move under the Steam plugin for this slice. Reusing the existing FEX/Proton plugins is a later cleanup after the Steam boundary is stable.
- **Rollback posture:** Rollback is git revert plus manual device config rollback. Do not add old/new coexistence, runtime auto-migration, or compatibility indicators.
- **Boundary check:** Ban Steam words from generic core paths. Allow them only in `product/plugins/steam/**`, explicit product/device composition that opts into Steam, historical docs/work items, and plugin-specific code with an explicit Steam-provider contract.

---

## Challenge Decisions

Resolved during plan challenge:

1. **No compatibility route.** Remove `app.steam.status`, `kind: steam`, `apps.steam`, top-level Steam `state`/`extra`/`launch-options`, and `appIntegration: "steam"` in the same slice. Old shapes should fail, not warn or translate.
2. **Explicit enablement only.** `@korri:steam` is enabled by explicit product or device composition, not by every first-party plugin registry by default.
3. **Steam Nix ownership.** Steam Nix module and package implementation live under `product/plugins/steam`, with product systems importing or enabling them explicitly.
4. **Launch metadata location.** Provider-qualified launch metadata lives in the resolved launch result and stream launch intent. `LaunchSpec` stays pure process execution.
5. **Typed lifecycle hook contribution.** Use a typed plugin lifecycle hook contribution seam for sessiond integration. Do not use a loose one-shot cleanup handler and do not hardcode Steam beside Gamescope.
6. **FEX/Proton coupling allowed inside Steam plugin.** Deep current coupling is acceptable inside `product/plugins/steam`; extracting reusable FEX/Proton behavior can happen later.
7. **Rollback posture.** Rollback is git revert plus manual device config rollback. Do not add compatibility migration machinery.
8. **Boundary check.** Ban Steam words from generic core paths. Allow them in `product/plugins/steam/**`, explicit product/device composition, historical docs/work items, and plugin-specific code with an explicit Steam-provider contract.

### Still Resolve During Implementation

- **Generic diagnostics shape:** Use a generic provider diagnostics path, but the exact tag/location (`app.plugin.diagnostics.collect` versus an existing status surface) can be decided during U5 as long as it does not preserve `app.steam.status`.

### Deferred During Execution Unless Blocking

- A polished UI picker or status page for plugin diagnostics.
- Steam first-run/bootstrap/login UX.
- Desired-state diffing to avoid VDF mutation when state already matches.
- Reconsidering the parked per-game LaunchOptions wrapper.

---

## Implementation Units

### U0. Confirm the landed RetroArch plugin boundary

**Goal:** Ensure Steam implementation starts from the landed provider-qualified launch-integration seam instead of re-building it independently.

**Requirements:** R1, R2, R5

**Files:**

- Reference: `product/plugins/retroarch/src/plugin.ts`
- Reference: `product/plugins/retroarch/src/materializer.ts`
- Reference: `product/plugins/index.ts`
- Reference: `product/platform/library/proseql/library-repository.ts`

**Approach:**

- Start from current `trunk`, where the RetroArch plugin boundary has landed.
- Preserve its generic provider-qualified behavior: enabled-plugin filtering, registered launch integrations, and fail-closed provider-qualified app kinds.
- Treat any missing generic seam as Steam migration scope only if Steam needs it and it remains integration-agnostic.

**Test scenarios:**

- Provider-qualified app kinds fail closed without a registered integration.
- Disabled plugin launch integrations are not exposed to repository resolution.
- Enabled plugin launch integrations are visible to library source composition.

**Verification:**

- Re-run the landed RetroArch targeted plugin/library tests before changing Steam.

---

### U1. Add the `@korri:steam` plugin descriptor and authored config shape

**Goal:** Introduce Steam as a first-party plugin/provider with plugin-qualified app identity.

**Requirements:** R1, R2, R3, R9

**Files:**

- Add: `product/plugins/steam/index.ts`
- Add: `product/plugins/steam/README.md`
- Add: `product/plugins/steam/src/plugin.ts`
- Add: `product/plugins/steam/src/plugin.test.ts`
- Modify: `product/plugins/index.ts`
- Modify: `product/plugins/index.test.ts`
- Modify: `product/plugins/library-source-layer.ts` if live composition needs a new provider metadata path
- Add or modify: `product/plugins/library-source-layer.test.ts`
- Modify: `product/plugins/AGENTS.md` only if the Steam migration discovers a reusable plugin-authoring rule missing from the guide.

**Approach:**

- Define `KORRI_STEAM_PLUGIN_ID = "@korri:steam"` and `KORRI_STEAM_APP_ID = "@korri:steam/steam"`.
- Contribute an app record with local id `steam`, full id `@korri:steam/steam`, kind `@korri:steam`, command `steam`, and no Steam-specific top-level fields.
- Put Steam policy defaults under `plugin: { "@korri:steam": ... }`.
- Express Steam-inside-Korri-Gamescope as required launch companion policy under `launch.with."@korri:gamescope"`, not through Steam-specific Gamescope fields.
- Do not enable `@korri:steam` globally by default. Product/device composition must opt into it explicitly.
- If Steam needs Gamescope or bundled FEX/Proton behavior, model that inside the Steam plugin descriptor/composition instead of relying on generic default enablement.

**Test scenarios:**

- Plugin descriptor has stable id `@korri:steam` and contributes provider metadata.
- App contribution is namespaced by registry as `@korri:steam/steam`.
- App kind is `@korri:steam`, not `steam`.
- The descriptor contributes only generic config maps and operation-scoped handlers.
- Registry tests prove `@korri:steam` is absent unless explicit composition enables it.
- Add a live plugin-library-source test proving `@korri:steam` launch integration is exposed when enabled by product/device composition and absent when not enabled.

**Verification:**

- `bun test product/plugins/steam/src/plugin.test.ts product/plugins/index.test.ts product/plugins/library-source-layer.test.ts product/platform/plugin/registry.test.ts`

---

### U2. Remove Steam from generic config schemas and cascade state

**Goal:** Make readable config carry Steam data only as plugin payload, not as hardcoded app fields or context properties.

**Requirements:** R2, R3, R5, R11

**Files:**

- Modify: `product/platform/library/config/records/app.ts`
- Modify: `product/platform/library/config/records/app.test.ts`
- Modify: `product/platform/library/config/records/app-choice.ts`
- Modify: `product/platform/library/config/records/app-choice.test.ts`
- Modify: `product/platform/library/config/inheritable-fields.ts`
- Modify: `product/platform/library/config/app-choice-selection.ts`
- Modify: `product/platform/library/config/app-choice-selection.test.ts`
- Modify: `product/platform/library/config/cascade-resolver.ts`
- Modify: `product/platform/library/config/readable-cascade-resolver.test.ts`
- Modify: `product/platform/library/config/resolved-launch-context.ts`
- Modify: `product/platform/library/config/app-integrations.ts`
- Modify: `product/platform/library/config/app-integrations.test.ts`
- Modify: `product/platform/library/config/fixtures/steam-full.korri.yaml`
- Modify: `product/platform/library/config/authoring/examples.test.ts`
- Modify: `product/platform/library/config/records/readable-schema.test.ts`
- Modify: `product/platform/protocol/acquisition/schemas.test.ts`
- Modify: `product/platform/library/acquisition/source-candidate-adapter.test.ts`
- Modify: `product/platform/library/config/source-target-resolution.test.ts` only where Steam examples imply launch config rather than opaque target strings

**Approach:**

- Delete `SteamPolicy`, `decodeSteamPolicy`, `STEAM_APP_FIELD_KEYS`, `isSteamAppRecord`, and `appSteamPolicyFromRecord` from generic config modules.
- Remove `state`, `extra`, and `launch-options` from generic `AppPayloadBase`.
- Remove the built-in `steam` descriptor from `app-integrations.ts`.
- Preserve generic `plugin` payload folding and selection, because that is the new Steam carrier.
- Update fixtures/examples from `apps.steam` / `kind: steam` to `apps."@korri:steam/steam"` / `kind: "@korri:steam"` with `plugin."@korri:steam"` policy.
- Update acquisition/protocol examples that use `@korri:steam` provider ids with app choices so they do not teach the retired `apps: [{ id: "steam" }]` launch shape.
- Keep validation generic: top-level `launch-options` should be rejected as an unknown app field, not with a Steam-specific error from core.

**Test scenarios:**

- `decodeAppRecord` accepts provider-qualified app kinds with plugin payloads.
- `decodeAppRecord` rejects top-level `launch-options`, `state`, and `extra` via strict excess-property behavior.
- Readable cascade carries plugin payloads into `ReadableResolvedLaunchContext.plugin` without creating `context.steam`.
- A Steam fixture using `@korri:steam/steam` resolves app choice selection generically.
- Acquisition/protocol examples using `@korri:steam` provider ids either use the plugin-qualified app id or are explicitly non-launch provider-claim fixtures.
- Existing non-Steam app choice/cascade behavior remains unchanged.

**Verification:**

- `bun test product/platform/library/config/records/app.test.ts product/platform/library/config/records/app-choice.test.ts product/platform/library/config/app-choice-selection.test.ts product/platform/library/config/readable-cascade-resolver.test.ts product/platform/library/config/authoring/examples.test.ts`

---

### U3. Move Steam launch spec and state materialization into the plugin

**Goal:** Steam launch resolution is plugin-owned and invoked through the registered launch integration seam.

**Requirements:** R4, R5, R9, R10

**Files:**

- Move: `product/platform/stream/steam-launch-spec.ts` -> `product/plugins/steam/src/launch-spec.ts`
- Move: `product/platform/stream/steam-launch-spec.test.ts` -> `product/plugins/steam/src/launch-spec.test.ts`
- Move: `product/platform/library/config/steam-state-materializer.ts` -> `product/plugins/steam/src/state-materializer.ts`
- Move: `product/platform/library/config/steam-state-materializer.test.ts` -> `product/plugins/steam/src/state-materializer.test.ts`
- Add: `product/plugins/steam/src/materializer.ts`
- Add: `product/plugins/steam/src/materializer.test.ts`
- Modify: `product/platform/library/config/app-materializer.ts`
- Modify: `product/platform/library/config/app-materializer.test.ts`
- Modify: `product/platform/library/proseql/library-repository.ts`
- Modify: `product/platform/library/proseql/library-repository.test.ts`
- Modify: `product/platform/library/proseql/proseql-library-source.test.ts`
- Modify: `product/plugins/index.ts`

**Approach:**

- Create `steamReadableLaunchIntegration` with `providerId: "@korri:steam"`, `kind: "@korri:steam"`, and `integration: "steam"` for reporting.
- Decode `context.plugin?.["@korri:steam"]` at the plugin boundary.
- Keep AppID parsing restricted to `steam://rungameid/<appid>`.
- Keep `%command%` validation and VDF materialization behavior inside the plugin.
- Preserve the current Steam window policy: Steam may be surfaced only for required interstitial handoff/confirmation, then hidden again so the final running game state has the AppID window focused/fullscreen and Steam not visible.
- Remove `materializeReadableSteamLaunch(...)` and Steam helper imports from generic `app-materializer.ts`.
- Remove `isSteamAppRecord(...) ? materializeReadableSteamLaunch(...)` from `library-repository.ts`; provider-qualified dispatch handles Steam.
- Return artifacts/diagnostics through the same `ReadableLaunchIntegration` materialization result used by RetroArch/Ryubing.
- Resolve `{storage:steam}` and other storage tokens from plugin payload fields before state mutation; missing storage should fail before any VDF write.
- Preserve system/release app-choice override semantics by folding `plugin."@korri:steam"` payloads from app definitions and app choices into the resolved context.

**Test scenarios:**

- `steamReadableLaunchIntegration.canResolve(...)` is true for provider-qualified Steam context with valid AppID and plugin policy state root.
- Invalid Steam target fails with the plugin-owned `InvalidSteamTarget` error.
- LaunchOptions containing Korri `{...}` placeholders are rejected by plugin validation.
- Materialization shuts down Steam, writes desired state, starts Steam, waits for readiness, and returns `steam -applaunch <appid>` using configurable lifecycle/filesystem/lock implementations.
- Plugin payload `state.root` and startup args containing `{storage:steam}` resolve to concrete storage paths; missing or non-directory storage fails without writing state.
- Release/system app choices can override Steam plugin policy through `plugin."@korri:steam"`; retired top-level app-choice `launch-options` is rejected.
- Repository can resolve a plugin-qualified Steam release only when `steamReadableLaunchIntegration` is registered.
- Repository fails closed with a provider-qualified missing-integration error when `@korri:steam` is disabled or integration registration is absent.

**Verification:**

- `bun test product/plugins/steam/src/launch-spec.test.ts product/plugins/steam/src/state-materializer.test.ts product/plugins/steam/src/materializer.test.ts product/platform/library/config/app-materializer.test.ts product/platform/library/proseql/library-repository.test.ts product/platform/library/proseql/proseql-library-source.test.ts`

---

### U3.5. Replace Steam-specific launch sideband metadata

**Goal:** Stream preparation and launch-companion composition preserve Steam session behavior through generic provider metadata, not `appIntegration: "steam"`.

**Requirements:** R5, R9, R12

**Files:**

- Modify: `product/services/device/game-stream-launch-intent.ts`
- Modify: `product/services/device/game-stream-launch-intent.test.ts`
- Modify: `product/apps/portal/api/stream/prepare.rpc-handler.ts`
- Modify: `product/apps/portal/api/stream/prepare.rpc-handler.test.ts`
- Modify: `product/apps/cli/stream-launch.ts`
- Modify: `product/apps/cli/stream-launch.test.ts`
- Modify: `product/platform/plugin/launch-companion.ts`
- Modify: `product/platform/plugin/launch-companion.test.ts`
- Modify: `product/plugins/gamescope/src/plugin.ts`
- Modify: `product/plugins/gamescope/src/plugin.test.ts`
- Modify: `product/plugins/gamescope/src/launch-companion/wrapper.test.ts`

**Approach:**

- Replace `GameStreamLaunchAppIntegration = "steam"` with a generic provider-qualified metadata map or an `appProviderId`/`appKind` field that can carry `@korri:steam` without naming Steam in the intent schema.
- Replace `LaunchCompanionComposeOptions.appIntegration?: string` with generic launch metadata, for example selected app provider id and plugin-owned launch annotations.
- Have the Steam launch integration require the Korri Gamescope companion and annotate resolved launches with enough provider metadata for Gamescope to opt into its internal Steam-session `-e` behavior.
- Keep Gamescope's Steam-specific rendering inside the Gamescope plugin; remove the core-side condition `resolved.app?.integration === "steam" ? "steam" : undefined`.
- Do not preserve backward-compatible intent decoding for `appIntegration: "steam"`; queued local intents may fail across the breaking migration and should be regenerated.

**Test scenarios:**

- Preparing a Steam plugin launch writes an intent with provider-qualified metadata and no `appIntegration: "steam"` field.
- Decoding a launch intent rejects unknown provider ids and accepts valid provider-qualified metadata.
- Gamescope launch composition receives generic metadata and adds Steam-session behavior only when the selected app provider is `@korri:steam` or when the Steam plugin explicitly annotates the launch.
- Steam plugin launches fail closed or produce a typed unavailable result when the Korri Gamescope integration/runtime is not enabled.
- Non-Steam launches with Gamescope companions do not receive Steam-session flags.
- CLI stream launch uses the same generic metadata path as the portal stream prepare RPC.

**Verification:**

- `bun test product/services/device/game-stream-launch-intent.test.ts product/apps/portal/api/stream/prepare.rpc-handler.test.ts product/apps/cli/stream-launch.test.ts product/platform/plugin/launch-companion.test.ts product/plugins/gamescope/src/plugin.test.ts product/plugins/gamescope/src/launch-companion/wrapper.test.ts`

---

### U4. Move Steam lifecycle cleanup behind plugin session hooks

**Goal:** Sessiond/inputd no longer parse Steam commands or scan Steam foreground processes directly.

**Requirements:** R7, R11

**Files:**

- Move: `product/services/device/steam-foreground-processes.ts` -> `product/plugins/steam/src/session/foreground-processes.ts`
- Move: `product/services/device/steam-foreground-processes.test.ts` -> `product/plugins/steam/src/session/foreground-processes.test.ts`
- Add: `product/plugins/steam/src/session/lifecycle-hook.ts`
- Add: `product/plugins/steam/src/session/lifecycle-hook.test.ts`
- Add or modify: `product/platform/plugin/session-lifecycle.ts` or the chosen generic plugin lifecycle composition seam
- Add or modify: `product/platform/plugin/session-lifecycle.test.ts`
- Modify: `product/services/device/sessiond.ts`
- Modify: `product/services/device/sessiond.test.ts`
- Modify: `product/services/device/sessiond-plugin-composition.ts`
- Modify: `product/services/device/inputd-actions.ts`
- Modify: `product/services/device/inputd-actions.test.ts`

**Approach:**

- First define the generic plugin-to-sessiond hook contribution seam. The landed code only has `sessiond-plugin-composition.ts` hardcoding Gamescope hook construction; do not add Steam as a second hardcoded branch.
- Extend or reuse `KorriSessiondLifecycleHook` so a plugin can receive enough launch metadata to clean up residual foreground children without sessiond knowing Steam command syntax.
- Have the Steam materializer attach provider-owned cleanup metadata through the launch intent path or lifecycle hook handle; if the existing `LaunchSpec` cannot carry metadata, add a small generic launch-context sidecar rather than adding Steam fields to `LaunchSpec`.
- Replace `steamAppIdFromLaunchSpec(...)` in sessiond with generic plugin cleanup hook invocation.
- Replace inputd's stale Steam fallback with either:
  - generic sessiond terminate/reap behavior, or
  - a generic enabled-plugin emergency cleanup operation.
- Generalize `sessionLifecycleHooksFromEnv(...)` so it composes hooks from enabled plugins instead of hardcoding Gamescope and later Steam one by one.
- Decide whether `session.cleanup` plugin handlers are sufficient for this seam or whether sessiond needs a typed lifecycle-hook factory export; whichever is chosen, keep operation input validation at the plugin boundary.

**Test scenarios:**

- The generic lifecycle composition seam returns Gamescope and Steam hooks from enabled plugin metadata without naming either plugin in sessiond core.
- Sessiond invokes plugin cleanup hooks after managed launch termination and before home restore.
- Steam cleanup receives the AppID through provider-owned metadata, not by parsing `steam -applaunch` argv in sessiond.
- Residual Steam foreground PIDs are signaled and escalated through the Steam plugin hook.
- Stopping a 30XX launch through sessiond leaves no `SteamLaunch AppId=1029210`, `30XX.exe`, Proton, or pressure-vessel child processes behind.
- Sessiond has no direct import from Steam plugin internals except through the generic plugin hook composition seam.
- Inputd kill-current-game does not import Steam process matchers and still terminates active sessiond launches.

**Verification:**

- `bun test product/plugins/steam/src/session/foreground-processes.test.ts product/plugins/steam/src/session/lifecycle-hook.test.ts product/services/device/sessiond.test.ts product/services/device/inputd-actions.test.ts`

---

### U5. Move Steam observability/status behind plugin diagnostics

**Goal:** Steam log observation and status rendering are plugin diagnostics, not hardcoded app RPC.

**Requirements:** R6, R11, R14

**Files:**

- Move: `product/services/device/steam-evidence-sanitizer.ts` -> `product/plugins/steam/src/observability/evidence-sanitizer.ts`
- Move: `product/services/device/steam-log-signals.ts` -> `product/plugins/steam/src/observability/log-signals.ts`
- Move: `product/services/device/steam-log-tailer.ts` -> `product/plugins/steam/src/observability/log-tailer.ts`
- Move: `product/services/device/steam-log-observer.ts` -> `product/plugins/steam/src/observability/log-observer.ts`
- Move: `product/services/device/steam-launch-state.ts` -> `product/plugins/steam/src/observability/launch-state.ts`
- Move matching tests into `product/plugins/steam/src/observability/`
- Add: `product/apps/portal/api/plugin-diagnostics/collect.rpc.ts`
- Add: `product/apps/portal/api/plugin-diagnostics/collect.rpc-handler.ts`
- Add: `product/apps/portal/api/plugin-diagnostics/collect.rpc-handler.test.ts`
- Modify: `product/apps/portal/api/app-rpc-group.ts`
- Modify: `product/apps/portal/api/server/rpc-group.ts`
- Modify: `product/apps/portal/api/handlers.ts`
- Modify: `product/apps/portal/api/server/rpc-server.ts`
- Modify: `product/apps/portal/api/server/rpc-server.test.ts`
- Modify: `product/services/device/korrid.ts`
- Modify: `product/apps/portal/api/steam/status.rpc.ts`
- Modify: `product/apps/portal/api/steam/status.rpc-handler.ts`

**Approach:**

- Add a generic plugin diagnostics RPC that accepts a provider id and invokes that provider's `diagnostics.collect` handler.
- Update both app and server RPC handler maps; `app.steam.status` is currently registered in `handlers.ts` and `server/rpc-server.ts`, not only in RPC group definitions.
- Have `@korri:steam` expose `diagnostics.collect` for the current Steam observer status payload.
- Install/start the Steam log observer through plugin daemon composition only when `@korri:steam` is enabled.
- Remove `app.steam.status` from app and server RPC groups and handler maps in the same slice. Do not keep a temporary adapter.
- Keep evidence sanitization and response clamping in the plugin-owned diagnostics handler.
- Validate `diagnostics.collect` input at the handler boundary and return typed failures/safe defaults for malformed or missing input.

**Test scenarios:**

- Generic diagnostics RPC invokes an enabled plugin diagnostics handler by provider id.
- Disabled or unknown provider returns a typed not-found/unavailable diagnostic error without importing plugin code.
- Steam diagnostics response preserves observer state, active/latest snapshot, and clamped evidence.
- Malformed or missing diagnostics handler input does not crash and produces a typed failure or safe default according to the chosen diagnostics contract.
- `createKorrid(...)` does not construct a Steam observer unless the Steam plugin is enabled.
- `app.steam.status` no longer appears in app/server RPC groups, handler maps, or tests.

**Verification:**

- `bun test product/plugins/steam/src/observability/*.test.ts product/apps/portal/api/plugin-diagnostics/collect.rpc-handler.test.ts product/services/device/korrid.test.ts product/apps/portal/api/server/rpc-server.test.ts`

---

### U6. Move Steam Nix and package ownership to the plugin boundary

**Goal:** Steam system/package behavior is explicit plugin/product composition, not generic Korri Nix knowledge.

**Requirements:** R8, R9, R11, R15

**Files:**

- Add or move under: `product/plugins/steam/flake.nix`
- Add or move under: `product/plugins/steam/packages/steam-korri/`
- Move or wrap: `product/vendor/steam-korri/**`
- Move or expose: `product/systems/nixos/modules/korri-steam.nix`
- Modify: `product/systems/nixos/flake/packages.nix`
- Modify: `product/systems/nixos/flake/checks.nix`
- Modify: `product/systems/nixos/flake/modules.nix`
- Modify: `product/systems/nixos/overlays/korri-packages.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify: `product/systems/nixos/images/desktop-lab.nix`
- Move or update: `tools/testing/nix/korri-steam-module-check.nix`
- Update: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Update: `product/systems/nixos/flake/plugins.test.ts`
- Modify: `product/plugins/proton-runtime/src/plugin.ts`
- Modify: `product/plugins/proton-runtime/src/plugin.test.ts`
- Modify: `product/plugins/fex-runtime/src/plugin.ts`
- Modify: `product/plugins/fex-runtime/src/plugin.test.ts`

**Approach:**

- Put Steam package derivations and module tests under plugin ownership where practical.
- Product image composition may still enable the Steam plugin/module explicitly; that is product composition, not generic core behavior.
- Keep SM8550/Bandai path and systemd behavior equivalent unless deliberately changed in a later Steam runtime item.
- Ensure `@korri:steam` enablement is the single source of truth for exposing Steam packages/services in plugin-aware compositions.
- Preserve current checks for uinput prep, FEX rootfs prep, seed/runtime-prep units, Steam state paths, and absence of old substrate Steam services, but locate those assertions at the plugin/product-composition boundary.
- Preserve the fixed `korri-steam-app` warm-Steam detection behavior: generated wrappers must use the Nix-provided systemctl path, not `/bin/systemctl`, so the `korri` runtime works on Bandai.
- Review Steam-dependent adjacent runtime plugins. Either move Steam-installed Proton/FEX rootfs defaults under `@korri:steam`, make those plugins require/configure against `@korri:steam`, or replace hardcoded Steam paths with provider-owned runtime configuration.

**Test scenarios:**

- Without `@korri:steam`, product composition does not include Steam packages, services, tmpfiles, or Steam-specific assertions.
- With `@korri:steam`, SM8550 composition preserves current Steam package/service posture.
- Steam module evaluation still fails invalid path assertions and wrong-platform package assertions.
- Generated `korri-steam-app` wrapper contains `${pkgs.systemd}/bin/systemctl is-active` and does not contain `/bin/systemctl is-active`.
- Flake exposes the Steam plugin package/check intentionally, not as an incidental generic package.
- Proton/FEX runtime plugin tests prove any remaining Steam paths are explicitly sourced from the Steam plugin/composition contract, not hardcoded cross-plugin globals.

**Verification:**

- `bun test product/systems/nixos/flake/plugins.test.ts`
- `just test-nix`
- Targeted Nix checks for the moved Steam module/package outputs.

---

### U7. Migrate UI/tooling consumers to generic plugin data

**Goal:** User-facing diagnostics and tooling no longer call Steam-specific core APIs.

**Requirements:** R6, R11

**Files:**

- Modify: `product/themes/vigie/cockpit/live/VigieLiveCockpitRoot.tsx`
- Modify: `product/themes/vigie/cockpit/live/VigieLiveCockpitData.ts`
- Modify: `product/themes/vigie/cockpit/live/VigieLiveCockpitData.test.ts`
- Modify: `product/themes/vigie/fixtures/cockpit-fixtures.ts`
- Modify: `product/apps/cli/stream-launch.ts`
- Modify as needed: `packages/pi-korrid-tools/src/**`

**Approach:**

- Replace direct `app.steam.status` polling with generic plugin diagnostics for `@korri:steam` where the UI truly wants Steam details.
- Prefer provider-labeled diagnostic cards over Steam-specific UI branches when possible.
- Keep Steam-specific copy in plugin-owned diagnostic payloads. UI code should render provider titles/details generically rather than branching on Steam.
- Update Pi/Korri tools to query generic plugin diagnostics or keep Steam-specific helper commands as wrappers over generic RPC.

**Test scenarios:**

- Vigie renders a generic provider diagnostics card when `@korri:steam` diagnostics are available, without Steam-specific UI branching.
- Vigie handles missing/disabled Steam plugin without reporting the daemon as unhealthy.
- CLI/tooling can fetch Steam diagnostics through the generic provider path.
- Existing session/source/stream-control status polling remains unchanged.

**Verification:**

- `bun test product/themes/vigie/cockpit/live/VigieLiveCockpitData.test.ts product/apps/cli/*.test.ts packages/pi-korrid-tools/tests/*.test.ts`
- Run browser/visual tests if the cockpit UI presentation changes materially.

---

### U8. Add boundary checks and remove residual core Steam coupling

**Goal:** Make the migration complete and regression-resistant.

**Requirements:** R11

**Files:**

- Modify: `tools/testing/standards/product-reorg-boundaries.test.ts` if this is the existing boundary-check home.
- Add: `product/plugins/steam/src/boundary.test.ts` or an equivalent focused boundary test.
- Update tests under all touched modules.

**Approach:**

- Add a source-scan test that fails on Steam-specific identifiers in generic locations once migration is complete.
- Allowlist `product/plugins/steam/**`, plugin package/vendor paths, historical docs/work items, and explicit product image composition.
- Use behavior tests as the primary proof; source-scan is only a guard against accidental re-coupling.
- Do not add temporary compatibility adapters. Remove old-shape TODOs and tests before marking this plan complete.

**Test scenarios:**

- `rg`-style boundary test finds no `steam`, `Steam`, or `STEAM` references in generic platform/service/API paths outside allowlisted generic provider strings and tests.
- Removing `@korri:steam` from enabled plugins disables Steam launch integration, diagnostics, lifecycle hooks, and Nix service composition.
- Enabling `@korri:steam` restores the current happy-path launch/status behavior through plugin-owned seams.

**Verification:**

- `bun test product/plugins/steam/src/boundary.test.ts tools/testing/standards/product-reorg-boundaries.test.ts`
- `just typecheck`
- `just lint`

---

## Sequencing

1. Finish or branch from `refactor/retroarch-plugin` so provider-qualified app integrations are available.
2. Add `@korri:steam` descriptor and tests without changing launch behavior.
3. Migrate config schema/fixtures/acquisition examples to plugin-qualified Steam policy.
4. Move pure launch-spec and state materialization into the plugin and route repository dispatch through `steamReadableLaunchIntegration`.
5. Replace `appIntegration: "steam"` launch sideband metadata before removing the old Steam app kind, otherwise Gamescope Steam-session behavior will silently regress.
6. Move lifecycle cleanup to a generic plugin hook composition seam, then add the Steam hook.
7. Move observability/status to plugin diagnostics and migrate RPC/UI/tooling consumers.
8. Move Nix/package ownership and Steam-dependent adjacent runtime defaults to plugin/product composition.
9. Add boundary checks and run full verification.

---

## Risks & Mitigations

- **Risk: Steam behavior regresses while moving ownership.** Mitigate with characterization tests around current Steam materialization, VDF mutation, observer status, and SM8550 Nix posture before moving code.
- **Risk: Generic plugin diagnostics is underspecified.** Mitigate by starting with the narrow `diagnostics.collect` operation already present in the plugin vocabulary and only modeling the payload as provider-owned unknown/typed-at-edge data.
- **Risk: Sessiond needs provider metadata it does not currently carry.** Mitigate by adding a generic launch metadata/sidecar path rather than expanding `LaunchSpec` with Steam fields.
- **Risk: Nix plugin ownership causes awkward flake wiring.** Mitigate by allowing explicit product composition to import plugin-owned modules while keeping package/module implementation next to the plugin.
- **Risk: Existing tools depend on `app.steam.status`.** Mitigate by updating those tools in the same slice to generic plugin diagnostics. Do not keep a compatibility adapter.

---

## Definition of Done

- `@korri:steam` owns Steam app config, launch materialization, policy decoding, diagnostics, lifecycle cleanup, and package/module implementation.
- Generic app/config/library repository code has no `kind: steam`, `isSteamAppRecord`, `SteamPolicy`, or Steam materializer dispatch.
- Generic sessiond/inputd/korrid code has no Steam process matching, Steam log observer installation, or Steam AppID parsing.
- Generic app RPC groups do not include Steam-specific RPC as a first-class endpoint.
- Product composition can enable or disable Steam through the plugin/composition seam.
- Old Steam config/API/intent shapes fail instead of translating: `apps.steam`, `kind: steam`, top-level `launch-options`, `app.steam.status`, and emitted `appIntegration: "steam"` are gone.
- Device config migration steps are listed for manual Bandai/Steam-device updates.
- Current Steam AppID launch behavior, Steam-inside-Gamescope default, observer status, residual cleanup, and SM8550 Nix posture are preserved when the plugin is enabled.
- Targeted tests, `just test-nix`, `just typecheck`, and `just lint` pass or have only explicitly documented unrelated pre-existing failures.
