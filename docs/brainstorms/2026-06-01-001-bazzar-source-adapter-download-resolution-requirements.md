---
date: 2026-06-03
topic: bazzar-monorepo-migration-korri-cli-acquisition
---

# Bazzar Monorepo Migration and Korri CLI Acquisition Surface

## Summary

Korri should absorb Bazzar’s source-acquisition core so `bazzar <cmd>` becomes `korri bazzar <cmd>`, with the current command family preserved as strictly as possible. The migration must avoid a blind repo import: Bazzar UI, standalone product identity, and non-aligned demo API code are excluded; legally sensitive `.mjs` plugins move to a private/local quarantine; approved TypeScript acquisition plugins and core capability migrate into Korri.

---

## Problem Frame

Bazzar began as a standalone TypeScript/Bun source-adapter CLI and core library. Earlier Korri/Bazzar requirements kept Bazzar separate during hardening so Korri could consume a stable command contract without inheriting prototype-grade source quirks. That boundary reduced risk while Bazzar’s source-health, download-resolution, and command-output contracts were still settling.

The product direction has changed: source acquisition should now become a Korri product capability rather than a separate public Bazzar product. The risk is that a broad repo import would bring along stale app identity, prototype UI/API surfaces, duplicated tooling, and code that does not fit Korri’s current product/platform/theme architecture. A careful migration should preserve the parts that make source acquisition useful while deleting or deferring everything that only exists because Bazzar was once standalone.

The first useful user/operator outcome is CLI-shaped, with an API/RPC seam wired now for the same operations so future UI work has a Korri-aligned surface. Existing `bazzar <cmd>` workflows should become `korri bazzar <cmd>` workflows, while future acquisition UI waits until the migrated core is stable enough to present inside the product.

---

## Actors

- A1. Korri maintainer/operator: Runs CLI commands to inspect, search, and resolve external source candidates.
- A2. Korri CLI: Provides the public `korri bazzar` command group and reports machine-readable outcomes where required.
- A3. Source acquisition core: The migrated Bazzar-derived capability that loads sources, searches candidates, validates health, and resolves downloadable artifacts.
- A4. Korri headless/server API/RPC surface: Exposes acquisition operations through Korri’s Effect RPC conventions for machine/client access; portal/app RPC registration is deferred.
- A5. Future Korri acquisition UI: A later product surface that may consume the same capability after the CLI/API subset stabilizes.
- A6. Korri library: The known-playable game library, which must remain distinct from external discovery and acquisition candidates until an explicit import flow exists.
- A7. Private/local plugin quarantine: Holds legally sensitive `.mjs` plugins outside Korri for preservation/review only; Korri does not load, package, advertise, or depend on them.

---

## Key Flows

- F1. Migrate Bazzar capability into Korri
  - **Trigger:** The migration inventory selects a Bazzar module for the first Korri-native subset.
  - **Actors:** A2, A3, A4, A7
  - **Steps:** The inventory classifies the module as import, adapt, defer, or delete; legally sensitive `.mjs` plugin files move to the private/local quarantine; approved TypeScript acquisition core/plugins move into Korri; standalone product identity is removed from the migrated surface after strict CLI compatibility is proven.
  - **Outcome:** Korri owns the acquisition capability without absorbing Bazzar UI, demo API, or standalone packaging baggage.
  - **Covered by:** R1, R2, R3, R9, R10, R11

- F2. Run `korri bazzar` commands
  - **Trigger:** The operator runs a command that previously existed as `bazzar <cmd>`.
  - **Actors:** A1, A2, A3
  - **Steps:** Korri parses the command, delegates to the migrated acquisition core, preserves the existing human/operator versus machine-readable command split, and exits with the appropriate status.
  - **Outcome:** The operator can search, inspect details, list plugins, validate sources, and resolve downloads from Korri CLI without a standalone Bazzar binary.
  - **Covered by:** R3, R4, R5, R6, R7, R8, R12

- F3. Call acquisition through Korri RPC
  - **Trigger:** A Korri client or future UI needs acquisition data without shelling out.
  - **Actors:** A3, A4, A5
  - **Steps:** Korri headless/server RPC handlers invoke the same acquisition services for search, details, plugins, source validation, and download resolution, returning schema-backed responses and typed errors.
  - **Outcome:** API consumers get a Korri-aligned acquisition seam without importing Bazzar’s demo API architecture.
  - **Covered by:** R10, R13, R14

- F4. Preserve library boundary
  - **Trigger:** Search/details/resolution returns an external candidate or artifact outcome.
  - **Actors:** A1, A3, A4, A6
  - **Steps:** Korri reports source candidates and resolution outcomes as acquisition lifecycle data, not known-playable library data.
  - **Outcome:** External discovery and resolved artifacts do not become Korri library records until a later explicit import/acquisition flow exists.
  - **Covered by:** R6, R7, R15

---

## Requirements

**Migration scope and inventory**

- R1. The migration must begin with an explicit Bazzar inventory that classifies each major area as import, adapt, defer, or delete before code is moved into Korri.
- R2. Korri must not import Bazzar wholesale. Every imported piece must support the first `korri bazzar` CLI/API subset or a directly shared acquisition invariant.
- R3. Standalone Bazzar must not remain a public product surface after strict `korri bazzar` compatibility is proven. The public operator entrypoint is `korri bazzar`, not a separate `bazzar` binary.
- R4. The first `korri bazzar` subset must preserve the current Bazzar CLI command family as strictly as possible: search, details, plugins, validate-sources, and resolve-download keep command names, important flags, exit behavior, and output shapes. The explicit exception is provider set compatibility: quarantined `.mjs` providers are excluded from active Korri results.

**CLI-first acquisition capability**

- R5. `korri bazzar validate-sources` must provide repeatable source-health visibility without requiring a separate Bazzar install.
- R6. `korri bazzar search`, `details`, and `resolve-download` must keep external source candidates distinct from Korri known-playable library records.
- R7. Download resolution must remain a separate step from search/details and must classify final artifacts separately from provisional, blocked, unsupported, defective, or caller/configuration-error outcomes.
- R8. Machine-readable command surfaces must preserve strict stdout/stderr discipline: contract output belongs on stdout, while logs and diagnostics stay off the parseable output stream.

**Deletion and exclusion discipline**

- R9. Bazzar UI must not be imported in this slice.
- R10. Bazzar’s tRPC/Fastify demo API must not be imported; Korri API work must use Korri’s Effect RPC conventions.
- R11. Prototype/demo surfaces, standalone package metadata, duplicate development tooling, and compatibility shims must not be retained merely because they exist in Bazzar.
- R12. Live source failures, credential failures, and source defects must not be masked by mock data, fallback success, or compatibility behavior in Korri-facing output.

**Plugin placement**

- R13. Bazzar `.mjs` plugin files must move out to a private/local quarantine and remain outside Korri in this slice because they carry legal/distribution concerns.
- R14. Approved TypeScript acquisition plugins and source-specific helper modules may migrate into Korri with the acquisition core, under `product/platform/acquisition/plugins/*` as platform acquisition internals.
- R15. Korri must not load, package, advertise, or depend on quarantined `.mjs` plugins in this slice.

**API and future product path**

- R16. Korri must expose all five acquisition operations through a Korri-aligned headless/server RPC/API seam: search, details, plugins, validate-sources, and resolve-download. Portal/app RPC registration is deferred.
- R17. The migration must leave room for a later Korri acquisition UI, but that UI is not part of this slice.
- R18. Creating known-playable Korri library entries from resolved external artifacts is deferred until a later explicit acquisition/import flow defines the trust, storage, and runtime rules.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R9, R10, R11, R13, R14.** Given the Bazzar repo contains CLI, core acquisition code, TypeScript plugins, `.mjs` plugins, UI, API, package metadata, and tooling, when the migration inventory is completed, each area is explicitly marked import, adapt, defer, or delete before any broad copy is accepted.
- AE2. **Covers R3, R4.** Given an operator previously ran `bazzar search`, `bazzar details`, `bazzar plugins`, `bazzar validate-sources`, or `bazzar resolve-download`, when standalone Bazzar is retired, the corresponding workflow is available under `korri bazzar` with Bazzar-compatible command names, important flags, exit behavior, and output shapes, excluding only quarantined `.mjs` providers from the active provider set.
- AE3. **Covers R5, R8, R12.** Given one acquisition source has invalid credentials and another source is healthy, when `korri bazzar validate-sources` runs, the invalid source reports a configuration/auth failure, the healthy source can still report success, and logs do not corrupt machine-readable output.
- AE4. **Covers R6, R7, R18.** Given a source details page points to an interstitial or unresolved handoff, when `korri bazzar resolve-download` runs, Korri reports a non-final resolution state and does not create a known-playable library record.
- AE5. **Covers R10, R16.** Given Bazzar has a tRPC/Fastify demo API and an Effect/Schema-style core acquisition seam, when API work is migrated, Korri exposes acquisition through its own headless/server Effect RPC conventions and does not import the demo API architecture or register portal/app RPCs in this slice.
- AE6. **Covers R13, R15.** Given `.mjs` plugins were moved to the private/local quarantine, when the first Korri migration slice runs, Korri does not load, package, advertise, depend on, or report those plugins as active providers for migrated TypeScript core/CLI/API behavior.

---

## Success Criteria

- A maintainer can run `korri bazzar` command workflows for Bazzar’s current CLI command family, with strict compatibility except for quarantined `.mjs` providers, without installing or invoking a standalone Bazzar product.
- The migration removes ambiguity about what was salvaged, adapted, deferred, or deleted from Bazzar.
- Korri gains source acquisition capability without importing Bazzar UI, non-aligned demo API code, or standalone product identity.
- Korri exposes a schema-backed headless/server RPC/API acquisition seam for all five operations.
- `.mjs` plugin files live outside Korri in a private/local quarantine, while approved TypeScript acquisition core/plugins live in Korri.
- Source health and download resolution remain explicit and trustworthy enough for future UI planning.
- Korri’s known-playable library model remains intact: external candidates and resolved artifacts do not become library entries without a later import/acquisition decision.
- Downstream planning can start from a confirmed keep/delete boundary instead of inventing migration scope.

---

## Scope Boundaries

- Importing Bazzar wholesale is out of scope.
- Keeping standalone `bazzar` as a public binary or product surface is out of scope.
- Importing Bazzar UI is out of scope.
- Importing Bazzar’s tRPC/Fastify demo API is out of scope.
- Loading, packaging, advertising, or depending on quarantined external `.mjs` plugins from Korri is out of scope for this slice.
- Building the later Korri acquisition UI is out of scope.
- Building the later artifact-to-library import/acquisition flow is out of scope.
- Treating external Bazzar results as Korri known-playable library entries is out of scope.
- Permanently supporting a separate standalone Bazzar public product surface is out of scope; strict `korri bazzar` CLI compatibility is required before retirement, with the quarantined-provider-set exception.
- Reorganizing unrelated Korri product/platform/theme code is out of scope.

---

## Key Decisions

- Core/CLI port now: Bazzar’s useful work becomes Korri acquisition capability rather than a long-lived external wrapper.
- Effect upgrade first: Korri’s Effect-family packages should be upgraded together in a separate prerequisite PR before the acquisition migration is wired.
- Inventory gate before import: A keep/delete classification is required so the copy-first migration does not accidentally preserve standalone-app baggage.
- `.mjs` plugins quarantined: Legally sensitive `.mjs` plugins move to a private/local quarantine; Korri does not load, package, advertise, or depend on them in this first slice.
- TypeScript plugins migrate: approved TypeScript acquisition plugins and source-specific helpers move with the core where inventory classifies them as useful, under `product/platform/acquisition/plugins/*` as platform acquisition internals.
- Korri server RPC, not Bazzar demo API: API exposure uses Korri’s headless/server Effect RPC conventions for all five operations.
- Preserve acquisition trust boundaries: Source candidates, download-resolution outcomes, and known-playable library records remain separate lifecycle stages.

---

## Dependencies / Assumptions

- The Bazzar core acquisition behavior can be separated from standalone CLI/package identity without losing the useful command workflows.
- The current Bazzar CLI command family is the right compatibility set for the first Korri subcommand surface.
- Bazzar’s current Effect CLI/Effect v4 beta posture is close enough to Korri’s stack that migration is mostly adaptation plus dependency alignment, not a wholesale rewrite.
- The private/local plugin quarantine can be created or populated outside the Korri repo for preservation/review only; external plugin loading is not implied.
- Future UI work will be easier if the CLI and headless/server RPC subsets first establish a trustworthy Korri acquisition seam.
- The existing Korri CLI and headless/server API/RPC infrastructure are the appropriate public surfaces for the first integration; portal/app RPC registration can follow later if UI work needs it.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1, R2][Technical] What exact Bazzar inventory categories and evidence should planning require before classifying a module as import, adapt, defer, or delete?
- [Resolved in plan][Affects R4][Technical] `korri bazzar` must preserve command names, important flags, exit behavior, and output shapes as strictly as possible; the only planned simplification is excluding quarantined `.mjs` providers from the active provider set.
- [Affects R5, R7, R8][Technical] How should existing source-health and download-resolution contracts be adapted to Korri naming and runtime conventions while preserving parseable behavior?
- [Resolved in plan][Affects R10, R16][Technical] Bazzar’s aligned core RPC adapter maps into Korri’s headless/server RPC group only for this slice.
- [Resolved in plan][Affects R13, R15][Technical] The separate destination is a private/local quarantine for legal/distribution concerns, not a supported external plugin checkout.
- [Affects R18][Technical] What later acquisition/import flow should convert a resolved artifact into a known-playable Korri library entry?
