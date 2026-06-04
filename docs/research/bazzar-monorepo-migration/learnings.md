# Institutional Learnings: Bazzar → Korri Monorepo Migration

**Task:** Planning selective migration of Bazzar source-acquisition CLI/core into Korri monorepo as `korri bazzar <cmd>`, with inventory gate, no wholesale import, no standalone public Bazzar binary, no UI import, API excluded unless Lattice-aligned, and preservation of source-health/download-resolution trust boundaries.

---

## Search Context
- **Keywords used:** bazzar, LibrarySource, ContentSource, plugin-architecture, cli-surface, product/platform/theme, dependency direction, inventory gate, external candidates, download resolution, source health, repo reorg, monorepo migration, trust boundary
- **Files scanned:** 18 across `docs/solutions/`, `docs/brainstorms/`, `docs/plans/`, `docs/research/`
- **Relevant matches:** 11 files fully read

---

## Critical Patterns

`docs/solutions/patterns/critical-patterns.md` does not exist in this repo.

---

## Relevant Learnings

### 1. Plugin taxonomy defines where Bazzar's acquisition capability lands

- **File:** `docs/solutions/architecture-patterns/korri-plugin-architecture-2026-06-02.md`
- **Module:** `korri/plugins/` (future `@plugins/*`)
- **Problem Type:** `architecture_direction` (inferred from active architecture doc)
- **Relevance:** Defines the Playnite-shaped taxonomy — `ContentSource`, `MetadataProvider`, `GenericPlugin` — that Bazzar's acquisition core maps into. Also defines where plugin code lives, how the RPC namespace is structured, and what a plugin is NOT allowed to do.
- **Key Insight:**
  - Bazzar's acquisition CLI maps to a `ContentSource` + optional `GenericPlugin` (for `validate-sources` and `resolve-download` surfaces) in the plugin taxonomy. It does **not** inject into the home screen, does not own DOM or styling, and does not get an unconditional startup hook.
  - The first implementation slice introduces `ContentItem`, `ContentSourceService`, and `ContentSources` **alongside** existing `LibrarySource`. Existing `LibrarySource` call sites return `ResolvedGameRecord[]` until later slices generalize. The acquisition plugin returns source *candidates*, not library entries.
  - Plugin RPC namespace is `plugin.<id>.<action>` (e.g., `plugin.bazzar.search`, `plugin.bazzar.validate-sources`). Handler files live under the owning plugin directory only.
  - User-installed plugins live under `~/.config/korri/plugins/<id>` — outside the Nix closure. First-party plugin code lives under `korri/plugins/<id>/*`; the `@plugins/*` alias maps there.
  - Every plugin manifest must declare `inputContract: "gamepad-first"`. Plugin surfaces must pass the same Playwright spatial-navigation checks as first-party UI.

---

### 2. Product/platform architecture determines where `korri bazzar` CLI lives

- **File:** `docs/solutions/architecture-patterns/korri-product-platform-theme-architecture-2026-06-03.md`
- **Module:** `product/` top-level (proposed)
- **Problem Type:** `architecture_direction` (inferred; status: proposed)
- **Relevance:** This is the active architecture direction for the Korri monorepo. It specifies what belongs in `product/apps/cli` vs. `product/platform/` vs. `tools/`, and defines the hard import-direction rules that govern where migration code can live.
- **Key Insight:**
  - **`product/apps/cli`** is the right home for the public `korri bazzar` command group. It is a user/operator-facing surface, so it does not belong in `tools/` (developer-only, never delivered).
  - **`product/platform/protocol`** is the right home for any stable wire types or schemas shared between the CLI surface and a future Korri acquisition UI. It must be framework-neutral and must not depend on React.
  - **Hard import direction rule:**
    ```
    product/apps/cli      → product/platform/protocol   ✅
    product/platform      -X-> product/apps              ✗ forbidden
    tools                 -X-> shipped runtime dependency ✗ forbidden
    ```
  - Bazzar's acquisition CLI code — once migrated — is `product/apps/cli` code, not shared platform code. Any typed schemas it produces (source-health, download-resolution outcomes) that a future UI also needs should be declared in `product/platform/protocol` and imported by both the CLI and the future UI.
  - The current `tools/cli/korri-cli.ts` is expected to migrate into `product/apps/cli` under this architecture. Plan the Bazzar subcommand addition against the destination path, not the current `tools/cli` path.

---

### 3. LibrarySource boundary is strict — external candidates must not flow through it

- **File:** `docs/solutions/best-practices/product-owned-composition-keeps-shared-layers-reusable-2026-05-03.md`
- **File (existing synthesis):** `docs/research/bazzar-source-adapter-download-resolution/learnings.md` (learning 1, 2)
- **Module:** `korri/shared/library/library-source.ts`, `korri/shared/library/library-services.ts`
- **Problem Type:** `best_practice`
- **Relevance:** The `LibrarySource` seam is the hardest boundary in the Korri data model. This was already documented for the Bazzar hardening phase; it matters equally for the migration phase.
- **Key Insight:**
  - `LibrarySource` means *known-playable library content*. Bazzar search results, source candidates, and resolved download artifacts are **pre-library lifecycle stages**. They must never enter the `LibrarySource`/`Launcher` seams.
  - The correct future import shape — when it exists — is: Bazzar resolves artifact → importer writes Korri-owned ProseQL YAML (key-derived IDs per `proseql-canonical-library-with-derived-yaml-ids`) → `LibrarySource` reads the result. Bazzar does not write to the library directly.
  - Plan the Bazzar subcommand so that deleting `korri bazzar` and all migration code leaves the existing library, RPC, and launcher code paths **entirely unchanged**. This is the deletion test that proves the boundary is real.
  - The `ContentSource` generalization (`LibrarySource → ContentSource<GameItem>`) documented in the plugin architecture is the eventual migration path for the library seam, but it does not make Bazzar results into library entries.

---

### 4. Product-owned composition is the enforced pattern — migration code is product-owned

- **File:** `docs/solutions/best-practices/product-owned-composition-keeps-shared-layers-reusable-2026-05-03.md`
- **Module:** `korri/products/app/api/` (established pattern)
- **Problem Type:** `best_practice`
- **Relevance:** The migration will create files that wire acquisition CLI behavior to Korri's runtime. These are product-composition files, not shared infrastructure. The historical lesson is that shared-looking infrastructure that actually selects product endpoints or adapters belongs in product code.
- **Key Insight:**
  - Any file that chooses concrete Bazzar adapters, selects source plugins, or assembles the `korri bazzar` command tree is **product-owned** — it lives in `product/apps/cli/` or `korri/plugins/bazzar/`, not in `korri/shared/`.
  - Generic transport primitives (CLI output serialization helpers, typed health-state contracts, source-outcome schemas) that are not Bazzar-specific can live in `product/platform/protocol`.
  - Add a narrow executable boundary test at migration time: a scan confirming that `korri/shared/*` and `product/platform/*` do not import from the Bazzar plugin directory. Keep the shared/product boundary honest from day one.
  - `@plugins/*` (maps to `korri/plugins/*`) is the alias for plugin-layer code. The Bazzar acquisition plugin lives there, not under `@app/*` or `@shared/*`.

---

### 5. `ContentSource` generalization unlocks the plugin model — do not shortcut to `LibrarySource`

- **File:** `docs/research/plugin-architecture/synthesis-2026-05-31.md`
- **Module:** `korri/shared/library/library-services.ts`
- **Problem Type:** `architecture_direction` (inferred)
- **Relevance:** The plugin architecture research identifies `library-services.ts` as the deepest seam to generalize. The migration must not introduce any code that deepens the `LibrarySource`-as-only-source assumption.
- **Key Insight:**
  - The plugin system is already latent in the codebase as `librarySourceLayerAtom`, `launcherLayerAtom`, `foregroundSessionStatusLayerAtom`. These are plugin sockets — the lock-in is in the *types*, not the architecture.
  - The first structural move is `ContentSource` alongside `LibrarySource` (not replacing it). `LibrarySource` becomes `ContentSource<GameItem>`. This is a zero-behavior-change PR that must precede any Bazzar `ContentSource` layer being wired in.
  - The Bazzar acquisition plugin implements `ContentSourceService` returning **acquisition candidates** (tagged `AcquisitionItem` or similar), not `GameItem` values that would populate the library grid. The host routes acquisition-candidate intents to acquisition surfaces, not to the launcher.
  - Do not wire Bazzar source results into the home screen grid. Acquisition candidates live behind a separate library/switcher or plugin route surface; the home grid stays games-first.

---

### 6. CLI surface must use `effect/unstable/cli` — not Commander

- **File:** `docs/research/bazzar-source-adapter-download-resolution/learnings.md` (learning 6)
- **File (code):** `tools/cli/korri-cli.ts`
- **Module:** `tools/cli/` (current) → `product/apps/cli/` (target)
- **Problem Type:** `convention` (inferred)
- **Relevance:** The Korri CLI uses Effect's own CLI framework. Bazzar uses Commander. The migration must use Korri's convention, not import Bazzar's Commander structure.
- **Key Insight:**
  - `korri bazzar <cmd>` must be a `Command.make("bazzar", ...)` node composed with `Command.withSubcommands` and wired into the top-level `korriCommand`. Services are injected via `Layer.mergeAll` at `BunRuntime.runMain`.
  - The pattern is a thin command that delegates to an injected module: `Command.make("bazzar")` → module function that accepts injected `SourceAcquisition` service + IO → typed discriminated result → exit code mapping.
  - Bazzar's Commander CLI is internal to the Bazzar repo (if it remains separate) or converted to Effect CLI during migration. It does not appear in the Korri CLI surface.
  - Typed exit codes map acquisition outcome categories: `usage → 2`, `source-unavailable → partial`, `config-error → 5`, etc. The convention established in `tools/cli/stream-launch.ts` (`StreamLaunchFailureCategory → exitCode`) is the template.

---

### 7. Source-health and download-resolution outcomes must be explicit discriminated unions — not inferred heuristics

- **File:** `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`
- **File (existing):** `docs/research/bazzar-source-adapter-download-resolution/learnings.md` (learning 12, 13)
- **Module:** `korri/shared/library/config/`, acquisition plugin types
- **Problem Type:** `design_pattern`
- **Relevance:** Korri has burned three times on heuristic inference (`launchesNativeWaylandChild`, input-bus action source inference, focus-style inference). The same trap applies to source-health classification and download resolution: using `GameFile.format === "html"` to detect interstitials is exactly this anti-pattern.
- **Key Insight:**
  - Classify source health and download resolution as explicit typed discriminants at the seam where the adapter produces the outcome. The adapter that knows it returned an HTML interstitial should classify it as `{ status: "interstitial" }` — not leave the format field for callers to sniff.
  - The shape (already established in the Bazzar hardening docs) is:
    ```ts
    type SourceHealth = "healthy" | "degraded" | "unavailable" | "defective" | "config-error"
    type DownloadResolution = "final-artifact" | "interstitial" | "blocked" | "unsupported" | "source-defect" | "config-error"
    ```
  - When these outcome types move into Korri as the migration lands, they belong in `product/platform/protocol` (framework-neutral, wire-safe schema types), not in the plugin implementation directory.
  - Do not let any Korri code branch on `format === "html"`, URL patterns, or response size heuristics to determine finality. The adapter declares the outcome; the CLI presents it; future UI reads it.

---

### 8. Existing `SourceDiagnostic` model in Korri CLI is the right idiom for partial failures

- **File (code):** `tools/cli/source-aware-games.ts`
- **File (existing):** `docs/research/bazzar-source-adapter-download-resolution/learnings.md` (learning 5, 11)
- **Module:** `tools/cli/source-aware-games.ts`
- **Problem Type:** `convention` (inferred)
- **Relevance:** Korri already has the idiom for multi-source partial-failure results. The Bazzar migration must follow it, not invent a new shape.
- **Key Insight:**
  - `SourceDiagnostic` + `SourceAwareGamesResult` is the established shape: a result carrying both `entries` (successful items) and `diagnostics` (per-source typed failures). One failed source does not erase useful results from other sources.
  - The `korri bazzar validate-sources` command output should follow this pattern: JSON with per-source health outcomes, where a partial failure produces a non-zero exit code but still emits valid outcome data for healthy sources.
  - The `RemoteSourceStatus` discriminated union in `korri/products/app/stream/remote-stream-client.ts` is the sibling precedent for availability-state unions. Use these as templates when declaring acquisition-source health types.
  - Stdout/stderr discipline: contract output (JSON outcomes, health states) belongs on stdout; logs and diagnostics stay on stderr. The convention is already enforced in `foreground-session-status.ts`.

---

### 9. Nix packaging pattern for a new CLI binary — and nixpkgs alignment risk

- **File (code):** `nix/korri-cli.nix`
- **File:** `docs/solutions/tooling-decisions/align-flake-nixpkgs-to-downstream-pin-for-cache-coherence-2026-05-27.md`
- **File (existing):** `docs/research/bazzar-source-adapter-download-resolution/learnings.md` (learnings 8, 9)
- **Module:** `nix/`
- **Problem Type:** `tooling_decision`
- **Relevance:** Adding `korri bazzar` as a Nix-packaged CLI binary follows an established pattern. If Bazzar's code is migrated in-tree, it must use Korri's bun2nix pipeline. If Bazzar remains a separate repo temporarily, the nixpkgs channel mismatch is a concrete aarch64 build risk.
- **Key Insight:**
  - In-tree migration path: A new `nix/korri-bazzar.nix` derivation follows `nix/korri-cli.nix` exactly: `bun build --target=bun`, `makeWrapper`, smoke test in `installCheckPhase`. The `flake.nix` `apps` section exposes it. `just refresh-bun-deps` regenerates `nix/bun.nix` after any dependency additions.
  - Bazzar introduces new npm dependencies (`ky`, `cheerio`, `filtrex`, `bs58`) that do **not** exist in Korri today. These will expand the Nix closure. Plan a dependency audit at migration time: some of Bazzar's deps (`fastify`, `@trpc/server`, `@tanstack/query-core`) duplicate or conflict with Korri's existing stack. Import only the acquisition core dependencies, not the API server dependencies.
  - Bazzar uses Effect v3; Korri targets Effect v4. This is not a blocker for the CLI-first slice if the migrated code is wrapped rather than directly integrated as an Effect service — but any code that composes with Korri Effect layers must be migrated to v4 types.
  - If keeping Bazzar separate temporarily: `--override-input bazzar path:<local/bazzar>` for local dev; align `inputs.nixpkgs.url` to Korri's `nixos-25.11` pin before any aarch64 build gate.

---

### 10. The inventory gate pattern — classify before importing, not during

- **File:** `./work/01KT5CF934S7BZE95JHEHBSNBE-bazzar-monorepo-migration-korri-cli-acquisition/requirements.md`
- **File:** `./work/01KT07NV2TPVD8HCTMYQQVYYN1-feat-bazzar-source-validation/plan.md`
- **Module:** migration planning
- **Problem Type:** `convention` (inferred)
- **Relevance:** The brainstorm and plan documents already encode the inventory-gate principle as a first-class requirement. This section distills the categories and evidence expected.
- **Key Insight:**
  - The inventory must produce a per-module classification before any code moves: **import** (acquisition core, CLI commands, typed contracts), **adapt** (Effect v3 → v4, Commander → `effect/unstable/cli`, naming conventions), **defer** (future Korri acquisition UI surface), **delete** (standalone app identity, demo API, duplicate tooling, UI, compatibility shims).
  - Evidence required for `import`: the code directly supports a `korri bazzar` CLI command or a shared acquisition invariant. Existence in the Bazzar repo is not sufficient justification.
  - Evidence required for `adapt`: the code is useful but uses Bazzar-internal conventions (Commander, Effect v3, non-Lattice naming, Bazzar-branded error types). Adaptation cost must be bounded before committing.
  - Evidence required for `defer`: the code serves a real future need (acquisition UI, artifact import pipeline) but is not CLI-first. Mark with a deletion-oriented comment and a clear deferral gate.
  - Evidence required for `delete`: the code serves Bazzar's standalone product identity, demo API surfaces, or is a compatibility shim with no Korri alignment. Delete without replacement.
  - The existing Bazzar test suite is **not green** (58 failures at last count). The inventory gate must assess test health per module — do not import modules whose contract is demonstrably broken. Fix or exclude failing modules before they become Korri's problem.

---

## Recommendations

1. **Sequence correctly:** ContentSource generalization (`library-services.ts`) → plugin directory structure + `@plugins/*` alias → Bazzar acquisition plugin layer → `korri bazzar` CLI command surface. Do not wire the CLI before the plugin taxonomy and import-direction rules are in place.

2. **Use the plugin-architecture taxonomy:** Model the migrated acquisition capability as a `ContentSourceService` returning acquisition candidates (not `GameItem` values) and a `GenericPlugin` for the `validate-sources` / `resolve-download` surfaces. This determines where code lives, what RPC namespace it uses, and what it cannot touch.

3. **Respect the new product/platform/theme architecture:** `korri bazzar` CLI command group → `product/apps/cli/`. Typed outcome schemas (source-health, download-resolution) → `product/platform/protocol/`. Acquisition plugin implementation → `korri/plugins/bazzar/` via `@plugins/*`. Do not add to `tools/` or `korri/shared/`.

4. **Apply the inventory gate rigorously before code moves:** The 58 Bazzar test failures are a signal that the contract is not stable. Classify every failing test by module in the inventory; exclude any module with unresolved contract drift from the first import slice.

5. **Never let acquisition outcomes enter `LibrarySource`:** The deletion test proves this: after migration, `korri/shared/library/library-source.ts` and `korri/shared/library/library-services.ts` should have zero references to any Bazzar-migrated module.

6. **Use explicit discriminated types for all health and resolution outcomes:** Follow the established `SourceDiagnostic` / `RemoteSourceStatus` idioms. Retire any `format === "html"` heuristics. The outcome family must be declared in `product/platform/protocol` so a future acquisition UI can consume it without re-parsing CLI output.

7. **Audit Bazzar's npm dependencies before adding to `bun.lock`:** `fastify`, `@trpc/server`, `@tanstack/query-core`, and `cheerio` are the risk categories. Import only the deps needed by the acquisition core (source adapters, CLI contract types); exclude API server and UI deps entirely.

8. **Plan for Effect v3 → v4 adaptation as a first-class migration step:** Do not import Bazzar Effect v3 code and expect it to compose with Korri's v4 layers. The adaptation is mechanical but must be done before any code is wired into `Layer.mergeAll` at the Korri composition root.

9. **Add a Fallow boundary rule from day one:** Once `korri/plugins/bazzar/` exists, add a Fallow zone enforcing that `product/platform/` and `korri/shared/` do not import from it. Run `bun x fallow dead-code --format json` as part of the migration PR gate.

---

## Pre-existing learnings file

A prior research-phase learnings file exists at `docs/research/bazzar-source-adapter-download-resolution/learnings.md` covering Bazzar-side hardening constraints (16 learnings). The learnings above cover the Korri-side **migration** planning concerns; both files apply to this work. The prior file's learnings 1–5, 11–16 are directly applicable to migration planning as well and should be read alongside this document.
