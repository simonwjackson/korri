---
title: "refactor: Consolidate itch.io storefront into its plugin folder"
type: refactor
status: active
date: 2026-07-03
verify_command: "just typecheck && just test-unit"
---

# refactor: Consolidate itch.io storefront into its plugin folder

## Summary

Move the itch.io acquisition implementation out of `product/platform/acquisition/plugins/itchio.ts` (and its test) into the existing `@korri:itchio` plugin folder, repoint the plugin's thin wrapper to the relocated code, and strip the last itch.io references from generic platform tests. This finishes the plugins-catalog split (`work/items/active/01KWN2A0P7Q3R5S8T0V2W4X6YZ-plugins-catalog-split`) for the one storefront whose brains still live in platform. No behavior changes — the live acquisition path already runs through the plugin's handlers.

---

## Problem Frame

The plugins-catalog work made `@korri:itchio` a folder plugin, but only the descriptor moved. The actual storefront logic — search, provider validation, download resolution, artifact acquisition, and itch.io URL parsing, ~2,300 lines — still sits in `product/platform/acquisition/plugins/itchio.ts`. To understand or change itch.io you bounce between the catalog folder (the `plugin(...)` descriptor + handler wiring) and platform (the implementation). Platform, a generic layer, hosts one concrete storefront next to the generic registry it plugs into. The generic acquisition-plugin *registry* legitimately belongs in platform; the itch.io-specific implementation does not.

---

## Requirements

- R1. The itch.io acquisition implementation (`createItchioPluginDefinition`, `parseItchioCandidateUrl`, and any eager instance) lives under `product/plugins/itchio/`, not under `product/platform/`.
- R2. The generic acquisition-plugin registry machinery (`registry.ts`: `AcquisitionPluginDefinition`, `createAcquisitionPluginRegistry`, `selectAcquisitionPlugins`) stays in platform and is consumed by the itch.io plugin via a `@platform/acquisition/*` alias.
- R3. No itch.io-specific identifiers remain in generic platform code or generic platform tests after the move.
- R4. Behavior is unchanged: the live acquisition path (portal + CLI, through the plugin-host registry and product-plugin adapter) resolves and runs itch.io exactly as before; itch.io's own tests pass in their new home.
- R5. The whole-repo verification baseline is preserved — no new `just typecheck` errors and no new `just test-unit` failures beyond the repo's known pre-existing set.

---

## Scope Boundaries

- Not changing itch.io acquisition behavior, protocol, argv/env, or the handler contract in `product/plugins/itchio/index.ts` — this is a relocation, not a redesign.
- Not restructuring the plugin descriptor: `index.ts` remains the `plugin(...)` descriptor; the moved implementation becomes a `src/` feature module. Full alignment to the AGENTS `src/plugin.ts` descriptor convention is out of scope.
- Not touching the vendored/generic acquisition machinery beyond the one relocation and consequent import updates (`plugin-loader.ts`, `product-plugin-adapter.ts`, `download-resolution/`, `errors.ts`, `plugin-runtime.ts` stay put).
- Not migrating the `itchioParser` helper in `product/platform/plugin/community-source.ts`. It parses `creator.itch.io` community-source URLs for community-catalog plugins and is not part of the itch.io *storefront* plugin. See Deferred to Follow-Up Work.

### Deferred to Follow-Up Work

- Rename/relocate `product/platform/acquisition/plugins/registry.ts` (a `plugins/` directory containing no plugins after the move reads oddly — e.g. `product/platform/acquisition/plugin-registry.ts`): separate low-value churn touching several importers; do only if a future change already edits those importers.
- Evaluate whether `itchioParser` in `community-source.ts` should become itch.io-plugin-owned or a neutral community-source URL utility.
- Optional descriptor-convention alignment (thin `index.ts` re-export + `src/plugin.ts` descriptor) per `product/plugins/AGENTS.md`.

---

## Context & Research

### Relevant Code and Patterns

- `product/platform/acquisition/plugins/itchio.ts` — the ~2,300-line implementation to move. Exports `createItchioPluginDefinition`, `itchioPluginDefinition` (eager instance), `parseItchioCandidateUrl`.
- `product/platform/acquisition/plugins/itchio.test.ts` — itch.io's own test; travels with the implementation.
- `product/platform/acquisition/plugins/registry.ts` — generic registry (`AcquisitionPluginDefinition` interface, `createAcquisitionPluginRegistry`, `selectAcquisitionPlugins`). Stays in platform; imported by `itchio.ts`, `itchio.test.ts`, `plugin-loader.ts`, and other acquisition modules.
- `product/plugins/itchio/index.ts` — the `@korri:itchio` descriptor + handler wiring. Currently imports `createItchioPluginDefinition` from `@platform/acquisition/plugins/itchio`; will import it locally after the move. Already declares `module: "product/plugins/itchio"`.
- `product/plugins/smwcentral/src/{plugin.ts,plugin.test.ts}` — reference for the `src/` layout inside a plugin folder.
- itch.io's cross-module deps (all generic, stay in platform; relative paths become aliases after the move):
  - `../download-resolution/url-policy` → `@platform/acquisition/download-resolution/url-policy` (value: `validateOutboundHttpUrl`)
  - `../errors` → `@platform/acquisition/errors` (value: `AcquisitionError`)
  - `../plugin-runtime` → `@platform/acquisition/plugin-runtime` (type: `AcquisitionPluginContext`)
  - `./registry` → `@platform/acquisition/plugins/registry` (type: `AcquisitionPluginDefinition`)
  - test-only: `../artifact-acquisition` → `@platform/acquisition/artifact-acquisition` (value: `acquireArtifact`)

### Institutional Learnings

- Prior split (`work/items/active/01KWN2A0P7Q3R5S8T0V2W4X6YZ-plugins-catalog-split/plan.md`) established: import consumed-by-subpath via `@platform/*`/`@product/*` aliases; keep a plugin's own test with it; preserve the whole-repo typecheck/test baseline rather than chasing pre-existing failures.
- `product/plugins/AGENTS.md`: `product/plugins/` is a pure plugin catalog; `index.ts` is a thin public surface; feature code lives under `src/`.

### External References

- None — internal relocation following established repo conventions.

---

## Key Technical Decisions

- **Move the implementation to `product/plugins/itchio/src/definition.ts` (+ `src/definition.test.ts`), keep `index.ts` as the descriptor.** The moved file is the acquisition *provider definition*, not the `plugin(...)` descriptor (which stays in `index.ts`). Naming it `definition.ts` rather than `plugin.ts` avoids implying it holds the descriptor. Minimal churn; honors the catalog convention that feature code lives under `src/`.
- **The generic registry stays in platform; itch.io consumes it by alias.** `registry.ts` is the socket every acquisition source plugs into and has multiple platform consumers — moving it would be wrong and high-churn. itch.io imports `AcquisitionPluginDefinition` via `@platform/acquisition/plugins/registry`, exactly as other plugins import platform contracts.
- **Neutralize itch.io references in generic platform tests rather than repointing them.** `schemas.test.ts` and `acquisition-service.test.ts` reference `@korri:itchio` / `itch.io` / `product/platform/acquisition/plugins/itchio` only as **string fixtures** (no code import); the `module:` path is already stale vs the plugin's declared `product/plugins/itchio`. These are generic schema/registry round-trip tests, so a neutral fake provider fixture (e.g. `@korri:example` / `product/plugins/example`) preserves the tests' intent while removing platform's knowledge of a specific storefront (satisfies R3). Confirmed safe: `provider-ids.ts` is dynamic and hardcodes no itch.io id.

---

## Open Questions

### Resolved During Planning

- Do the two platform tests import itch.io code? — No. They use itch.io only as literal fixture strings; there is no module coupling to break, only fixtures to neutralize.
- Does the generic acquisition registry need to move too? — No. It is generic machinery with multiple platform consumers; it stays in platform (R2).
- Is the itch.io provider id hardcoded anywhere generic (e.g. `provider-ids.ts`)? — No; provider ids are validated dynamically against the live registry.

### Deferred to Implementation

- Whether the eager `itchioPluginDefinition` export is still referenced anywhere after the move, or is dead and can be dropped — confirm during U1 via a reference sweep; keep it (relocated) if any non-test consumer remains, remove it if unused.
- Exact neutral fixture id/module string to use in the platform tests — pick a value already treated as generic in those suites, or a clearly-fake `@korri:example`; decided when editing the tests.

---

## Implementation Units

### U1. Relocate the itch.io implementation into its plugin folder

**Goal:** Move `itchio.ts` and `itchio.test.ts` into `product/plugins/itchio/src/`, rewrite their cross-module imports to `@platform/acquisition/*` aliases, and repoint the plugin wrapper — all as one atomic, build-consistent change.

**Requirements:** R1, R2, R4, R5

**Dependencies:** None

**Files:**
- Move: `product/platform/acquisition/plugins/itchio.ts` → `product/plugins/itchio/src/definition.ts`
- Move: `product/platform/acquisition/plugins/itchio.test.ts` → `product/plugins/itchio/src/definition.test.ts`
- Modify: `product/plugins/itchio/index.ts` (import `createItchioPluginDefinition` from `./src/definition` instead of `@platform/acquisition/plugins/itchio`)
- Modify (relocated file internals): rewrite `../download-resolution/url-policy`, `../errors`, `../plugin-runtime`, `./registry` to their `@platform/acquisition/*` aliases
- Modify (relocated test internals): rewrite `../artifact-acquisition` and `./registry` to `@platform/acquisition/*` aliases; `./itchio` → `./definition`
- Test: `product/plugins/itchio/src/definition.test.ts` (relocated; must pass in new home)

**Approach:**
- Use `git mv` so history follows the files.
- The move + all import repoints (relocated file, relocated test, wrapper) must land together; an intermediate state where `index.ts` still points at the platform path while the file is gone will not typecheck.
- After moving, `product/platform/acquisition/plugins/` should contain only `registry.ts`.
- Sweep for consumers of the eager `itchioPluginDefinition` and `parseItchioCandidateUrl` exports; if the only references are the wrapper and the relocated test, they travel cleanly. Drop `itchioPluginDefinition` only if the sweep shows it is unused anywhere (see Deferred to Implementation).
- The relocated file now sits in `product/` importing `@platform/*` (product→platform, allowed); no architecture-guard exemption is needed.

**Patterns to follow:**
- `product/plugins/smwcentral/src/` layout (feature module + test under `src/`, descriptor in the plugin root).
- Alias-import conventions from the plugins-catalog split plan.

**Test scenarios:**
- Happy path: relocated `definition.test.ts` runs from its new path and passes unchanged (search, parse-url, validate, resolve-download, acquire coverage it already carries).
- Integration: the `@korri:itchio` plugin still resolves through the plugin-host registry — run the plugin-host + registry suites (`product/plugin-host/`, `product/platform/plugin/registry.test.ts`) and confirm `@korri:itchio` is present with its handler set intact.
- Regression: `just typecheck` shows no new errors vs the current repo baseline; no dangling references to `@platform/acquisition/plugins/itchio` remain anywhere (`product`, `tools`).

**Verification:**
- `product/platform/acquisition/plugins/` contains only `registry.ts`.
- No source or test references `@platform/acquisition/plugins/itchio`.
- itch.io acquisition tests pass from `product/plugins/itchio/src/`.

---

### U2. Neutralize itch.io references in generic platform tests

**Goal:** Remove the residual itch.io fixture strings from generic platform acquisition tests so platform no longer encodes knowledge of a specific storefront.

**Requirements:** R3, R5

**Dependencies:** U1

**Files:**
- Modify: `product/platform/protocol/acquisition/schemas.test.ts`
- Modify: `product/platform/acquisition/acquisition-service.test.ts`

**Approach:**
- Replace `@korri:itchio` / `itch.io` / `product/platform/acquisition/plugins/itchio` fixture literals with a neutral provider fixture (e.g. `@korri:example`, display name `Example`, module `product/plugins/example`), preserving each test's structure and assertions (schema round-trip, provider-id normalization incl. the bare-id and trimming cases, registry selection).
- Keep the tests' intent identical — they validate generic schema/registry behavior; only the example provider identity changes.
- Confirm no remaining itch.io identifier exists under `product/platform/` after this unit (grep gate).

**Patterns to follow:**
- Existing fixture construction already present in both test files (reuse their provider-record shapes; swap only the identity strings).

**Test scenarios:**
- Happy path: both suites pass with the neutral fixture (schema encode/decode round-trip; `validateKnownProviderId` accepts the trimmed/namespaced form and the bare local id, rejects a malformed id).
- Regression: a case-insensitive grep for `itchio`/`itch.io` under `product/platform/` returns nothing (community-source's `itchioParser` is out of scope and, if matched, is explicitly excluded/annotated).

**Verification:**
- No itch.io identifiers remain in generic platform code or tests (excluding the deferred `community-source.ts` helper).
- `just test-unit` shows no new failures vs baseline for the two suites.

---

## System-Wide Impact

- **Interaction graph:** Live itch.io acquisition flows through `product/plugin-host/acquisition.ts` → `product-plugin-adapter.ts` → the `@korri:itchio` plugin handlers, which call `createItchioPluginDefinition`. Only the *definition's file location* changes; the call graph is untouched.
- **Error propagation:** Unchanged — `AcquisitionError` and URL-policy validation are still imported from the same platform modules, now via alias.
- **API surface parity:** Other acquisition-source plugins (smwcentral, community-catalog, etc.) already consume `@platform/acquisition/*` by alias; itch.io simply joins that shape. No parity change required elsewhere.
- **Unchanged invariants:** The `@korri:itchio` descriptor, provider id, handler operations, and config contributions in `index.ts` are unchanged. The generic acquisition registry contract is unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Intermediate non-building state if the move and import repoints are split | Land U1 as one atomic change (move + all import updates + wrapper repoint) before running verification. |
| A hidden non-test consumer of the eager `itchioPluginDefinition`/`parseItchioCandidateUrl` export breaks | Reference-sweep in U1 before removing anything; relocate rather than delete when any consumer remains. |
| Neutralizing platform test fixtures accidentally changes what a generic test asserts | Swap only the provider identity strings; preserve every assertion and structure; run both suites to confirm green. |
| Repo already carries pre-existing typecheck/test failures | Compare against the established baseline (no *new* failures), consistent with the plugins-catalog split's verification approach. |

---

## Sources & References

- Related initiative: `work/items/active/01KWN2A0P7Q3R5S8T0V2W4X6YZ-plugins-catalog-split/plan.md` (this cleanup finishes its itch.io thread)
- Catalog authoring guide: `product/plugins/AGENTS.md`
- Relocated implementation: `product/platform/acquisition/plugins/itchio.ts`
- Plugin wrapper: `product/plugins/itchio/index.ts`
- Generic registry (stays in platform): `product/platform/acquisition/plugins/registry.ts`
