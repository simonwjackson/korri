---
title: refactor: Convert RetroArch to first-party plugin
type: refactor
status: active
date: 2026-06-18
deepened: 2026-06-18
origin: work/items/active/01KV8NZRAAETDX69P5T73BRVY8-first-party-plugin-system-shape/requirements.md
verify_command: "bun test product/plugins/retroarch/src/plugin.test.ts product/plugins/retroarch/src/materializer.test.ts product/plugins/retroarch/src/launch-spec.test.ts product/plugins/pico8/src/plugin.test.ts product/plugins/index.test.ts product/platform/library/config/app-integrations.test.ts product/platform/library/config/app-choice-selection.test.ts product/platform/library/config/records/app-choice.test.ts product/platform/library/config/records/app.test.ts product/platform/library/config/records/runtime.test.ts product/platform/library/config/records/module.test.ts product/platform/library/config/records/readable-schema.test.ts product/platform/library/config/module-resolution.test.ts product/platform/library/config/readable-cascade-resolver.test.ts product/platform/library/config/app-materializer.test.ts product/platform/library/config/ephemeral-override.test.ts product/platform/library/config/authoring/examples.test.ts product/platform/library/proseql/library-db.test.ts product/platform/library/proseql/config-graph-db.test.ts product/platform/library/proseql/library-repository.test.ts product/platform/library/proseql/proseql-library-source.test.ts product/apps/portal/api/library/launch.rpc-handler.test.ts product/apps/portal/api/stream/prepare.rpc-handler.test.ts product/apps/portal/features/home/library-rpc-layers.test.ts product/services/device/game-stream-runner.test.ts tools/library/launcher-config-cli.test.ts product/systems/nixos/flake/plugins.test.ts && just test-nix"
---

# refactor: Convert RetroArch to first-party plugin

## Summary

Convert RetroArch from a platform-known integration into the first-party `@korri:retroarch` plugin. The plan uses plugin-qualified app/runtime ids, moves RetroArch launch policy and materialization behind plugin-owned seams, makes PICO-8/fake08 depend on a libretro app host explicitly, and keeps generic Korri limited to provider-keyed plugin records and operation dispatch.

---

## Problem Frame

Korri already has a first-party plugin contract, but RetroArch still appears as a built-in app kind, built-in app descriptor, top-level cascade policy, special materializer dispatch, and Nix overlay/check owner. That keeps generic platform/library/Nix code conceptually aware of RetroArch and prevents plugin-owned runtimes such as fake08 from expressing the true boundary: RetroArch hosts libretro runtimes; runtimes/modules support systems.

---

## Requirements

- R1. Introduce `@korri:retroarch` as the stable first-party plugin/provider id and expose the RetroArch app as `@korri:retroarch/retroarch` (origin R1-R7, AE1).
- R2. Preserve the first-party plugin model: TypeScript-authored descriptors, generic static config maps, operation-scoped handlers, Effect-compatible host invocation, and simple capability requirements (origin R1-R13, AE1-AE4).
- R3. Remove generic hardcoded RetroArch app semantics: no built-in `apps.retroarch`, no `kind: retroarch`, no id-based `retroarch` app inference, and no generic `isRetroArchAppRecord`-style dispatch.
- R4. Replace top-level `retroarch:` launch policy with provider-keyed plugin policy under `plugin."@korri:retroarch"`; keep policy merge behavior generic and decode/validate the RetroArch payload at the plugin boundary before launch materialization.
- R5. Keep the domain boundary explicit: RetroArch app records do not declare supported systems; runtime/module records such as `@korri:pico8/fake08` declare `supports.systems` and reference their host app.
- R6. Migrate PICO-8/fake08 config to `system.apps[]` choices using `@korri:retroarch/retroarch` and `@korri:pico8/fake08`; remove old `system.launch.app/module` usage from first-party plugin contributions.
- R7. Preserve user-facing launch behavior where the plugin is enabled: generated `retroarch.cfg`, explicit single core arg, content path resolution, xdelta/patch staging, stable fake08 core path, and launch diagnostics.
- R8. Move RetroArch-specific launch-spec rendering, setting validation, materialization, and Nix ownership under `product/plugins/retroarch/` unless a temporary platform seam is explicitly marked and scheduled for removal within this plan.
- R9. Update readable config, ProseQL/library fixtures, portal/service tests, and docs/examples to the breaking plugin-qualified shape.
- R10. Keep the RetroArch boundary explicit through plugin ownership, behavior tests, and review guidance; do not add runtime compatibility code or source-scan tests for old RetroArch names.
- R11. Enforce runtime-host compatibility during launch resolution: the selected runtime host app must match the selected app, and runtime `supports.systems` must include the release/system when declared.

**Origin actors:** A1 Integration author, A2 Planner/implementer, A3 Image/profile composer, A4 Player/operator.
**Origin flows:** F1 First-party plugin contributes static config, F2 First-party plugin contributes host-invoked behavior, F3 Plugin requirements are validated simply.
**Origin acceptance examples:** AE1-AE4 are preserved through plugin-contributed app/runtime config, operation-scoped materialization, explicit fake08 host requirements, and Effect-backed handler consumption. Catalog vocabulary beyond the touched RetroArch/PICO-8 examples stays out of scope.

---

## Scope Boundaries

- Full breaking alpha migration: do not preserve old authored config shapes through compatibility aliases.
- Do not add targeted legacy error messages or compatibility branches for old `apps.retroarch`, `kind: retroarch`, `retroarch:`, `runtime: fake08`, or `system.launch.app/module`; strict failures are acceptable during alpha.
- Do not build third-party/user-installed plugins, marketplace behavior, dynamic external plugin loading, sandboxing, trust tiers, or semver dependency resolution.
- Do not migrate unrelated integrations such as Steam, Moonlight, Ryubing, Gamescope, or acquisition providers except where their tests/fixtures consume the RetroArch seam.
- Do not change the content/domain identity of PICO-8; only its fake08 runtime/app-host wiring changes.
- Do not remove generic libretro vocabulary such as runtime kind `libretro-core`; the boundary is RetroArch-specific, not libretro-specific.
- Do not chase pre-existing unrelated typecheck failures, generated route-tree issues, or unrelated local SMW Central / Mega Man Maker WIP.

### Deferred to Follow-Up Work

- Document a reusable breaking plugin-config migration pattern in `docs/solutions/` after implementation validates the final shape.
- Broader removal or redesign of legacy non-readable launch APIs if implementation proves they are no longer used for RetroArch.
- User-facing migration tooling or config rewrite helpers for old RetroArch YAML.
- Generic multi-plugin capability diagnostics UI for missing host/runtime dependencies.

---

## Context & Research

### Relevant Code and Patterns

- `product/platform/plugin/index.ts` and `product/platform/plugin/registry.ts` define the retained plugin contract: provider ids, generic config maps, requirements, handlers, and Effect-compatible result normalization.
- `product/plugins/AGENTS.md` is the plugin authoring guide: descriptor in `src/plugin.ts`, thin `index.ts`, namespaced config maps, provider ids as durable identity, and explicit resource/handler ownership.
- `product/plugins/gamescope/src/plugin.ts` and `product/plugins/ryubing/src/materializer.ts` show plugin-owned descriptor assembly and readable launch integration dispatch through `firstPartyLaunchIntegrations`.
- `product/plugins/pico8/src/plugin.ts` currently owns fake08 package/runtime facts but still wires PICO-8 with old unqualified RetroArch/module fields.
- `product/platform/library/config/records/app.ts`, `app-integrations.ts`, `cascade-resolver.ts`, `app-choice-selection.ts`, `inheritable-fields.ts`, `resolved-launch-context.ts`, and `app-materializer.ts` are the core hardcoded RetroArch surfaces to migrate.
- `product/platform/library/proseql/library-repository.ts` is the readable library dispatch point; it should route RetroArch through a plugin-provided `ReadableLaunchIntegration`, as Ryubing does.
- `product/platform/stream/retroarch-launch-spec.ts` and `product/platform/library/config/retroarch-setting-policy.ts` are RetroArch-specific implementation files currently under platform ownership.
- `product/systems/nixos/overlays/korri-packages.nix`, `product/systems/nixos/images/kiosk.nix`, and `tools/testing/nix/korri-retroarch-xdelta-check.nix` own RetroArch/xdelta/Nix closure posture today and need plugin or explicit composition ownership.
- `tools/testing/standards/product-reorg-boundaries.test.ts` already enforces product/platform boundary rules, but this plan intentionally does not add a RetroArch-specific source-scan tripwire; behavior tests and review should enforce this migration boundary.

### Institutional Learnings

- `docs/solutions/architecture-patterns/gamescope-as-plugin-owned-composition-2026-06-17.md`: plugin conversions must remove conceptual coupling from generic platform/services/apps/themes/Nix and allow concrete integration names only in plugin code plus explicit composition seams.
- `docs/solutions/architecture-patterns/korri-plugin-architecture-2026-06-02.md`: plugin ids use provider-style identity; handlers stay app-agnostic and operation-scoped; plugin config/handlers are the intended static/dynamic boundary.
- `docs/solutions/runtime-errors/retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27.md`: never use `retroarch-bare.passthru.wrapper` for explicit-core launches; use `symlinkJoin`, propagate `passthru.cores`/`passthru.unwrapped`, and preserve stable `/etc/korri/cores/*` paths.
- `docs/solutions/runtime-errors/retroarch-png-extension-routes-to-image-display-core-2026-05-27.md`: PICO-8 `.p8.png` launches need unambiguous core args and content-extension safety so RetroArch does not route to image-display.
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`: launch behavior must come from explicit policy/config, not argv/env/config-file sniffing.
- `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`: image-level composition should assert coherent package/core/path posture; module defaults stay conservative.
- `docs/solutions/best-practices/product-owned-composition-keeps-shared-layers-reusable-2026-05-03.md`: concrete integration selection belongs in product composition, not shared platform layers.

### External References

- External research skipped. This is an internal architecture-boundary migration with strong repo-local plugin patterns, retained requirements, and institutional learnings.

---

## Key Technical Decisions

- **Plugin id and app id:** Use `@korri:retroarch` as provider/plugin id and `@korri:retroarch/retroarch` as the app record id.
- **App kind discriminator:** Use plugin id `@korri:retroarch` as the app `kind` for launch integration matching; do not preserve `kind: retroarch`.
- **Policy carrier:** Use `plugin."@korri:retroarch"` as the authored and resolved carrier for RetroArch policy, replacing every top-level `retroarch:` field.
- **Runtime-owned system support:** Runtime/module records may declare `app` and `supports.systems`; app records may not declare `supports.systems`.
- **PICO-8/fake08 wiring:** PICO-8 contributes `systems.pico8.apps[]` with app `@korri:retroarch/retroarch` and runtime `@korri:pico8/fake08`; fake08 declares a requirement on the libretro app-host provider.
- **Materializer ownership:** RetroArch config rendering, patch staging, and launch-spec composition move into `product/plugins/retroarch/src/` and are invoked through `firstPartyLaunchIntegrations`, not platform-side type checks.
- **Patch support remains:** xdelta/patch support is preserved as RetroArch plugin-owned launch preparation/materialization behavior, with Nix xdelta package posture moving to the plugin/composition seam.
- **Launch integration registration:** Launch integrations should be registered/filterable by provider id so a disabled plugin cannot still materialize a matching user-authored app kind through an unconditional first-party integration array.
- **Capability enforcement:** The libretro host relationship must be validated at two levels: plugin requirements declare the provider/capability relationship, and launch resolution validates that the selected runtime is compatible with the selected app/system.
- **Policy validation timing:** Generic schemas may keep plugin payloads as unknown, but the RetroArch plugin must decode its own policy before materialization and surface structured config/materialization errors rather than silently ignoring invalid payloads.
- **Strict breaking migration:** Removed old fields are not aliased; tests and examples must use the new shape rather than proving old configs produce custom guidance. Legacy records that would otherwise be mis-dispatched as generic process launches must fail before process composition through a generic explicit-kind/descriptor guard rather than a RetroArch alias.
- **Boundary by ownership, not legacy checks:** The final state should avoid generic RetroArch special cases through plugin ownership and review. Do not add runtime compatibility code or source-scan tests that preserve old RetroArch vocabulary only for enforcement.

---

## Open Questions

### Resolved During Planning

- What replaces `system.launch.app/module` for PICO-8? Use `systems.<id>.apps[]` choices with plugin-qualified app/runtime ids.
- What replaces top-level `retroarch:` policy? Use `plugin."@korri:retroarch"` with the RetroArch policy payload shape and provider-keyed plugin merge semantics.
- What app discriminator should launch integration use? Use `kind: "@korri:retroarch"`, matched by a first-party `retroarchReadableLaunchIntegration`.
- Does xdelta support remain? Yes. It is part of RetroArch plugin-owned launch/materialization behavior and Nix composition.
- Should there be legacy aliases or targeted compatibility errors? No. This is a full breaking alpha migration.
- Should RetroArch declare supported systems? No. Runtime/module records declare supported systems; RetroArch is only the app/runtime host.

### Deferred to Implementation

- Exact helper/type names inside `product/plugins/retroarch/src/` should follow local plugin conventions discovered while editing.
- Whether any legacy non-readable RetroArch launch path remains reachable should be characterized during implementation; if reachable, adapt it minimally or defer retirement explicitly.

---

## Output Structure

    product/plugins/retroarch/
    ├── index.ts
    ├── src/
    │   ├── plugin.ts
    │   ├── plugin.test.ts
    │   ├── materializer.ts
    │   ├── materializer.test.ts
    │   ├── launch-spec.ts
    │   ├── launch-spec.test.ts
    │   └── setting-policy.ts
    └── nix/
        ├── composition.nix
        ├── overlay.nix
        └── nixos-module.nix

This tree is directional. The important boundary is that RetroArch-specific descriptor, materializer, policy, launch-spec, and Nix ownership live under `product/plugins/retroarch/`; host contracts stay in `product/platform/plugin/`.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart LR
  Config[Authored YAML / plugin config] --> PluginMap[plugin.@korri:retroarch policy]
  Pico8[PICO-8 plugin] --> Fake08[@korri:pico8/fake08 runtime]
  RetroPlugin[@korri:retroarch plugin] --> App[@korri:retroarch/retroarch app]
  Fake08 -->|app host| App
  Fake08 -->|supports.systems| Pico8System[pico8]
  SystemApps[systems.pico8.apps[]] --> App
  SystemApps --> Fake08
  Repo[Library repository] --> Integration[firstPartyLaunchIntegrations]
  Integration --> Materializer[RetroArch plugin materializer]
  PluginMap --> Materializer
  Materializer --> Spec[LaunchSpec + artifacts]
  RetroNix[RetroArch plugin Nix fragments] --> Composition[Product/image composition]
```

Generic platform code sees plugin maps, app records, runtime records, and launch integrations. The RetroArch plugin owns what those policies mean and how they become config files, patch artifacts, and argv.

---

## Implementation Units

### U8. Project enabled plugin config into readable snapshots (execute first)

**Goal:** Ensure enabled first-party plugin config contributions become visible to production readable library loading before RetroArch/PICO-8 tests rely on manually seeded records.

**Requirements:** R1, R2, R5, R6, R9

**Dependencies:** None

**Files:**
- Modify: `product/platform/plugin/catalog-library-source.ts`
- Modify: `product/platform/plugin/catalog-library-source.test.ts`
- Modify: `product/plugins/library-source-layer.ts`
- Modify: `product/platform/library/library-source-layer-live.ts`
- Modify: `product/platform/library/proseql/proseql-library-source.test.ts`
- Modify: `product/platform/library/proseql/config-graph-db.test.ts`

**Approach:**
- Thread the enabled `PluginRegistry` into the readable library/config graph loading path so schema-valid readable library config contributions are projected into `ReadableConfigSnapshot` alongside ProseQL records.
- Define the projection contract explicitly: plugin capability/runtime metadata that is not a readable `RuntimeRecord` (for example FEX/Proton capability runtimes without paths) must be kept out of `ReadableConfigSnapshot` or mapped through a documented readable-record adapter; do not inject all plugin runtime metadata blindly.
- Preserve key-vs-record-id semantics: provider-owned readable records may use plugin-qualified ids while domain system records such as `system.id: "pico8"` remain stable domain ids.
- Use the same enabled registry instance later used to filter launch integrations so config availability and behavior availability cannot diverge.
- Keep this as a projection seam for existing first-party plugin config maps, not a broader external plugin loading system.

**Test scenarios:**
- Happy path: an enabled plugin contributing schema-valid readable app/runtime/system records makes those records available to readable launch resolution without manual ProseQL seeding.
- Edge case: disabled plugin config contributions are not projected into the readable snapshot.
- Integration: `ProseQLLibrarySource` sees plugin-projected records and persisted records through one snapshot, with deterministic precedence for duplicate ids.
- Error path: duplicate plugin/persisted record ids fail or resolve according to one documented precedence rule rather than silently changing per collection.
- Regression: enabling a plugin that depends on FEX/Proton runtime capability metadata does not inject those non-readable capability-runtime records into `ReadableConfigSnapshot`.

**Verification:**
- Production readable library construction has a single enabled-registry seam for plugin config projection that U1/U4 can build on.

---

### U1. Add the RetroArch plugin descriptor and launch-integration seam

**Goal:** Introduce the plugin-owned RetroArch app host and register it through first-party plugin composition without changing launch behavior yet.

**Requirements:** R1, R2, R3, R7

**Dependencies:** U8

**Files:**
- Create: `product/plugins/retroarch/index.ts`
- Create: `product/plugins/retroarch/src/plugin.ts`
- Create: `product/plugins/retroarch/src/plugin.test.ts`
- Create: `product/plugins/retroarch/src/materializer.ts`
- Create: `product/plugins/retroarch/src/materializer.test.ts`
- Modify: `product/plugins/index.ts`
- Modify: `product/plugins/index.test.ts`
- Modify: `product/platform/library/proseql/library-repository.ts`
- Modify: shared launch-context/runtime validation seam used by readable, RPC, CLI, and non-readable launch paths
- Modify: `product/platform/library/library-source-layer-live.ts`
- Modify: `product/plugins/library-source-layer.ts`
- Modify: `product/platform/library/config/app-integrations.ts`
- Modify: `product/platform/library/config/app-integrations.test.ts`
- Modify: `product/platform/library/config/resolved-launch-context.ts` if `ReadableLaunchIntegration` type lives there
- Modify: `product/platform/plugin/registry.ts` if launch integration filtering needs enabled-provider metadata from the registry

**Approach:**
- Define `KORRI_RETROARCH_PLUGIN_ID = "@korri:retroarch"` and a contributed app record for `@korri:retroarch/retroarch` with `kind: "@korri:retroarch"`, explicit command/args, and plugin-owned policy defaults.
- Add `retroarchReadableLaunchIntegration` following the Ryubing pattern so `library-repository` dispatches by plugin app kind rather than `isRetroArchAppRecord` or built-in app id. Extend the launch-integration seam with provider ownership (for example, a `providerId` field and `launchIntegrationsForRegistry(registry)` helper) so disabled providers do not leave unconditional materializers behind.
- Keep `integration: "retroarch"` only as a reporting/compatibility label in resolved launch output if existing callers rely on it; dispatch should use the plugin kind.
- Remove the built-in RetroArch descriptor from `app-integrations.ts`; if generic app compatibility helpers remain, replace RetroArch-specific compatibility with a generic host/capability seam.
- Wire production library-source construction to receive launch integrations filtered from the same enabled registry used for U8 config projection, not just test repositories.
- Ensure disabled plugin composition means no RetroArch app contribution or launch integration is present.

**Execution note:** Start test-first at the plugin descriptor and library dispatch seam; this unit defines the integration contract the rest of the migration depends on.

**Patterns to follow:**
- `product/plugins/ryubing/src/materializer.ts`
- `product/plugins/gamescope/src/plugin.ts`
- `product/plugins/AGENTS.md`

**Test scenarios:**
- Happy path: enabling `@korri:retroarch` registers provider `@korri:retroarch` and app `@korri:retroarch/retroarch` with kind `@korri:retroarch`.
- Happy path: `firstPartyLaunchIntegrations` includes a RetroArch integration matching kind `@korri:retroarch`.
- Integration: resolving a readable launch for a plugin-qualified RetroArch app routes through the RetroArch launch integration, not the generic process composer.
- Integration: production `library-source-layer` wiring exposes the RetroArch launch integration only when the provider is enabled.
- Edge case: with RetroArch plugin disabled, the registry does not expose the app record or launch integration.
- Contract: `retroarchReadableLaunchIntegration.integration` remains the user-facing/reporting label `"retroarch"` even though dispatch uses provider kind `"@korri:retroarch"`.
- Error path: a context without content path or core/runtime path is not considered resolvable by the RetroArch launch integration.
- Error path: a provider-qualified app kind such as `@korri:retroarch` fails before generic process composition when its provider is disabled, missing, or has no enabled launch integration.

**Verification:**
- RetroArch app identity and launch dispatch are plugin-owned and covered by tests.

---

### U2. Move RetroArch policy and launch materialization into the plugin

**Goal:** Relocate RetroArch materialization into the plugin and make plugin policy the primary new policy carrier, while deferring removal of the old top-level carrier until U3 removes schema/cascade support.

**Requirements:** R2, R4, R7, R8

**Dependencies:** U1

**Files:**
- Create: `product/plugins/retroarch/src/launch-spec.ts`
- Create: `product/plugins/retroarch/src/launch-spec.test.ts`
- Create: `product/plugins/retroarch/src/setting-policy.ts`
- Modify: `product/plugins/retroarch/src/materializer.ts`
- Modify: `product/plugins/retroarch/src/materializer.test.ts`
- Modify: `product/platform/library/config/app-materializer.ts`
- Modify: `product/platform/stream/retroarch-launch-spec.ts`
- Modify: `product/platform/library/config/retroarch-setting-policy.ts`

**Approach:**
- Relocate RetroArch launch-spec rendering and setting validation from platform files into the RetroArch plugin.
- Make the plugin materializer read/decode policy from `context.plugin?.["@korri:retroarch"]` when present and produce the same generated config/artifact/argv outcomes as before.
- During U2 only, allow the old `context.retroarch` carrier as a transitional input if cascade/schema code still populates it; U3 removes that fallback when plugin policy is the only carrier.
- Preserve patch staging, stale artifact cleanup, relative log handling, and explicit core/content path behavior. Save/state path changes are acceptable during this alpha break; fix forward if needed.
- If the old non-readable `materializeAppLaunch` path is still reachable, keep a minimal plugin-kind dispatch bridge and capture retirement separately; do not keep platform-owned RetroArch policy logic.

**Execution note:** Characterize existing materializer behavior before extraction; preserve behavior through relocation rather than rewriting it.

**Patterns to follow:**
- `product/plugins/ryubing/src/materializer.ts`
- Existing `product/platform/library/config/app-materializer.test.ts` RetroArch scenarios

**Test scenarios:**
- Happy path: plugin policy with generated config, runtime path, and content path writes `retroarch.cfg` and returns args containing one config flag, one core flag, and the final content path.
- Happy path: plugin policy `extraSettings` and `extraArgs` render identically to the old materializer behavior.
- Edge case: plugin policy content path overrides release content path.
- Edge case: relative log file policy resolves under the launch artifact logs directory.
- Error path: missing runtime/core path fails before config rendering.
- Error path: missing content path fails before config rendering.
- Error path: dangerous duplicate core/config args are still rejected by plugin-owned validation.
- Error path: invalid `plugin."@korri:retroarch"` payloads fail during plugin policy decode before launch artifact writes.
- Integration: library repository uses the plugin materializer through launch integration without importing RetroArch plugin code from platform modules.
- Integration: `canResolveLaunchForPlayable` returns true for a repository seeded with plugin-qualified RetroArch app/runtime records and false for missing runtime/content prerequisites.

**Verification:**
- RetroArch-specific materialization code lives under `product/plugins/retroarch/`, and platform code no longer owns RetroArch materialization logic. The final removal of top-level `context.retroarch` is verified in U3 after schema/cascade migration.

---

### U3. Break the old app/config schema surface

**Goal:** Remove `retroarch` as a first-class generic config/app concept and make plugin policy the only authored policy surface.

**Requirements:** R3, R4, R9, R10

**Dependencies:** U1, U2

**Files:**
- Modify: `product/platform/library/config/records/app.ts`
- Modify: `product/platform/library/config/records/app.test.ts`
- Modify: `product/platform/library/config/records/app-choice.ts`
- Modify: `product/platform/library/config/records/game.ts`
- Modify: `product/platform/library/config/records/global.ts`
- Modify: `product/platform/library/config/records/host.ts`
- Modify: `product/platform/library/config/records/launcher.ts`
- Modify: `product/platform/library/config/records/library-item.ts`
- Modify: `product/platform/library/config/records/preset.ts`
- Modify: `product/platform/library/config/records/profile.ts`
- Modify: `product/platform/library/config/records/source.ts`
- Modify: `product/platform/library/config/records/system.ts`
- Modify: `product/platform/library/config/records/user.ts`
- Modify: `product/platform/library/config/records/runtime.ts` only for removing old top-level RetroArch field use; U4 owns new runtime host/support fields
- Modify: `product/platform/library/config/inheritable-fields.ts`
- Modify: `product/platform/library/config/app-choice-selection.ts`
- Modify: `product/platform/library/config/cascade-resolver.ts`
- Modify: `product/platform/library/config/resolved-launch-context.ts`
- Modify: `product/platform/library/proseql/library-repository.ts`
- Modify: `product/platform/library/config/records/readable-schema.test.ts`
- Modify: `product/platform/library/config/readable-cascade-resolver.test.ts`
- Modify: `product/platform/library/config/ephemeral-override.test.ts`

**Approach:**
- Remove built-in inference from app id `retroarch` to app kind `retroarch`.
- Remove flat RetroArch fields from app records and remove `appRetroArchPolicyFromRecord` / `isRetroArchAppRecord` style helpers.
- Remove top-level `retroarch` from `InheritableLayer` and all record schemas, including every record file that currently references `InheritableLayer.fields.retroarch`; strict decode failures are acceptable for old configs.
- Remove RetroArch-specific cascade folding and app-choice merging; rely on generic `plugin` policy folding. Remove the remaining `context.retroarch` field only in this unit, after cascade code no longer populates it.
- Keep `RetroArchPolicy` type only if still needed by plugin-owned code during extraction; otherwise move it completely under the plugin. Delete `library-repository.ts` imports/branches for `isRetroArchAppRecord`, `canMaterializeRetroArchContext`, and platform-side RetroArch materialization.
- Add an explicit-dispatch guard scoped to removed/plugin-owned app ids and provider-qualified app kinds: a stored app record with id `retroarch` and no explicit plugin kind, or any provider-qualified kind without an enabled provider integration, cannot silently launch as `generic-process`. Do not introduce a legacy RetroArch alias.

**Execution note:** Implement this after U2 so tests can migrate directly to `plugin."@korri:retroarch"` rather than passing through a tombstone schema.

**Patterns to follow:**
- Existing removed-field strict schema tests in `product/platform/library/config/records/library-item.test.ts`
- Generic `plugin` policy merge behavior in `product/platform/library/config/cascade-resolver.ts`

**Test scenarios:**
- Happy path: app records with `kind: "@korri:retroarch"` and `plugin."@korri:retroarch"` decode.
- Error path: app records with flat RetroArch fields such as config-file, video, or paths fail strict decode.
- Error path: top-level `retroarch:` on global/user/system/runtime/profile/library records fails strict decode.
- Happy path: plugin policy merges through the cascade from less-specific to more-specific layers.
- Edge case: app-choice overrides merge `plugin."@korri:retroarch"` policy without special RetroArch code.
- Error path: `byLauncher.retroarch` no longer affects resolved context; tests should either expect strict failure where schema-controlled or explicit absence where arbitrary map keys remain open.
- Error path: a stored `id: "retroarch"` app record without explicit plugin kind does not route to generic process launch.
- Error path: a provider-qualified app kind whose provider is disabled/missing fails before generic process composition.

**Verification:**
- No generic schema/cascade file treats RetroArch as a first-class field or app kind.

---

### U4. Move fake08 and PICO-8 wiring to runtime-owned host support

**Goal:** Express fake08 as a plugin-qualified runtime/module that supports PICO-8 and depends on RetroArch as a libretro app host.

**Requirements:** R5, R6, R7, R11

**Dependencies:** U8, U1, U3

**Files:**
- Modify: `product/platform/library/config/records/runtime.ts`
- Modify: `product/platform/library/config/records/runtime.test.ts`
- Modify: `product/plugins/pico8/src/plugin.ts`
- Modify: `product/platform/library/proseql/library-repository.ts`
- Modify: `product/plugins/pico8/src/plugin.test.ts`
- Modify: `product/platform/library/config/module-resolution.test.ts`
- Modify: `product/platform/library/config/records/module.ts`
- Modify: `product/platform/library/config/records/module.test.ts`
- Modify: `product/systems/nixos/flake/plugins.test.ts`

**Approach:**
- Migrate fake08 from a plugin `modules` contribution to a plugin `runtimes` contribution using runtime id `@korri:pico8/fake08`, kind `libretro-core`, host app `@korri:retroarch/retroarch`, stable core path, and `supports.systems: ["pico8"]`.
- Add runtime fields needed by plugin-owned runtimes: host app reference and `supports.systems`.
- Ensure app records reject `supports.systems`; this proves systems belong to runtimes/modules, not the RetroArch host app.
- Update PICO-8 contribution from old `launch: { app, module }` to `apps: [{ id, runtime }]` with `@korri:retroarch/retroarch` and `@korri:pico8/fake08`.
- Declare the fake08/RetroArch host requirement through plugin requirements/capabilities. If registry requirements are provider-only today, either extend the registry contract to validate required capability names or keep registry requirements provider-only and enforce the libretro host capability in the shared runtime compatibility validator; add wrong-capability tests for the chosen seam.
- Enforce runtime compatibility in one shared launch-context/runtime validator used by readable repository resolution, RPC handlers, CLI launch resolution, and any remaining non-readable path: selected runtime host app matches selected app, and selected runtime supports the release/system when `supports.systems` is present.
- Guard `upsertSystemWithCoreRuntime` so plugin-qualified runtimes with already-seeded absolute paths are not overwritten with `/legacy-cores/<id>` fallback paths.
- Keep fake08 package/Nix ownership under `product/plugins/pico8/`.

**Patterns to follow:**
- `product/plugins/pico8/src/plugin.ts`
- `product/plugins/AGENTS.md` config namespacing rules
- Runtime metadata tests in `product/platform/library/config/records/runtime.test.ts`

**Test scenarios:**
- Happy path: `@korri:pico8/fake08` decodes as a `libretro-core` runtime with host app `@korri:retroarch/retroarch` and `supports.systems: ["pico8"]`.
- Error path: a RetroArch app record with `supports.systems` fails strict decode.
- Happy path: enabling `@korri:pico8` requires `@korri:retroarch` and fails closed with a clear requirement/config error when the host provider is absent; image/product composition may explicitly enable both but should not hide the requirement.
- Integration: PICO-8 system contribution exposes `apps[]` with plugin-qualified app/runtime ids.
- Error path: old unqualified `runtime: fake08` fixtures are gone from first-party tests.
- Error path: selected app/runtime mismatch fails before materialization.
- Error path: selected runtime that does not support the release/system fails before materialization.
- Error path: a runtime that names the right provider but lacks the required host capability fails at the chosen registry or runtime-validation seam.
- Integration: readable repository, portal RPC, CLI launch tooling, and any remaining non-readable path all hit the same runtime compatibility validator, with bypass tests for at least one alternate path.
- Regression: upserting a PICO-8 system after seeding `@korri:pico8/fake08` with a stable absolute core path leaves that path unchanged.

**Verification:**
- PICO-8/fake08 launch metadata proves the intended domain boundary: RetroArch hosts; fake08 supports PICO-8.

---

### U5. Migrate readable library, ProseQL, portal, and authoring fixtures

**Goal:** Convert all first-party examples/tests from old RetroArch config to the canonical plugin-qualified shape.

**Requirements:** R3, R4, R5, R6, R9

**Dependencies:** U1, U2, U3, U4

**Files:**
- Modify: `product/platform/library/config/fixtures/steam-full.korri.yaml`
- Modify: `product/platform/library/config/authoring/examples.test.ts`
- Modify: `product/platform/library/proseql/library-db.test.ts`
- Modify: `product/platform/library/proseql/config-graph-db.test.ts`
- Modify: `product/platform/library/proseql/library-repository.test.ts`
- Modify: `product/platform/library/proseql/proseql-library-source.test.ts`
- Modify: `product/platform/library/library-source-layer-live.ts` if production launch integration wiring is not completed in U1
- Modify: `product/apps/portal/api/library/launch.rpc-handler.test.ts`
- Modify: `product/apps/portal/api/stream/prepare.rpc-handler.test.ts`
- Modify: `product/apps/portal/features/home/library-rpc-layers.test.ts`
- Modify: `product/services/device/game-stream-runner.test.ts`
- Modify: `tools/library/launcher-config-cli.test.ts`

**Approach:**
- Replace `apps.retroarch` examples with `apps."@korri:retroarch/retroarch"` and `kind: "@korri:retroarch"`.
- Replace app choices `{ id: "retroarch", runtime: "mgba" }` with plugin-qualified app ids; keep standalone app choices unchanged.
- Replace `runtime: fake08` with `@korri:pico8/fake08` where the runtime is fake08.
- Move example RetroArch policy from top-level `retroarch:` or flat app fields into `plugin."@korri:retroarch"`.
- Ensure repository tests that need RetroArch materialization pass `retroarchReadableLaunchIntegration` through repository options or use the first-party plugin library source layer.
- Keep expected `retroarch.cfg` artifact filenames and `integration: "retroarch"` reporting where those are user-facing outputs and still intentionally preserved.

**Execution note:** Characterization-first for broad fixture migrations: change assertions only when they reflect the new domain boundary, not incidental output churn.

**Patterns to follow:**
- `product/platform/library/config/fixtures/steam-full.korri.yaml`
- Existing readable library test seeding helpers in `product/platform/library/proseql/library-repository.test.ts`

**Test scenarios:**
- Happy path: checked-in readable fixture decodes with plugin-qualified RetroArch app/runtime ids.
- Happy path: ProseQL library source resolves a plugin-qualified RetroArch launch to a generated config/core/content LaunchSpec with `app.integration === "retroarch"`.
- Happy path: portal launch RPC returns the same launch artifact behavior for RetroArch-backed content.
- Edge case: multi-app releases still list plugin-qualified RetroArch and standalone app choices in order.
- Error path: missing core/runtime for RetroArch-backed release still reports not launchable / config failure without falling through to generic process launch.
- Error path: known-only releases remain visible but do not become launchable because RetroArch plugin exists.

**Verification:**
- The test suite no longer depends on unqualified `retroarch` app ids, `kind: retroarch`, `runtime: fake08`, or top-level `retroarch:` policy.

---

### U6. Move RetroArch Nix ownership into plugin composition

**Goal:** Make RetroArch package/xdelta/core-path posture plugin-owned while product/image composition explicitly enables it.

**Requirements:** R1, R2, R5, R7, R8, R10

**Dependencies:** U1, U4

**Files:**
- Create: `product/plugins/retroarch/nix/composition.nix`
- Create: `product/plugins/retroarch/nix/overlay.nix`
- Create: `product/plugins/retroarch/nix/nixos-module.nix`
- Modify: `product/systems/nixos/flake/plugins.nix`
- Modify: `product/systems/nixos/flake/plugins.test.ts`
- Modify: `product/systems/nixos/overlays/korri-packages.nix`
- Modify: `product/systems/nixos/images/kiosk.nix`
- Modify: `product/systems/nixos/images/common.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Modify: `product/systems/nixos/images/source-machine.nix` if it carries first-party plugin env lists
- Modify: `product/systems/nixos/flake/checks.nix`
- Modify: `tools/testing/nix/korri-retroarch-xdelta-check.nix`
- Modify: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Modify: `tools/testing/nix/korri-image-outputs-check.nix`
- Modify: `tools/testing/nix/korri-live-usb-config-check.nix`

**Approach:**
- Move the `retroarch-bare` xdelta override and the no-`passthru.wrapper` `symlinkJoin` closure posture into the RetroArch plugin's Nix files.
- Preserve the stable `/etc/korri/cores/*` contract for libretro cores and closure-shape passthru assertions.
- Let product/image composition enable the plugin and consume its overlay/module/check contributions through existing plugin Nix seams. For RetroArch/PICO-8 target images, make the runtime `KORRI_ENABLED_PLUGINS` list and the Nix plugin package/module composition agree; defer any general plugin enablement redesign unless the current RetroArch path requires it.
- Remove generic Nix hardcoding where possible; any remaining RetroArch names must be in explicit plugin composition or targeted Nix/image checks with a reason.
- Preserve existing xdelta check behavior, but make the ownership/plugin enablement visible.

**Patterns to follow:**
- `product/plugins/pico8/nix/composition.nix`
- `product/plugins/gamescope/nix/composition.nix`
- `product/systems/nixos/flake/plugins.nix`

**Test scenarios:**
- Happy path: first-party plugin Nix composition includes the RetroArch plugin id when enabled.
- Happy path: xdelta check still asserts RetroArch exposes xdelta support.
- Happy path: SM8550/kiosk closure still contains exactly one intended fake08 core where PICO-8 is enabled.
- Error path: disabling the RetroArch plugin removes RetroArch-specific app/package contributions from plugin composition.
- Integration: Nix plugin registry tests prove RetroArch overlay/module/check contributions are discovered through `plugins.nix`, not generic overlay hardcoding.
- Integration: a cross-boundary Nix/TS check compares the RetroArch/PICO-8 first-party plugin ids enabled for target images with the plugin compositions present in the Nix outputs, so runtime env ids and closure contents cannot disagree silently for this migration.
- Nix verification: run the Nix check suite that covers xdelta posture, no-`passthru.wrapper` launch closure, image outputs, and SM8550/live-usb core path invariants; TypeScript plugin tests are insufficient for U6.

**Verification:**
- RetroArch/xdelta/Nix image posture is selected by plugin composition and protected by Nix checks.

---

### U7. Update durable examples and ownership guidance

**Goal:** Update durable examples and guidance so future work understands the RetroArch plugin boundary without adding compatibility branches or source-scan tests for old names.

**Requirements:** R8, R9, R10

**Dependencies:** U1, U2, U3, U4, U5, U6

**Files:**
- Modify: `product/plugins/AGENTS.md`
- Modify: `docs/brainstorms/2026-06-08-003-retroarch-policy-one-to-one.example.yaml`
- Modify: `docs/brainstorms/2026-06-08-004-retroarch-policy-minimal-v1.example.yaml`
- Modify: `korri-catalog-display-metadata.example.yaml`
- Modify: `work/items/active/01KVDSEHGAAGGG872QNN1F8RN3-retroarch-plugin-boundary/plan.md` only if implementation discovers plan-level corrections

**Approach:**
- Update plugin authoring docs with the RetroArch-specific host/runtime lesson: app hosts do not support systems; runtimes/modules do.
- Update examples to the canonical plugin-qualified shape and plugin policy map.
- State the boundary in plain language: generic Korri should not special-case RetroArch; RetroArch-specific behavior belongs in `product/plugins/retroarch/` or explicit plugin composition.
- Do not add a RetroArch-specific source scan or runtime compatibility handling for old names. Avoid keeping old vocabulary around solely for enforcement.
- Avoid creating broad new docs unless the touched examples already serve as durable documentation.

**Patterns to follow:**
- `product/plugins/AGENTS.md` plugin authoring style
- Existing docs/examples tests that validate authored config shape

**Test scenarios:**
- Happy path: documentation/examples decode or are validated against the new canonical shape where tests cover them.
- Happy path: plugin authoring guidance clearly states that app hosts do not support systems; runtimes/modules do.
- Review check: no new generic RetroArch special cases are introduced during implementation, but this remains a review responsibility rather than a source-scan test.
- Integration: full targeted Bun verification covers plugin descriptor, cascade, materializer, ProseQL, portal/service fixtures, and image checks together.

**Verification:**
- Docs/examples teach the new boundary, and implementation review confirms generic Korri does not gain new RetroArch special cases.

---

## System-Wide Impact

- **Interaction graph:** Authored config and plugin contributions flow through generic plugin maps into the library repository, which dispatches to plugin launch integrations. PICO-8/fake08 contributes runtime/system facts and depends on RetroArch through provider requirements rather than direct platform knowledge.
- **Error propagation:** Missing plugin, missing runtime path, missing content path, patch failures, and invalid plugin policy should surface as structured config/materialization errors before process spawn.
- **State lifecycle risks:** RetroArch artifact directories, generated config files, and patch sidecars must preserve cleanup and partial-failure behavior after materializer relocation. Save/state path continuity is not required during this alpha break.
- **API surface parity:** Portal RPCs, local foreground launch adapters, CLI library tooling, and ProseQL library source must all consume the same plugin-qualified app/runtime shape.
- **Integration coverage:** Unit tests alone are not enough; ProseQL repository/source and portal/service launch tests must prove cross-layer launch resolution still materializes RetroArch launches correctly.
- **Unchanged invariants:** `libretro-core` remains a generic runtime kind; `retroarch.cfg` artifact naming can remain stable; existing generated launch args should preserve one config path, one core path, and final content path.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Partial migration makes RetroArch launches fall through to generic process launch | Sequence plugin launch integration before schema removal; add repository tests proving plugin materialization dispatch. |
| Removing `retroarch:` breaks operator tuning without replacement | Route policy through `plugin."@korri:retroarch"` and add cascade merge tests for plugin policy. |
| PICO-8/fake08 loses launchability during id migration | Update PICO-8 system apps and fake08 runtime support together; add PICO-8 plugin tests and SM8550/Nix checks. |
| xdelta or explicit-core behavior regresses during Nix move | Preserve symlinkJoin/no-wrapper posture and xdelta checks under plugin composition. |
| Generic platform still contains hidden RetroArch knowledge | Keep RetroArch behavior in plugin-owned files and explicit composition; verify through behavior tests and implementation review rather than a source-scan allowlist. |
| Whole-repo typecheck remains red for unrelated reasons | Use targeted verification for this plan and document known unrelated blockers separately. |
| Stored or seeded id-only legacy app records silently dispatch as generic process | Add a generic explicit-dispatch guard so unknown/id-inferred app records fail before process composition. |
| Runtime/plugin/Nix enablement drift | Filter launch integrations by enabled providers and verify RetroArch/PICO-8 target image plugin env lists against Nix composition outputs; defer a broader enablement redesign unless required. |

---

## Documentation / Operational Notes

- Config authors must update old RetroArch config to the plugin-qualified shape; no compatibility alias is planned.
- Image/profile composers enable RetroArch through first-party plugin composition rather than relying on generic built-ins.
- If implementation surfaces a reusable breaking-migration pattern, capture it after the work lands via the project's compounding docs workflow.

---

## Sources & References

- **Origin document:** [work/items/active/01KV8NZRAAETDX69P5T73BRVY8-first-party-plugin-system-shape/requirements.md](work/items/active/01KV8NZRAAETDX69P5T73BRVY8-first-party-plugin-system-shape/requirements.md)
- Related plan: [work/items/active/01KVBE3W1NTB209YDWBPGC0DBV-plugin-descriptor-sketch-alignment/plan.md](work/items/active/01KVBE3W1NTB209YDWBPGC0DBV-plugin-descriptor-sketch-alignment/plan.md)
- Related plan: [work/items/active/01KVBQ8J0F3E2B6Z9N2X4M5A7C-gamescope-plugin-decoupling/plan.md](work/items/active/01KVBQ8J0F3E2B6Z9N2X4M5A7C-gamescope-plugin-decoupling/plan.md)
- Plugin authoring guide: [product/plugins/AGENTS.md](product/plugins/AGENTS.md)
- Plugin contract: [product/platform/plugin/index.ts](product/platform/plugin/index.ts)
- First-party plugin registry: [product/plugins/index.ts](product/plugins/index.ts)
- RetroArch config/materializer surfaces: [product/platform/library/config/app-materializer.ts](product/platform/library/config/app-materializer.ts), [product/platform/stream/retroarch-launch-spec.ts](product/platform/stream/retroarch-launch-spec.ts)
- Institutional learning: [docs/solutions/architecture-patterns/gamescope-as-plugin-owned-composition-2026-06-17.md](docs/solutions/architecture-patterns/gamescope-as-plugin-owned-composition-2026-06-17.md)
- Institutional learning: [docs/solutions/runtime-errors/retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27.md](docs/solutions/runtime-errors/retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27.md)
