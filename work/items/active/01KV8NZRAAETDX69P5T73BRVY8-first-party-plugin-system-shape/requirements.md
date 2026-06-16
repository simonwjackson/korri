---
date: 2026-06-16
topic: first-party-plugin-system-shape
---

# First-Party Plugin System Shape

## Summary

Define Korri's first-pass plugin system as an in-repo, first-party modularity model. Plugins contribute static config into the existing cascade and optional host-invoked handlers, while concrete examples such as RetroArch, Steam, fake-08, and PICO-8 BBS remain validation examples rather than required migration scope.

---

## Problem Frame

Korri is accumulating first-class integration behavior across apps, runtimes, catalog/acquisition providers, launch preparation, and image/runtime defaults. Without a plugin-shaped boundary, that behavior tends to spread across platform, service, and config code in ways that make future integrations harder to reason about and harder to move incrementally.

Recent integration work also exposed a recurring distinction: some behavior is static product configuration layered into the cascade, while other behavior is host-invoked preparation or lookup. Korri needs a durable way to model both without prematurely building a third-party plugin ecosystem or locking early examples into the core product model.

---

## Actors

- A1. Integration author: Adds or reshapes first-party Korri integrations such as app support, runtime support, catalog providers, or launch-preparation behavior.
- A2. Planner/implementer: Turns the plugin requirements into code without inventing product semantics or overbuilding distribution mechanics.
- A3. Image/profile composer: Selects product capabilities and expects integration-provided defaults to layer through normal Korri config behavior.
- A4. Player/operator: Benefits from first-class integrations working by default while preserving normal override behavior.

---

## Key Flows

- F1. First-party plugin contributes static config
  - **Trigger:** An integration author defines a first-party plugin that contributes app, runtime, module, profile, provider, or catalog configuration.
  - **Actors:** A1, A2
  - **Steps:** The plugin declares static config contributions; Korri registers the plugin; the host exposes those contributions to the same cascade/config model used by other product configuration.
  - **Outcome:** Integration defaults become available without creating a parallel configuration mechanism.
  - **Covered by:** R1, R2, R5, R6, R7

- F2. First-party plugin contributes host-invoked behavior
  - **Trigger:** An integration needs dynamic behavior such as catalog lookup, artifact resolution, diagnostics, runtime resolution, or launch preparation.
  - **Actors:** A1, A2
  - **Steps:** The plugin declares a handler for a host-owned operation; the host invokes it with operation-scoped context; the host adapts the result into Korri's Effect runtime.
  - **Outcome:** Dynamic integration behavior stays behind host-owned seams and does not require plugin authors to use Effect unless they choose to.
  - **Covered by:** R3, R4, R8, R9, R10

- F3. Plugin requirements are validated simply
  - **Trigger:** A plugin depends on a capability supplied by another first-party plugin or existing product integration.
  - **Actors:** A1, A2, A3
  - **Steps:** The plugin declares a capability/ref requirement; the registry or host validates that the requirement is satisfied by known first-party capabilities; missing requirements produce a clear failure.
  - **Outcome:** Dependencies are explicit without introducing package-manager-style resolution.
  - **Covered by:** R11, R12, R13

---

## Requirements

**Plugin authoring model**

- R1. Phase 1 must support first-party, in-repo plugins only.
- R2. Plugins must be TypeScript-authored through a typed Korri API rather than a separate YAML/JSON manifest format.
- R3. The authoring API must allow one module to register one or more independently addressable plugins.
- R4. Korri-owned plugin contract types and helpers must remain separate from plugin declarations so plugin files consume a host contract rather than defining it ad hoc.
- R5. Plugin/provider identity must be stable at the plugin level; module or file boundaries are packaging convenience, not durable product identity.

**Contribution model**

- R6. Plugins must be able to contribute static config that layers into Korri's existing cascade/config system.
- R7. Static config contributions must cover the kinds of product facts Korri needs for integrations, including providers, provider links, storage, systems, apps, modules, runtimes, profiles, and catalog entries.
- R8. Plugins must be able to contribute host-invoked handlers for dynamic behavior such as catalog listing, launch preparation, runtime resolution, artifact/download resolution, and diagnostics.
- R9. Handler invocation context must be operation-scoped and app-agnostic; generic context must not hardcode integration-specific concepts such as Steam or RetroArch.
- R10. Plugin authors must not be required to use Effect, but handlers may return Effect values and the host must be able to consume plugin behavior through Korri's Effect runtime.

**Dependency and capability model**

- R11. Plugins must be able to declare simple requirements on capabilities or provider-owned records.
- R12. The requirement model must avoid package-manager behavior: no semver dependency graph, no automatic external install resolution, and no transitive marketplace semantics in Phase 1.
- R13. Missing required capabilities must fail closed with diagnostics that make the missing capability or provider relationship visible to implementers/operators.

**Vocabulary and migration posture**

- R14. New plugin APIs must use `catalog` vocabulary for contributed/discovered item facts.
- R15. Existing Korri `library` vocabulary must not block the plugin-system slice; broader library-to-catalog migration is deferred.
- R16. Example integrations such as RetroArch, Steam, fake-08 PICO-8 runtime support, and PICO-8 BBS catalog/acquisition must be used as modeling checks, not as required Phase 1 migration deliverables.

---

## Acceptance Examples

- AE1. **Covers R1-R8.** Given a first-party app integration is modeled as a plugin, when Korri registers it, its static app defaults are available through the normal config/cascade path and any launch-preparation behavior is exposed through a host-owned handler.
- AE2. **Covers R9, R11-R13.** Given a runtime plugin requires a libretro-capable app, when that capability is not present, Korri reports the missing requirement instead of selecting an arbitrary app or trying to install one.
- AE3. **Covers R6-R8, R11, R16.** Given a catalog/acquisition plugin depends on a runtime plugin, when both are registered, the catalog entries can reference the runtime without the catalog plugin owning runtime launch behavior.
- AE4. **Covers R10.** Given one plugin handler returns a plain value and another returns an Effect value, when the host invokes both, both can be consumed through the host's Effect-backed runtime boundary.
- AE5. **Covers R14-R16.** Given a new plugin contributes item metadata, when planning maps it into current Korri surfaces, the plugin-facing vocabulary remains catalog-first even if existing runtime APIs still contain library naming.

---

## Success Criteria

- Korri has a clear first-party plugin shape that future integrations can follow without spreading behavior across unrelated layers.
- Planning can implement a minimal plugin registry and sign-of-life contribution without inventing marketplace, installation, or third-party trust behavior.
- The model can represent app support, runtime/core support, catalog/acquisition, launch-preparation overlays, and simple capability requirements through the same conceptual contract.
- Existing integration behavior can remain in place while new plugin-shaped seams are introduced incrementally.

---

## Scope Boundaries

- Phase 1 does not require migrating RetroArch, Steam, fake-08, PICO-8 BBS, or any other existing integration into plugins.
- Phase 1 does not support third-party/user-installed plugins.
- Phase 1 does not include a plugin marketplace, install/update lifecycle, package distribution, sandboxing, or trust tiers.
- Phase 1 does not include NPM-style dependency resolution, semver ranges, or automatic transitive dependency installation.
- Phase 1 does not require a separate manifest file format.
- Phase 1 does not include plugin-owned UI surfaces or plugin-owned rendering.
- Phase 1 does not require renaming existing `library` APIs across Korri.
- Phase 1 does not define exact code paths, file layouts beyond the first-party product-plugin area, or complete schema details; planning owns those implementation choices.

---

## Key Decisions

- First-party plugins before third-party plugins: This gives Korri modularity benefits now without taking on external-code loading, trust, or distribution costs.
- TypeScript descriptor before manifest files: First-party plugins can use the same type system and refactoring tools as Korri product code; external manifests can be reconsidered later if user-installed plugins become real.
- Config plus handlers: Static cascade inputs and dynamic host-invoked behavior are separate contribution classes, which prevents dynamic behavior from masquerading as config.
- Operation-scoped context: A generic plugin context should describe provider/provenance and operation inputs, not hardcode app-specific integration identities.
- Capability requirements, not package dependencies: Requirements express what capability must be present, not how to fetch or install a dependency.
- Catalog vocabulary for new plugin APIs: New plugin surfaces should use the target vocabulary while existing library names migrate separately.

---

## Dependencies / Assumptions

- Korri's existing cascade/config model can accept plugin-provided static config as another host-controlled input layer.
- Host-owned adapters can normalize plain, Promise-like, and Effect-returning handler results into the Effect runtime.
- First-party plugin registration can be explicit in Phase 1; automatic discovery is not required to prove the model.
- Existing integration code can remain operational while plugin-shaped seams are introduced around or alongside it.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R2-R5][Technical] What exact exported API names and TypeScript helper signatures should the first implementation use?
- [Affects R6-R8][Technical] Where should plugin-provided config enter the cascade so existing user/image/profile override semantics remain intact?
- [Affects R8-R10][Technical] What adapter shape should normalize plain, Promise-like, and Effect-returning handler results?
- [Affects R11-R13][Technical] Where should capability requirements be validated, and how should diagnostics be surfaced?
- [Affects R14-R15][Technical] What compatibility aliases, if any, are needed while plugin APIs use catalog vocabulary and existing APIs still use library vocabulary?
