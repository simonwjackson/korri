---
title: feat: Add first-party plugin host with Nix-fulfilled Neverball
status: active
date: 2026-06-16
origin: work/items/active/01KV8NZRAAETDX69P5T73BRVY8-first-party-plugin-system-shape/requirements.md
---

# feat: Add first-party plugin host with Nix-fulfilled Neverball

## Summary

Build the first usable Korri plugin-system slice around a plugin-contributed Neverball playable. Korri core should not contain Neverball-specific app knowledge; the Neverball plugin contributes catalog/playable metadata and declares a Nix-fulfillable executable resource that Korri materializes with `nix build --out-link`. When the slice is complete and deployed to Bandai, Neverball should be visible through the plugin-backed catalog/library path.

---

## Problem Frame

The requirements establish a first-party, in-repo plugin model with typed descriptors, static contributions, handlers, and simple capability/resource requirements. The planning correction is that package-backed native games should not automatically become Korri `apps`: Neverball is a user-facing playable whose executable happens to be obtainable from nixpkgs. Korri needs a generic fulfillment and launch path that lets a plugin add a playable, obtain required executable resources, and launch it without binding the app into core config or NixOS system posture.

---

## Requirements Trace

- R1-R5: Implement first-party, TypeScript-authored plugins under a product plugin area, with stable descriptor identity independent of module/file grouping.
- R6-R8: Support static plugin contributions and dynamic host-invoked behavior, but scope this first slice to catalog/playable contribution, executable-resource declaration, diagnostics, and native-executable launch resolution.
- R9-R10: Keep handler context app-agnostic and normalize plain/Promise/Effect returns at the host boundary.
- R11-R13: Treat executable availability as a declared resource requirement; missing resources fail closed with diagnostics and can be fulfilled by a host provider.
- R14-R16: Use catalog/playable vocabulary in new plugin APIs, keep existing library naming as an adapter concern, and use Neverball as the first modeling/validation target rather than a core integration.

### Post-requirements decisions carried into this plan

- First pass plugin modules should live under `product/plugins/<module>/index.ts`; `<module>` is an authoring/grouping path, not plugin identity.
- Neverball must be plugin-first: Korri core must not contain Neverball-specific app records, NixOS service options, or hard-coded launch semantics.
- Neverball should be modeled as plugin-contributed playable/catalog content with a native executable resource, not as an `apps.neverball` record.
- The first Nix fulfillment backend should use `nix build --out-link`, not a user profile or `nix profile install`.
- The plugin descriptor declares a Nix installable and expected binary; the host fulfillment backend decides where/how the out-link is materialized.

---

## Scope Boundaries

- Do not implement third-party or user-supplied TypeScript plugin loading.
- Do not add a plugin marketplace, plugin package manager, or semver dependency resolver.
- Do not add a `services.korri.neverball` NixOS module or bind Neverball into system configuration as a known Korri app.
- Do not install into the user's default Nix profile, and do not run `nix run` on launch.
- Do not put Neverball into the plugin API as an `apps` contribution for this first pass.
- Do not migrate RetroArch, Steam, fake-08, PICO-8 BBS, or existing acquisition providers into the new plugin system in this slice.
- Do not require a general UI flow for plugin installation in this slice; expose a host/service path and tests first, with UI/CLI affordances left as follow-up unless implementation discovers an existing low-cost surface. The first-party Neverball plugin may still be enabled by default for the Bandai/product validation path.
- Do not rename existing `library` APIs broadly. Adapter code may bridge plugin `catalog` vocabulary into current library-facing services.

---

## Context & Research

### Existing code seams

- `product/platform/library/library-services.ts` already defines `ContentItem`, `ContentSourceService`, `ContentSources`, `LibrarySource`, and `ResolvedLaunch`. This is the closest existing seam for plugin-contributed catalog/playable content and launch output.
- `product/platform/library/proseql/library-repository.ts` currently resolves launchable entries through readable config records and app records. A plugin-native playable must either wrap/augment `LibrarySource` or add a narrow plugin launch resolver instead of forcing Neverball into `apps`.
- `product/platform/library/config/records/library-item.ts` models current persisted readable library records. Its release model is app/system/runtime oriented and does not currently express a plugin-owned native executable resource directly.
- `product/platform/library/config/compose-launch-spec.ts` can compose generic app records, but current foreground launch/intent code requires absolute commands. Resource fulfillment should therefore resolve to an absolute command path before launch.
- `product/platform/acquisition/plugins/registry.ts` is a useful local registry pattern: first-party definitions, stable provider ids, and operation handlers without dynamic external loading.
- `product/platform/library/proseql/library-db.ts` is the current readable config graph schema. This first slice should avoid broad schema churn unless a very small adapter record is required.
- `product/services/device/game-stream-launch-intent.ts` enforces absolute launch commands, and `product/services/device/game-stream-runner.ts` launches specs after optional Gamescope wrapping. The plugin launch resolver must produce a normal absolute-command `LaunchSpec` by the time it reaches this boundary.

### Institutional learnings

- `docs/solutions/architecture-patterns/korri-plugin-architecture-2026-06-02.md`: plugin code should stay behind host-owned seams; plugins contribute data/actions, not UI ownership.
- `docs/research/plugin-architecture/synthesis-2026-05-31.md`: Korri is already plugin-shaped through Effect service seams; start with small host contracts and avoid overbuilding third-party distribution.
- `docs/solutions/architecture-patterns/korri-product-platform-theme-architecture-2026-06-03.md`: plugin/integration code belongs under product code and must depend on platform contracts, not vice versa.
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`: launch behavior must come from explicit policy/resource data, not argv/env heuristics.
- `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`: avoid surprising module defaults; this plan avoids adding a Neverball NixOS module entirely for the first slice.

### Nix fulfillment posture

Use `nix build --out-link` as the first fulfillment backend. For a resource declared by plugin `@korri:neverball`, the host should materialize the package into a Korri-owned state location and resolve the binary under that out-link. The exact state path is an implementation detail, but it should be owned by Korri/plugin resource state rather than the user's default profile or a NixOS system generation.

---

## Key Technical Decisions

- **Plugin-first, not app-first.** Neverball exists because the plugin contributes a playable; Korri core does not gain a Neverball-specific app descriptor, NixOS module, or built-in integration branch.
- **Resource fulfillment is a host capability.** Plugins declare resources; fulfillment providers resolve them. The first provider is Nix with `nix build --out-link`, but the descriptor should not depend on NixOS module configuration.
- **Use out-links, not profiles, for Phase 1.** Out-links are explicit per-resource GC roots, easy to remove, and avoid profile command-collision semantics.
- **Nix is an explicit host capability.** Fulfillment must run an absolute host-provided Nix command, not assume `nix` is on a service PATH.
- **Catalog/playable contribution before library schema migration.** The plugin-facing API uses catalog/playable vocabulary. Current library services can adapt that into existing UI/launch seams without a broad library-to-catalog rename.
- **Native executable launch is a generic launch kind.** The host should resolve a plugin release with `native-executable` semantics into a normal absolute-command `LaunchSpec` after resource fulfillment.
- **No runtime network/build on launch.** Launch should require an already fulfilled executable. If the resource is missing, launch fails with an actionable diagnostic rather than running Nix implicitly.
- **Keep plugin activation explicit.** First-party plugins may be statically registered in product code, but only enabled plugins should contribute playable content or require resource fulfillment. For this first validation slice, the Neverball plugin should be explicitly enabled by the product/Bandai configuration path so a deploy/switch demonstrates the plugin system end-to-end.

---

## Proposed Plugin Shape: Neverball

This sketch is directional only; implementation may adjust names while preserving the model.

```ts
export const neverballPlugin = plugin({
  namespace: "@korri",
  name: "neverball",
  title: "Neverball",
  contributes: {
    catalog: [
      {
        id: "neverball",
        title: "Neverball",
        kind: "game",
        releases: [
          {
            id: "nixpkgs",
            launch: {
              kind: "native-executable",
              executable: { resource: "neverball-executable" },
              gamescope: { enable: true },
            },
          },
        ],
      },
    ],
    resources: [
      {
        id: "neverball-executable",
        kind: "executable",
        fulfill: {
          provider: "nix",
          installable: "nixpkgs#neverball",
          binary: "neverball",
        },
      },
    ],
  },
})
```

---

## Implementation Units

### U1. Add the first-party plugin contract and registry

**Goal:** Provide the typed host-owned contract that first-party plugin modules consume, plus a small registry that can register/enable plugin descriptors.

**Requirements:** R1-R5, R9-R10

**Files:**
- Add: `product/platform/plugin/index.ts`
- Add: `product/platform/plugin/registry.ts`
- Add: `product/platform/plugin/registry.test.ts`
- Add: `product/plugins/index.ts`
- Add later unit target: `product/plugins/neverball/index.ts`

**Approach:**
- Define a minimal `plugin(...)` helper and descriptor type with stable identity, title/metadata, contributions, handlers, and requirements/resources.
- Use `product/plugins/<module>/index.ts` for plugin modules; the module path is a grouping path and may export multiple plugins.
- Add an explicit first-party registry file that imports plugin modules and registers descriptors. Avoid dynamic discovery and external code loading.
- Add an enablement input to the registry/host so available plugins and enabled plugins are distinct. Keep the first implementation in-memory or host-config driven; do not invent a public marketplace/install format.
- Add handler result normalization that accepts plain values, Promise-like values, and Effect values.

**Test scenarios:**
- Registers a single plugin descriptor and exposes its stable id independent of source module path.
- Registers multiple plugins from one module without treating the module as plugin identity.
- Distinguishes available plugins from enabled plugins.
- Rejects duplicate plugin ids with a clear diagnostic.
- Normalizes plain, Promise-like, and Effect-returning handlers through the host boundary.

---

### U2. Add executable resources and Nix out-link fulfillment

**Goal:** Let plugins declare executable resources and let Korri fulfill them through Nix without binding the package into system config or user profiles.

**Requirements:** R8, R11-R13

**Files:**
- Add: `product/platform/plugin/resources.ts`
- Add: `product/platform/plugin/nix-fulfillment.ts`
- Add: `product/platform/plugin/nix-fulfillment.test.ts`
- Modify as needed: `product/platform/config/xdg-paths.ts` or closest existing state-root helper

**Approach:**
- Define resource descriptors for at least `kind: "executable"`.
- Define a Nix fulfillment descriptor with `installable` and `binary` fields.
- Implement a Nix fulfillment provider that runs `<absolute-nix-command> build <installable> --out-link <korri-owned-link>` through an injected process runner.
- Require the host to provide the absolute Nix command path for fulfillment. On NixOS this can default from the product/runtime module or package wrapper; tests should not assume `nix` is discoverable through `PATH`.
- Resolve fulfilled executables by checking `<out-link>/bin/<binary>` and returning an absolute command path.
- Persist or derive enough fulfillment state to distinguish `missing`, `fulfilled`, and `broken` resources.
- Keep all tests hermetic by using a fake runner and temporary directories; do not invoke real Nix in unit tests.

**Test scenarios:**
- Builds the expected absolute Nix `build --out-link` command for a resource.
- Resolves a fulfilled executable to an absolute path under the out-link.
- Reports missing executable when the out-link exists but the binary path does not.
- Reports failed fulfillment when the runner exits unsuccessfully.
- Uses Korri-owned plugin/resource state paths, not the user's Nix profile.
- Does not depend on `PATH` to find the Nix executable.
- Does not attempt network/build work during launch resolution tests unless an explicit fulfillment operation is invoked.

---

### U3. Add plugin catalog/playable and native-executable launch bridge

**Goal:** Let enabled plugins contribute playable catalog entries that can appear in the library/catalog surfaces and resolve to launch specs without becoming `apps` records.

**Requirements:** R6-R8, R14-R16

**Files:**
- Add: `product/platform/plugin/catalog.ts`
- Add: `product/platform/plugin/native-launch.ts`
- Add: `product/platform/plugin/catalog-library-source.ts`
- Add: `product/platform/plugin/catalog-library-source.test.ts`
- Modify narrowly: `product/platform/library/library-services.ts`
- Modify narrowly if needed: `product/platform/library/library-source-layer-live.ts`
- Modify narrowly if needed: `product/platform/library/library-source-layer-memory.ts`

**Approach:**
- Define plugin-facing catalog/playable records with releases that can use `launch.kind: "native-executable"` and an executable resource ref.
- Add a small adapter that exposes plugin catalog entries through existing `LibrarySource`/playable list seams. Prefer a composition wrapper that combines existing repository entries with plugin entries over changing the persisted ProseQL schema in this first slice.
- Add native-executable launch resolution: resolve the executable resource, build a normal `LaunchSpec`, and attach release-level Gamescope policy.
- Missing resource should make the playable visible but not launchable, or produce a config failure on launch with a clear diagnostic. Prefer visibility with actionable missing-resource status if the existing UI seam can carry it cheaply; otherwise launch-time diagnostic is acceptable for first pass.
- Do not create a synthetic public `apps.neverball` record. If implementation needs an internal adapter object to reuse launch code, keep it plugin-internal and do not surface it as authored app config.

**Test scenarios:**
- Plugin-contributed Neverball appears in playable entries when the plugin is enabled.
- Plugin-contributed Neverball does not appear when the plugin is available but disabled.
- Launch resolution for a fulfilled native executable returns a `LaunchSpec` with an absolute command and expected args/env/cwd defaults.
- Launch resolution carries the plugin release's Gamescope policy separately from the executable path.
- Launch resolution fails clearly when the executable resource is missing.
- Existing ProseQL-backed library entries still list and launch unchanged.

---

### U4. Add the Neverball first-party plugin module

**Goal:** Provide the first real plugin module that validates the plugin model end-to-end without adding Neverball to Korri core.

**Requirements:** R1-R16 plus post-requirements decisions

**Files:**
- Add: `product/plugins/neverball/index.ts`
- Add: `product/plugins/neverball/neverball.test.ts`
- Modify: `product/plugins/index.ts`

**Approach:**
- Define `@korri:neverball` as a first-party plugin descriptor.
- Contribute a single catalog/playable item titled Neverball with one native-executable release.
- Declare one executable resource fulfilled by Nix installable `nixpkgs#neverball` and binary `neverball`.
- Default the release to Gamescope enabled if that remains the product-level posture for native games.
- Add a diagnostics handler that reports whether the executable resource is fulfilled.
- Keep all Neverball-specific strings, metadata, resource ids, and launch defaults inside this plugin module.

**Test scenarios:**
- Plugin descriptor has stable id `@korri:neverball` and no dependency on module path as identity.
- Descriptor contributes one playable and one executable resource.
- Descriptor does not contribute an `apps.neverball` record.
- Diagnostics reports missing resource before fulfillment and ok after the fake fulfillment resolver supplies the executable.
- Registry can enable Neverball and include its catalog contribution without any Neverball-specific branch in platform code.

---

### U5. Wire plugin services into the local library/launch path

**Goal:** Make the plugin host participate in the app's existing local launch flow enough to launch Neverball after its resource is fulfilled.

**Requirements:** R6-R13, R14-R16

**Files:**
- Modify: `product/platform/library/library-source-layer-live.ts`
- Modify: `product/platform/library/library-source-layer-memory.ts`
- Modify if needed: `product/apps/portal/api/library/launch.rpc-handler.ts`
- Modify if needed: `product/apps/portal/api/catalog/catalog-snapshot.ts`
- Add: `product/platform/plugin/plugin-library-integration.test.ts`

**Approach:**
- Compose the existing `LibrarySource` with a plugin-backed source/resolver rather than replacing the ProseQL repository.
- Ensure composition is consistent across every launch/list method currently used by callers: `list()`, `listPlayableEntries()`, `canResolveLaunchForGame()`, `launchSpecFor()`, and `resolveLaunchForGame()`. The portal launch handler currently performs an existence preflight through `list()`, so plugin playables must be visible there or the preflight must be narrowed to resolver truth.
- Keep launch output as the existing `ResolvedLaunch` shape so `handleLaunchLibrary`, Gamescope composition, sessiond launch intents, and foreground session handling remain unchanged.
- Ensure `ResolvedLaunch.app` is either omitted for native plugin launches or uses a generic internal integration marker only if existing call sites require it. Do not introduce a Neverball app identity.
- Add targeted tests around the portal launch handler if the handler needs changes to tolerate plugin-native resolved launches.

**Test scenarios:**
- After the Bandai/product validation configuration is active, Neverball appears in the local playable list/catalog through the plugin-backed path.
- Local library launch accepts a plugin-contributed playable id.
- Portal launch preflight does not reject an enabled plugin playable as unknown.
- The handler composes Gamescope around the plugin launch spec using existing Gamescope logic.
- Steam-specific Gamescope behavior is not triggered for plugin-native Neverball launches.
- Existing library launch tests continue to pass for repository-backed items.

---

### U6. Add Bandai/product validation wiring and Nix fulfillment smoke coverage

**Goal:** Make the first slice demonstrable after a Bandai deploy/switch while proving the Nix fulfillment command contract without real Nix execution in unit tests.

**Requirements:** R11-R13

**Files:**
- Modify as needed: product/Bandai configuration wiring for enabled first-party plugins
- Add or modify: `tools/testing/nix/korri-plugin-fulfillment-check.nix` only if a cheap eval-only check is useful
- Modify if needed: `product/systems/nixos/flake/checks.nix`
- Add unit coverage already listed in U2

**Approach:**
- Keep TypeScript unit tests hermetic with fake command runners.
- Add the narrow product/Bandai enablement needed for the first-party Neverball plugin to contribute a playable after deploy/switch. This should enable the plugin, not add a Neverball-specific core app or `services.korri.neverball` module.
- Ensure the host configuration provides an absolute Nix command capability for fulfillment on Bandai. If the platform image does not currently expose one to the daemon/session environment, add the smallest generic plugin-fulfillment host setting rather than a Neverball-specific package binding.
- If adding a Nix check, keep it eval-only or derivation-shape-only: verify nixpkgs exposes `neverball` and `lib.getExe pkgs.neverball` resolves, without installing it as a Korri system package.
- Do not make Neverball part of the image closure unless a later product decision says the plugin should ship pre-fulfilled.

**Test scenarios:**
- Bandai/product validation config enables the Neverball plugin and the playable appears after deploy/switch.
- Bandai/product validation config provides an absolute Nix command capability to the fulfillment host.
- Optional Nix check confirms `pkgs.neverball` is available from the flake's nixpkgs input.
- No NixOS module check asserts `services.korri.neverball`; that option should not exist in this slice.

---

## Suggested Execution Order

1. U1: Add plugin contract/registry with tests.
2. U2: Add resource model and Nix out-link fulfillment with fake-runner tests.
3. U3: Add plugin catalog/native launch adapter with tests.
4. U4: Add Neverball plugin and descriptor tests.
5. U5: Wire into library/launch path and prove Neverball launches through the generic local launch flow.
6. U6: Add Bandai/product enablement and optional Nix eval/check coverage if low-cost.

This order keeps the host contract and fulfillment model testable before touching the live launch path.

---

## Verification Plan

Targeted commands to use during implementation:

```sh
bun test product/platform/plugin/registry.test.ts \
  product/platform/plugin/nix-fulfillment.test.ts \
  product/platform/plugin/catalog-library-source.test.ts \
  product/plugins/neverball/neverball.test.ts \
  product/platform/plugin/plugin-library-integration.test.ts
```

If live library/portal launch files change, also run the focused existing tests that cover those seams:

```sh
bun test product/platform/library/library-source-layer-live.test.ts \
  product/platform/library/library-source-layer-memory.test.ts \
  product/apps/portal/api/library/launch.rpc-handler.test.ts \
  product/services/device/game-stream-launch-intent.test.ts \
  product/services/device/game-stream-runner.test.ts
```

If a Nix check is added:

```sh
nix build .#checks.$(nix eval --raw --impure --expr builtins.currentSystem).korri-plugin-fulfillment
```

Broader `bun run typecheck`, `just typecheck`, and `just lint` may still be red on unrelated pre-existing failures; record targeted results and any known pre-existing failures during execution.

---

## Risks and Mitigations

- **Risk: Hidden app-record dependency leaks Neverball into `apps`.** Mitigation: add explicit tests that Neverball's plugin descriptor does not contribute `apps.neverball` and that platform code has no Neverball-specific branch.
- **Risk: Launch path assumes every playable has an app integration.** Mitigation: isolate changes in a plugin-native launch adapter and keep `ResolvedLaunch` compatible for downstream launch/session code.
- **Risk: Nix fulfillment accidentally mutates user/system state.** Mitigation: use `nix build --out-link` under Korri-owned resource state only; test command construction and path ownership.
- **Risk: First pass grows into third-party plugin loading.** Mitigation: static first-party registry only; defer external install/update/marketplace work.
- **Risk: Resource fulfillment on first launch causes network/build surprises.** Mitigation: launch only consumes fulfilled resources; missing resources produce actionable diagnostics.
- **Risk: Catalog vs library vocabulary causes churn.** Mitigation: keep plugin-facing names catalog/playable and bridge to existing library services at adapter seams.

---

## Follow-Up Work

- General user-facing plugin enable/install UI or CLI workflow beyond the first-party Bandai validation enablement.
- Persistent plugin enablement configuration and plugin resource status display.
- Optional plugin resource update/uninstall commands.
- Third-party/user-installed plugin loading and trust model.
- Additional fulfillment providers beyond Nix.
- Migration of existing RetroArch, Steam, fake-08, and acquisition providers into plugin-shaped modules when the host contract has proven itself.
- Broader `library` to `catalog` vocabulary migration.

---

## Outstanding Questions

### Resolve During Implementation

- What is the narrowest existing state-root helper to use for Korri-owned plugin resource out-links?
- Should plugin-contributed playables be visible before resource fulfillment, and if so, which existing list/snapshot fields can carry missing-resource status without UI schema churn?
- Can `ResolvedLaunch.app` be optional for plugin-native launches in all current call sites, or is a generic internal marker needed for compatibility?

### Deferred Product Questions

- What should the eventual user-facing plugin install/enable UI look like?
- Should some first-party plugins ship pre-enabled or pre-fulfilled in product images?
- How should plugin resource updates and rollback be exposed to users?
