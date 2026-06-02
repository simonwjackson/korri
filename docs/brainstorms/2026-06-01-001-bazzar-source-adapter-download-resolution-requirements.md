---
date: 2026-06-01
topic: bazzar-source-adapter-download-resolution
---

# Bazzar Source Adapter and Download Resolution

## Summary

Define the hardening slice Bazzar needs before Korri depends on it: source adapters must have observable health, download resolution must distinguish final artifacts from interstitial or unsupported flows, and any future `korri bazzar` surface must start as a thin wrapper over a stable Bazzar contract.

---

## Problem Frame

Bazzar can already search several external game/archive sites and extract details for many results, but its current state is not safe to import directly into Korri. The repo is dirty, its test suite is failing, some behavior is prototype-grade, and source quirks leak through the current result shape.

The most important friction is that “details” and “downloadable artifact” are not the same thing. Some sources return a final archive URL, while others return an HTML handoff page, require additional resolution, fail behind an API key, or silently substitute fallback data. If Korri consumes that shape too early, it either inherits source-specific complexity or presents false confidence to the player/operator.

Korri already has a strong `LibrarySource` meaning: known playable library content. External discovery and artifact acquisition are earlier lifecycle stages than playable library membership, so the Bazzar boundary should not bend Korri’s library seam around provider quirks.

---

## Actors

- A1. Korri maintainer/operator: Wants to verify external source behavior and eventually use `korri bazzar` without trusting a brittle prototype.
- A2. Bazzar source adapter: Knows how to search, inspect, and resolve one external source while hiding source-specific mechanics.
- A3. Bazzar validation harness: Exercises adapters repeatably and reports source health, contract conformance, and download-resolution status.
- A4. Future Korri wrapper: A thin `korri bazzar` surface that delegates to a stable Bazzar contract when Korri is ready to consume it.
- A5. Korri library: The existing known-playable game library, which should only receive content after a later explicit import/acquisition flow.

---

## Key Flows

- F1. Validate source adapter health
  - **Trigger:** The maintainer wants to know whether a Bazzar source still works.
  - **Actors:** A1, A2, A3
  - **Steps:** The harness runs a bounded source check, records whether search and details behavior conform to the source contract, and reports typed health rather than relying on ad hoc manual inspection.
  - **Outcome:** The maintainer can see which sources are healthy, degraded, unsupported, or defective.
  - **Covered by:** R1, R2, R3, R8

- F2. Resolve a candidate download
  - **Trigger:** A search/detail result points at a candidate game/archive page.
  - **Actors:** A1, A2, A3
  - **Steps:** Bazzar asks the relevant adapter to resolve the candidate, distinguishes final artifact URLs from interstitial or blocked flows, and reports enough metadata to decide whether a real download is possible.
  - **Outcome:** Callers do not confuse a details page or HTML handoff with a downloadable artifact.
  - **Covered by:** R4, R5, R6, R7

- F3. Future Korri wrapper delegates to Bazzar
  - **Trigger:** Korri needs a `korri bazzar` command surface.
  - **Actors:** A1, A3, A4, A5
  - **Steps:** Korri invokes the stable Bazzar contract, presents Bazzar’s typed outcomes, and avoids duplicating Bazzar source code or treating unresolved external results as playable library entries.
  - **Outcome:** Korri gains a thin operator-facing bridge without absorbing Bazzar internals prematurely.
  - **Covered by:** R9, R10, R11, R12

---

## Requirements

**Source adapter health**

- R1. Bazzar must provide a repeatable validation path that checks each supported source adapter without requiring Korri to import Bazzar internals.
- R2. Source health must be reported with explicit states such as healthy, degraded, unsupported, unavailable, or defective; silent success fallbacks must not count as healthy behavior.
- R3. Adapter validation must cover at least search and details behavior for every source that Bazzar claims to support.
- R4. A source adapter must hide its source-specific mechanics behind a stable Bazzar-facing contract; callers should not need to know whether a source uses direct links, interstitial pages, timed handoffs, or API-backed metadata.

**Download resolution**

- R5. Bazzar must separate game/details lookup from download resolution. A details result may identify a candidate, but only a download-resolution result can claim that a final artifact is available.
- R6. Download resolution must classify outcomes explicitly: final artifact resolved, interstitial requires further handling, blocked/unavailable, unsupported by adapter, source defect, and caller/configuration error.
- R7. A resolved artifact must carry enough observable facts for safe downstream handling: source identity, candidate title, artifact name when known, artifact kind when known, size when known, and whether the URL is final or still provisional.
- R8. The validation path must include at least one known legal/free/homebrew/public-domain-style fixture or probe per source where such a probe is available, so health checks do not depend on arbitrary copyrighted examples.

**Korri boundary**

- R9. Bazzar should remain in its own repo during the hardening phase; Korri must not duplicate Bazzar source adapter code to get early access.
- R10. Any first `korri bazzar` integration must be a thin wrapper over Bazzar’s stable contract rather than a reimplementation of Bazzar source behavior inside Korri.
- R11. External Bazzar results must not enter Korri’s known-playable `LibrarySource` model merely because they were found or resolved. Only a later explicit import/acquisition flow may create playable library entries.
- R12. The Bazzar contract must be stable enough for Korri to consume through command output and exit status first; direct library imports are not required for the first integration.

**Failure and trust posture**

- R13. Bazzar must not mask live source failures with mock or fallback data in health checks, download resolution, or future Korri-facing command output.
- R14. Sources requiring credentials or API keys must report missing, rejected, or invalid configuration explicitly.
- R15. A failed source must not make the whole validation or search operation fail when other sources can still report useful outcomes.
- R16. Bazzar must make legal/safety posture visible enough that validation and examples can avoid relying on obviously copyrighted commercial downloads.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3, R15.** Given Bazzar has several source adapters and one source is temporarily unavailable, when the validation harness runs, the unavailable source is reported as unavailable or degraded while healthy sources still report their own results.
- AE2. **Covers R5, R6, R7.** Given a source details page returns an HTML download handoff rather than an archive URL, when download resolution runs, Bazzar reports an interstitial/provisional state instead of claiming a final artifact.
- AE3. **Covers R6, R13, R14.** Given an artwork or metadata source rejects its configured API key, when validation runs, Bazzar reports a configuration/auth failure and does not substitute mock success data.
- AE4. **Covers R8, R16.** Given a source has an available public-domain/homebrew/freeware-style candidate, when the validation harness exercises the source, it uses that candidate or records that no safe probe is available rather than defaulting to a commercial title.
- AE5. **Covers R9, R10, R11, R12.** Given Korri later exposes `korri bazzar`, when a user searches or resolves a candidate, Korri delegates to Bazzar’s stable contract and does not create a playable library entry until a separate import/acquisition flow exists.

---

## Success Criteria

- A maintainer can run one repeatable Bazzar validation path and see which source adapters are healthy, degraded, unsupported, unavailable, or defective.
- Download resolution no longer conflates details pages, source interstitials, and final downloadable artifacts.
- Future `korri bazzar` planning can depend on a small Bazzar contract instead of reverse-engineering current plugin internals.
- Korri’s existing `LibrarySource` meaning remains intact: known playable library content, not arbitrary external discovery results.
- Downstream planning can proceed without inventing source health states, download-resolution outcomes, or the transitional Korri/Bazzar repository boundary.

---

## Scope Boundaries

- Importing Bazzar wholesale into Korri is out of scope for this slice.
- Duplicating Bazzar source adapter code inside Korri is out of scope.
- Porting Bazzar’s UI or API service into Korri is out of scope.
- Making external Bazzar results appear as playable Korri library entries is out of scope.
- Building a full content import/acquisition flow is out of scope, though this work must leave room for one later.
- Permanent cross-repo architecture is out of scope; the separate-repo phase is transitional.
- SteamGridDB or artwork enrichment is not required for the first hardening pass.
- Solving the legal status of every external source is out of scope; the requirement is to avoid unsafe validation defaults and make uncertainty visible.

---

## Key Decisions

- Validation harness before Korri wrapper: Proving source behavior first prevents Korri from inheriting brittle adapter assumptions.
- CLI-shaped contract before library import: A stable command/output boundary preserves Bazzar’s repo independence and keeps the first Korri integration thin.
- Download resolution as a distinct seam: Details pages and final artifacts have different trust levels and must not share one ambiguous result shape.
- External discovery stays outside `LibrarySource`: Korri’s library remains the known-playable catalog; external candidates require a later explicit import/acquisition step.
- No silent fallback success: Mock data is useful in tests, but live health and future Korri-facing output must report real source status.

---

## Dependencies / Assumptions

- Bazzar can remain independently runnable with its own Nix/direnv/Bun environment during the hardening phase.
- Korri can later call a pinned Bazzar command or consume an equivalent stable contract without copying adapter code.
- At least some sources have legal/free/homebrew/public-domain-style candidates suitable for validation probes.
- Some source behavior will drift over time, so validation is an ongoing diagnostic capability rather than a one-time migration check.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1, R2][Technical] What exact command shape should Bazzar expose for source validation?
- [Affects R5, R6, R7][Technical] What exact output shape should represent download-resolution outcomes while remaining stable for a future Korri wrapper?
- [Affects R8, R16][Needs research] Which safe probe candidates should be used per source, and how should Bazzar record sources that have no known safe probe?
- [Affects R9, R10, R12][Technical] How should Korri pin or locate the external Bazzar command during the transitional separate-repo phase?
- [Affects R11][Technical] What later import/acquisition flow would convert a resolved artifact into a known playable Korri library entry?
