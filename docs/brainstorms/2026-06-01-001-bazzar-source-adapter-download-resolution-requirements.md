---
date: 2026-06-03
topic: bazzar-monorepo-migration-korri-cli-acquisition
---

# Bazzar Monorepo Migration and Korri CLI Acquisition Surface

## Summary

Korri should selectively absorb Bazzar’s useful source-acquisition capability so the public operator surface becomes `korri bazzar <cmd>`. The migration must start with an explicit inventory gate so Korri imports only the CLI/core acquisition subset it needs, not Bazzar’s standalone product identity, UI, or non-aligned demo API surfaces.

---

## Problem Frame

Bazzar began as a standalone TypeScript/Bun source-adapter CLI and core library. Earlier Korri/Bazzar requirements kept Bazzar separate during hardening so Korri could consume a stable command contract without inheriting prototype-grade source quirks. That boundary reduced risk while Bazzar’s source-health, download-resolution, and command-output contracts were still settling.

The product direction has changed: source acquisition should now become a Korri product capability rather than a separate public Bazzar product. The risk is that a broad repo import would bring along stale app identity, prototype UI/API surfaces, duplicated tooling, and code that does not fit Korri’s current product/platform/theme architecture. A careful migration should preserve the parts that make source acquisition useful while deleting or deferring everything that only exists because Bazzar was once standalone.

The first useful user/operator outcome is CLI-shaped. Existing `bazzar <cmd>` workflows should become `korri bazzar <cmd>` workflows, while future UI integration waits until the Korri acquisition model is stable enough to present inside the product.

---

## Actors

- A1. Korri maintainer/operator: Runs CLI commands to inspect, search, and resolve external source candidates.
- A2. Korri CLI: Provides the public `korri bazzar` command group and reports machine-readable outcomes where required.
- A3. Source acquisition core: The migrated Bazzar-derived capability that loads sources, searches candidates, validates health, and resolves downloadable artifacts.
- A4. Future Korri acquisition UI: A later product surface that may consume the same capability after the CLI subset stabilizes.
- A5. Korri library: The known-playable game library, which must remain distinct from external discovery and acquisition candidates until an explicit import flow exists.

---

## Key Flows

- F1. Migrate a command into Korri
  - **Trigger:** A Bazzar CLI command is selected for the first Korri-native subset.
  - **Actors:** A1, A2, A3
  - **Steps:** The migration inventory classifies the command’s supporting code, imports or adapts only the needed acquisition pieces, exposes the behavior under `korri bazzar`, and removes any dependency on standalone `bazzar` product identity.
  - **Outcome:** The operator can run the corresponding `korri bazzar` command without needing a separate Bazzar binary.
  - **Covered by:** R1, R2, R3, R4, R8

- F2. Validate source health
  - **Trigger:** The maintainer wants to know whether configured acquisition sources are usable.
  - **Actors:** A1, A2, A3
  - **Steps:** Korri runs the migrated validation behavior, each source reports its own typed health, and failures are surfaced without masking them behind fallback success.
  - **Outcome:** The maintainer can distinguish healthy, degraded, unavailable, unsupported, defective, and configuration/caller-error states.
  - **Covered by:** R5, R9, R10, R11

- F3. Search or inspect external candidates
  - **Trigger:** The operator searches for external candidates or asks for details about a candidate.
  - **Actors:** A1, A2, A3, A5
  - **Steps:** Korri delegates to the acquisition core, returns source candidates/details, and keeps those candidates outside the known-playable library model.
  - **Outcome:** External discovery is available through Korri CLI without implying the result is already playable library content.
  - **Covered by:** R4, R6, R12

- F4. Resolve a candidate download
  - **Trigger:** The operator has a source candidate and wants to know whether it resolves to a real downloadable artifact.
  - **Actors:** A1, A2, A3, A5
  - **Steps:** Korri runs the migrated resolution behavior, classifies the outcome explicitly, and reports whether the candidate is final, provisional/interstitial, unavailable, unsupported, defective, or a caller/configuration error.
  - **Outcome:** Korri does not confuse details pages, source handoffs, blocked flows, or unresolved candidates with final downloadable artifacts.
  - **Covered by:** R6, R7, R10, R12

---

## Requirements

**Migration scope and inventory**

- R1. The migration must begin with an explicit Bazzar inventory that classifies each major area as import, adapt, defer, or delete before code is moved into Korri.
- R2. Korri must not import Bazzar wholesale. Every imported piece must support the first `korri bazzar` CLI subset or a directly shared acquisition invariant.
- R3. Standalone Bazzar must not remain a public product surface after the migration. The public operator entrypoint is `korri bazzar`, not a separate `bazzar` binary.
- R4. The first `korri bazzar` subset must preserve the behavior of the current Bazzar CLI command family: search, details, plugins, validate-sources, and resolve-download.

**CLI-first acquisition capability**

- R5. `korri bazzar validate-sources` must provide repeatable source-health visibility without requiring a separate Bazzar install.
- R6. `korri bazzar search`, `details`, and `resolve-download` must keep external source candidates distinct from Korri known-playable library records.
- R7. Download resolution must remain a separate step from search/details and must classify final artifacts separately from provisional, blocked, unsupported, defective, or caller/configuration-error outcomes.
- R8. Machine-readable command surfaces must preserve strict stdout/stderr discipline: contract output belongs on stdout, while logs and diagnostics stay off the parseable output stream.

**Deletion and exclusion discipline**

- R9. Bazzar UI must not be imported in this slice.
- R10. Bazzar API code must be excluded by default unless a specific API piece is proven to already match Korri’s Lattice direction and serves the CLI-first acquisition capability.
- R11. Prototype/demo surfaces, standalone package metadata, duplicate development tooling, and compatibility shims must not be retained merely because they exist in Bazzar.
- R12. Live source failures, credential failures, and source defects must not be masked by mock data, fallback success, or compatibility behavior in Korri-facing output.

**Future product path**

- R13. The migration must leave room for a later Korri acquisition UI, but that UI is not part of this slice.
- R14. Any later UI/API integration must consume the Korri acquisition capability through a Korri-aligned seam rather than resurrecting Bazzar’s standalone app or demo API architecture.
- R15. Creating known-playable Korri library entries from resolved external artifacts is deferred until a later explicit acquisition/import flow defines the trust, storage, and runtime rules.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R9, R10, R11.** Given the Bazzar repo contains CLI, core acquisition code, UI, API, package metadata, and tooling, when the migration inventory is completed, each area is explicitly marked import, adapt, defer, or delete before any broad copy is accepted.
- AE2. **Covers R3, R4.** Given an operator previously ran `bazzar search`, `bazzar details`, `bazzar plugins`, `bazzar validate-sources`, or `bazzar resolve-download`, when the first migration slice lands, the corresponding workflow is available under `korri bazzar` and does not require a standalone Bazzar binary.
- AE3. **Covers R5, R8, R12.** Given one acquisition source has invalid credentials and another source is healthy, when `korri bazzar validate-sources` runs, the invalid source reports a configuration/auth failure, the healthy source can still report success, and logs do not corrupt machine-readable output.
- AE4. **Covers R6, R7, R15.** Given a source details page points to an interstitial or unresolved handoff, when `korri bazzar resolve-download` runs, Korri reports a non-final resolution state and does not create a known-playable library record.
- AE5. **Covers R10, R13, R14.** Given Bazzar has an API/demo surface, when the migration inventory evaluates it, that code is excluded unless it is specifically proven to match Korri’s stack direction and to serve the CLI-first acquisition path.

---

## Success Criteria

- A maintainer can run `korri bazzar` command workflows for Bazzar’s current CLI command family without installing or invoking a standalone Bazzar product.
- The migration removes ambiguity about what was salvaged, adapted, deferred, or deleted from Bazzar.
- Korri gains source acquisition capability without importing Bazzar UI, non-aligned API code, or standalone product identity.
- Source health and download resolution remain explicit and trustworthy enough for future UI planning.
- Korri’s known-playable library model remains intact: external candidates and resolved artifacts do not become library entries without a later import/acquisition decision.
- Downstream planning can start from a confirmed keep/delete boundary instead of inventing migration scope.

---

## Scope Boundaries

- Importing Bazzar wholesale is out of scope.
- Keeping standalone `bazzar` as a public binary or product surface is out of scope.
- Importing Bazzar UI is out of scope.
- Importing Bazzar API code solely for compatibility, convenience, or because it exists is out of scope.
- Building the later Korri acquisition UI is out of scope.
- Building the later artifact-to-library import/acquisition flow is out of scope.
- Treating external Bazzar results as Korri known-playable library entries is out of scope.
- Permanently supporting old standalone Bazzar command compatibility is out of scope.
- Reorganizing unrelated Korri product/platform/theme code is out of scope.

---

## Key Decisions

- CLI subset first: The first Korri-native product value is replacing `bazzar <cmd>` with `korri bazzar <cmd>`; UI integration follows later.
- Inventory gate before import: A keep/delete classification is required so the migration does not accidentally preserve standalone-app baggage.
- No standalone public Bazzar after migration: Bazzar’s useful work becomes Korri acquisition capability rather than a second product identity inside the monorepo.
- Exclude current API by default: Bazzar’s documented API surface is dev/demo-oriented and not canonical; API code must prove Lattice/Korri alignment before it is imported.
- Preserve acquisition trust boundaries: Source candidates, download-resolution outcomes, and known-playable library records remain separate lifecycle stages.

---

## Dependencies / Assumptions

- The Bazzar core acquisition behavior can be separated from standalone CLI/package identity without losing the useful command workflows.
- The current Bazzar CLI command family is the right compatibility set for the first Korri subcommand surface.
- At least some Bazzar source-adapter and contract hardening work is worth salvaging rather than rewriting from scratch.
- Future UI work will be easier if the CLI subset first establishes a trustworthy Korri acquisition seam.
- The existing Korri CLI is the appropriate public operator surface for the first integration.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1, R2][Technical] What exact Bazzar inventory categories and evidence should planning require before classifying a module as import, adapt, defer, or delete?
- [Affects R4][Technical] Which current command flags and output modes are part of the required `korri bazzar` compatibility surface, and which can be intentionally simplified?
- [Affects R5, R7, R8][Technical] How should existing source-health and download-resolution contracts be adapted to Korri naming and runtime conventions while preserving parseable behavior?
- [Affects R10, R14][Needs research] Is any Bazzar API code actually Lattice-aligned enough to import, or should future API/UI work be rebuilt against Korri’s existing platform conventions?
- [Affects R15][Technical] What later acquisition/import flow should convert a resolved artifact into a known-playable Korri library entry?
