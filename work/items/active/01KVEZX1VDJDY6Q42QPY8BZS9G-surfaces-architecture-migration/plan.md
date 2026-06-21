---
title: "refactor: Migrate every human-facing interface to a surfaces architecture"
type: refactor
status: active
date: 2026-06-19
origin: work/items/active/01KVEZX1VDJDY6Q42QPY8BZS9G-surfaces-architecture-migration/item.md
verify_command: "just typecheck && just test-unit && just lint && just test-nix"
---

# Migrate every human-facing interface to a surfaces architecture

## Summary

Introduce **surface** as the canonical concept for every human-facing Korri
interface, replace the narrower "theme" framing at the boundary, and physically
relocate today's interfaces into `product/surfaces/<medium>/<name>`. After the
vocabulary and manifest contract are defined, each surface migrates as one atomic
change per surface — folder move, theme→surface rename, and its manifest authored
beside it, together — re-pointing every alias, registry, Nix source, and Tailwind
scan glob in the same commit. The three shipped web surfaces (shift, evier,
vigie), the CLI, and the pico prototype move this pass; the plain-demo theme is
dropped (its bridge contract test is preserved under platform). This plan
migrates surfaces only; the
backend/runtime/content plugin re-taxonomy and any new media
(framebuffer/ssh/native) are explicitly deferred.

---

## Problem Frame

Korri has outgrown "theme." Shift, Evier, Vigie, plain-demo, the CLI, and future
phone/TUI/framebuffer interfaces are all human-facing ways to present the same
Korri capabilities, but the tree calls the web ones "themes"
(`product/themes/*`) and treats the CLI as just another app
(`product/apps/cli`). There is no shared vocabulary, no manifest describing what
an interface is or what it may do, and no boundary preventing an interface from
quietly gaining backend authority. Before building radically different surfaces
(e.g. a single-game arcade cabinet that hides the library entirely), the project
needs one model: **surfaces present capabilities; plugins provide them; a host
runs them; a medium is what a surface is made of.**

---

## Requirements

- R1. Establish a typed, tested surface contract (`SurfaceManifest`) carrying `id`, `kind: "surface"`, `medium`, `consumes` (capabilities), `requires` (plugin refs), and `recommends` (plugin refs).
- R2. `medium` is the only runtime axis on a surface: `web | terminal | framebuffer | native | ssh`. No `form` field; interaction shape lives in the surface name.
- R3. Surfaces are not plugins. A surface manifest may reference plugins via `requires`/`recommends`, but may never reference another surface.
- R4. Every surviving human-facing interface (shift, evier, vigie, korri-cli, and the pico prototype) carries a surface manifest and is discoverable through one surface registry. The plain-demo theme is dropped (see Scope), with its bridge contract test preserved.
- R5. Relocate web surfaces to `product/surfaces/web/<name>` and the CLI to `product/surfaces/terminal/korri-cli`, preserving all runtime behavior.
- R6. The `KorriThemeEntrypoint` / theme-registry / ThemeHost boundary is renamed to surface vocabulary and **relocated to `product/platform/surface/`** (the mount contract) and **`product/platform/surface/host/`** (the host + dynamic-import registry), with `product/platform/theme/` deleted and all consumers updated.
- R7. Every reference to the moved paths is updated: TS imports, portal CSS imports, the portal surface registry, Storybook preview, Nix `sources.nix`, the portal Tailwind scan glob, and the rocknix build-performance check.
- R8. Repo boundary rules are updated and enforced: a surface must not import `product/apps/*`, `product/services/*`, `product/systems/*`, or another surface; surfaces may use public `@platform/*` contracts only.
- R9. Existing aliases (`@product`, `@platform`, `@tools`) are reused; no new alias is introduced.
- R10. `tools/theme-workshop` and Storybook remain development tools, not surfaces, and continue to render surfaces after the move.

---

## Scope Boundaries

- Not building any new medium implementation (framebuffer, ssh, native). Only the `web` and `terminal` media that exist today are exercised.
- Not building the capability resolver: `consumes`/`requires`/`recommends` are **labels only** — declared in manifests but not validated, enforced, resolved, or installed at runtime (no gating engine). Decided in challenge review.
- Not implementing LAN/KORRID serving of web surfaces, pairing, auth, or remote mutating-control security.
- Not introducing third-party / user-installed surface loading.
- Not moving `product/apps/portal` or `product/apps/desktop` into a `shells/` tree (they are runners/hosts, not surfaces — see Deferred).
- Not performing the backend/runtime/content plugin re-taxonomy or moving `product/plugins/*` (owned by existing plugin-system initiatives).
- Not building the Pac-Man cabinet or any concrete single-game surface; it is the motivating example only.
- Dropping the plain-demo theme rather than migrating it (challenge Q14); its bridge contract test is preserved under platform (challenge Q15), and its portal route `+demo-theme.tsx` is removed.

### Deferred to Follow-Up Work

- Introduce a flat `product/shells/*` tree and move `portal` + `desktop` runners into it: separate refactor; high blast radius; not a surface.
- Move Storybook from `product/apps/storybook` into `tools/`: dev-runner relocation, separate from surfaces.
- Build the capability/`requires`/`recommends` resolution + install/enable engine: depends on the plugin-system initiatives (`01KV8NZRAAETDX69P5T73BRVY8`, `01KVBE3W1NTB209YDWBPGC0DBV`).
- KORRID-served LAN web/phone surfaces + security model (Host-header validation, CORS posture, pairing tokens).
- New media: framebuffer launcher, SSH/TUI (Wish), native.
- Rename `product/themes`-era institutional docs and add a `docs/solutions` architecture writeup once the vocabulary is proven.

---

## Context & Research

### Relevant Code and Patterns

- `product/themes/{shift,evier,vigie}` — the shipped web surfaces that migrate; each exports an `entry` module and ships its own `*.css`. (`product/themes/plain-demo` is a React-free reference theme that is being dropped — see Scope; its `entry.test.ts` is the platform-bridge contract test and is preserved.)
- `product/apps/portal/prototypes/pico` — the pico prototype web surface; exports `picoConfig`, consumed only by the workshop.
- `product/apps/cli` — the terminal surface; consumes `KorriControlService`.
- `product/platform/control/*` — `KorriControlService` (`listGames`, `findGame`, `dryRunLaunch`, `launchGame`, `sessionStatus`, `stopSession`, `daemonStatus`, `streamRuntimeSettingsStatus`); the stable capability contract surfaces consume.
- `product/platform/theme/bridge.ts` — `KorriThemeEntrypoint`, `KorriThemeMountContext`, `KorriPlatformBridge`, `installKorriPlatformBridge`. The web mount contract to rename.
- `product/apps/portal/themes/{theme-registry.ts,ThemeHost.tsx}` (+ tests) — dynamic `import("@product/themes/<id>/entry")` registry and host.
- `tools/theme-workshop/themes.ts` — imports `picoConfig`; the only consumer of the pico prototype.

### Reference surfaces that break on a move (must update together)

- `product/apps/portal/main.tsx` — `import "@product/themes/{shift,evier,vigie}/…css"`.
- `product/apps/storybook/preview.tsx` — `import "@product/themes/shift/shift.css"`.
- `product/apps/portal/features/dual-screen/DualScreenRouteRoot.tsx` — multiple `@product/themes/shift/*` imports.
- `product/apps/portal/themes/theme-registry.ts` — dynamic imports per theme id.
- `product/systems/nixos/flake/sources.nix` — source roots include `../../../../product/themes`, `product/apps/portal`, `product/apps/cli`, `product/apps/desktop`.
- `product/apps/portal/package.nix` — Tailwind must scan the web-surface JSX explicitly (regression-guard comment at lines 92-93).
- `tools/testing/nix/korri-rocknix-build-performance-check.nix` — asserts `${runtimeSources.portal}/product/themes` exists.
- `AGENTS.md` — "Autonomous themes live under `product/themes/*` …" boundary rule.

### Institutional Learnings

- `docs/solutions/architecture-patterns/korri-product-platform-theme-architecture-2026-06-03.md` — `product/platform/*` is the stable host contract surfaces build against; this migration extends that framing from "themes" to "surfaces".
- `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md` — surface internals keep the established state-component pattern; the move must not regress it.

### External References

- None required: this is an internal reorganization over existing, well-patterned code. No new technology layer.

---

## Key Technical Decisions

- **Surfaces grouped by medium, addressed via the existing `@product` alias.** `product/surfaces/web/<name>`, `product/surfaces/terminal/<name>`. No new alias (R9); imports become `@product/surfaces/web/shift/...`.
- **`medium` only; no `form`.** Interaction shape (cli, tui, launcher, cabinet) is carried by the surface name and folder, not a manifest field (R2).
- **Surfaces are leaves.** The registry rejects any surface whose `requires`/`recommends` resolves to a `kind: "surface"`; reuse between surfaces happens through shared `@platform/*` libraries, never surface→surface deps (R3, R8).
- **Manifests declare; the fields are labels only (decided).** `consumes`/`requires`/`recommends` are honest, documentation-only metadata with **no enforcement and no install/gating logic** in this plan. The only structural rule the registry enforces is the leaf-only invariant (no surface→surface refs). A capability/requires resolver is owned by the plugin-system initiatives and is out of scope here.
- **Rename and move land together, one atomic change per surface (decided).** Per challenge review (Q1): a surface's folder move, the theme→surface rename (`KorriThemeEntrypoint`→`KorriSurfaceEntrypoint`, `theme-registry`→`surface-registry`, `ThemeHost`→`SurfaceHost`), and its manifest land in the same commit rather than split into a rename pass and a move pass. Bigger per-surface diffs, fewer half-states.
- **CLI and pico move this pass (decided).** Per challenge review (Q2, Q3): the CLI moves to `product/surfaces/terminal/korri-cli` and the pico prototype moves to `product/surfaces/web/pico` now, not deferred.
- **Manifest lives beside each surface (decided).** Per challenge review (Q4): each surface owns a `surface.ts` that travels with its folder; a central file only assembles the registry.
- **Land in one worktree, merge to trunk when complete (decided).** Per challenge review (Q6): no PRs and no stacked/per-surface review checkpoints — the whole migration is one worktree effort that returns to trunk when green. U-IDs order the commits; they are not separate deliverables.
- **Clean break, no compatibility shim (decided).** Per challenge review (Q7): rewrite every import and delete the old `product/themes` / `product/apps/cli` / prototype paths in place. Do not leave `@product/themes/*` re-export shims behind.
- **Plain surface ids; medium stays a field (decided).** Per challenge review (Q9): ids are `@korri:shift`, `@korri:evier`, `@korri:vigie`, `@korri:cli`, `@korri:pico` — medium is not encoded in the id. Rename only if one identity ever ships in two media.
- **Surface vocabulary + host live under platform/surface (decided).** Per challenge review (Q11, Q12): the mount contract (`bridge.ts`) moves to `product/platform/surface/`, and the host + dynamic-import registry move to `product/platform/surface/host/` (`SurfaceHost`, `surface-host-registry`) — web-surface mounting is a shared platform concern, not portal-internal. `product/platform/theme/` is deleted.
- **Keep the per-surface `entry` mount module name (decided).** Per challenge review (Q13): no rename to `surface-entry`; the folder path already identifies it as a surface.
- **Drop plain-demo; preserve its bridge contract test (decided).** Per challenge review (Q14, Q15): delete the plain-demo theme and its portal route `+demo-theme.tsx`; relocate its no-React mount/dispose characterization test to `product/platform/surface/` as the platform-bridge contract test so coverage survives.
- **Shells stay put for now.** `portal`/`desktop` remain under `product/apps` this pass; they are hosts/runners, not surfaces. A flat `product/shells/*` move is deferred.
- **Supersede the origin's "surfaces as plugins" framing.** The parking-lot briefing modeled surfaces as a plugin kind; the refined model makes surfaces a distinct category that *references* plugins. This plan is authoritative (see origin: work/items/active/01KVEZX1VDJDY6Q42QPY8BZS9G-surfaces-architecture-migration/item.md).

---

## Open Questions

### Resolved During Planning

- Do surfaces become a plugin kind? No — surfaces are a distinct category that may require/recommend plugins (R3).
- One axis or two (medium + form)? Medium only (R2).
- New alias for surfaces? No; reuse `@product` (R9).
- Move portal/desktop now? No; deferred as shells.
- Rename vs move ordering? Land together, one atomic change per surface (challenge Q1).
- Move the CLI now? Yes (challenge Q2).
- Move pico now? Yes (challenge Q3).
- Manifest location? Beside each surface; central file only assembles the registry (challenge Q4).
- Do consumes/requires/recommends do anything yet? No — labels only (challenge Q5).
- How does this land? One worktree, merged to trunk when done; no PRs (challenge Q6).
- Compatibility shim at old paths? No — clean break (challenge Q7).
- Capability vocabulary source? Hand-maintained string-literal union for now (challenge Q8).
- Encode medium in the surface id? No — plain ids (challenge Q9).
- Where is the surface boundary enforced? Both a bun test and Fallow zones (challenge Q10).
- Where do the surface host + dynamic-import registry live? `product/platform/surface/host/` — shared platform concern (challenge Q11).
- What happens to `product/platform/theme/bridge.ts`? Move it to `product/platform/surface/`; delete `product/platform/theme/` (challenge Q12).
- Rename the per-surface `entry` mount module? No — keep `entry` (challenge Q13).
- Migrate plain-demo? No — drop it (challenge Q14), preserving its bridge contract test (challenge Q15).

### Deferred to Implementation

- Exact capability vocabulary enum membership (`catalog.read`, `library.launch`, `session.read`, `session.stop`, `stream-control.read`, `stream-control.write`, `input.subscribe`): seed from `KorriControlService` method surface; finalize when authoring manifests. Labels only, so exact membership is low-risk.

---

## Output Structure

    product/
      platform/
        surface/
          surface-manifest.ts        # SurfaceManifest, SurfaceMedium, Capability, PluginRef
          surface-manifest.test.ts
          surface-registry.ts        # data registry: list/get + leaf-only (no surface refs) validation
          surface-registry.test.ts
          first-party-surfaces.ts    # assembles the registry from per-surface manifests
          bridge.ts                  # moved from platform/theme; KorriSurfaceEntrypoint mount contract
          bridge.test.ts             # preserved plain-demo no-React mount/dispose contract test
          host/
            SurfaceHost.tsx          # moved from portal/themes/ThemeHost.tsx
            surface-host-registry.ts # moved from portal/themes/theme-registry.ts (dynamic import per id)
        # product/platform/theme/ deleted
      surfaces/
        web/
          shift/                     # from product/themes/shift (+ surface.ts)
          evier/                     # from product/themes/evier (+ surface.ts)
          vigie/                     # from product/themes/vigie (+ surface.ts)
          pico/                      # from product/apps/portal/prototypes/pico (+ surface.ts)
        terminal/
          korri-cli/                 # from product/apps/cli (+ surface.ts)
        # plain-demo dropped
      apps/
        portal/                      # shell/runner (imports platform/surface/host)
        desktop/                     # shell/runner (unchanged location)
        storybook/                   # dev runner (unchanged location)

    tools/
      theme-workshop/                # dev tool (unchanged location)

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

Concept relationships:

```text
Host (device)
  runs Shell/runner (portal, desktop, terminal process)
    mounts Surface (presents capabilities)
      medium: web | terminal | framebuffer | native | ssh
      consumes: capabilities  ── provided by ──> Plugins (backend/runtime/content)
      requires/recommends: PluginRef[]           (never another Surface)
```

Manifest shape (directional):

```text
SurfaceManifest = {
  id: "@korri:<name>"
  kind: "surface"
  medium: SurfaceMedium            // web | terminal | framebuffer | native | ssh
  consumes: Capability[]           // e.g. catalog.read, library.launch
  requires: PluginRef[]            // plugin ids only
  recommends: PluginRef[]          // plugin ids only
}

PluginRef = `@korri:${string}`     // must resolve to kind:"plugin", never a surface
```

Registry invariant (the load-bearing rule):

```text
registerSurface(s):
  assert s.kind == "surface"
  for ref in [...s.requires, ...s.recommends]:
    assert ref is not a known surface id   // leaf-only; no surface→surface deps
```

---

## Implementation Units

### U1. Surface manifest + medium/capability contract

**Goal:** Create the typed, tested surface vocabulary with no behavior or folder changes.

**Requirements:** R1, R2, R3, R9

**Dependencies:** None

**Files:**
- Create: `product/platform/surface/surface-manifest.ts`
- Create: `product/platform/surface/surface-manifest.test.ts`

**Approach:**
- Define `SurfaceMedium = "web" | "terminal" | "framebuffer" | "native" | "ssh"`.
- Define `Capability` as a hand-maintained string-literal union seeded from `KorriControlService` method names (`catalog.read`, `library.launch`, `session.read`, `session.stop`, `stream-control.read`, `stream-control.write`, `input.subscribe`) — not derived from or coupled to the control contract; revisit when a resolver exists (challenge Q8).
- Define `PluginRef` as the `@korri:<name>` branded string and `SurfaceManifest` (`id`, `kind: "surface"`, `medium`, `consumes`, `requires`, `recommends`).
- Pure types + a small `defineSurface()` identity helper for inference; no React, no IO.
- `consumes`/`requires`/`recommends` are typed labels only — no semantic validation beyond array/string shape (labels-only decision).

**Patterns to follow:**
- `product/platform/control/control-requests.ts` / `control-results.ts` for plain typed contract modules under platform.

**Test scenarios:**
- Happy path: a well-formed manifest type-checks and round-trips through `defineSurface()` unchanged.
- Edge case: `requires`/`recommends` default to empty arrays when omitted.
- Edge case: medium union rejects an unknown medium at the type level (compile-time assertion via a typed fixture).

**Verification:**
- New types compile; unit tests pass; nothing outside `product/platform/surface/` changes.

---

### U2. Surface registry with leaf-only enforcement

**Goal:** Provide one registry that lists/gets surfaces and rejects surface→surface references.

**Requirements:** R3, R4, R8

**Dependencies:** U1

**Files:**
- Create: `product/platform/surface/surface-registry.ts`
- Create: `product/platform/surface/surface-registry.test.ts`

**Approach:**
- `createSurfaceRegistry(manifests)` indexes by id, exposes `list()` and `get(id)`.
- On registration, validate every `requires`/`recommends` ref is not a known surface id (leaf-only invariant). Surface a typed error otherwise.
- Keep it medium-agnostic data; no dynamic import wiring here (hosts own that).

**Patterns to follow:**
- `product/apps/portal/themes/theme-registry.ts` for registry shape (but data-first, not import-thunk-first).

**Test scenarios:**
- Happy path: registering backend/runtime/content plugin refs in `requires` succeeds; `list()`/`get()` return them.
- Error path: a manifest whose `requires` points at another registered surface id is rejected with a typed error.
- Edge case: duplicate surface ids are rejected.

**Verification:**
- Registry unit tests pass; the leaf-only rule is provable by test.

---

### U3. Migrate web surfaces: move + rename + manifests, together

**Goal:** Relocate shift/evier/vigie to `product/surfaces/web/*`, move the theme→surface boundary (mount contract + host + registry) into `product/platform/surface/`, drop plain-demo, and author each surviving surface's manifest beside it — one atomic change per surface (challenge Q1, Q11, Q12, Q14).

**Requirements:** R4, R5, R6, R7, R8, R9, R10

**Dependencies:** U1, U2

**Files:**
- Move: `product/themes/shift` → `product/surfaces/web/shift` (and evier, vigie)
- Create: `product/surfaces/web/<name>/surface.ts` per surface (manifest beside the surface — challenge Q4)
- Create: `product/platform/surface/first-party-surfaces.ts` (central file assembling the registry from per-surface manifests) + `first-party-surfaces.test.ts`
- Move+modify: `product/platform/theme/bridge.ts` → `product/platform/surface/bridge.ts` (`KorriThemeEntrypoint`→`KorriSurfaceEntrypoint`, `KorriThemeMountContext`→`KorriSurfaceMountContext`; keep `KorriPlatformBridge`); delete `product/platform/theme/` (challenge Q12)
- Move+modify: `product/apps/portal/themes/theme-registry.ts` → `product/platform/surface/host/surface-host-registry.ts` (`FirstPartyThemeId`→`FirstPartySurfaceId` = `shift|evier|vigie`, `loadThemeEntrypoint`→`loadSurfaceEntrypoint`, dynamic imports → `@product/surfaces/web/<id>/entry`) (challenge Q11)
- Move+modify: `product/apps/portal/themes/ThemeHost.tsx` → `product/platform/surface/host/SurfaceHost.tsx` (+ the two colocated tests) (challenge Q11)
- Create: `product/platform/surface/bridge.test.ts` (relocated plain-demo no-React mount/dispose contract test) (challenge Q15)
- Delete: `product/themes/plain-demo/` and `product/apps/portal/routes/+demo-theme.tsx` (challenge Q14)
- Modify: portal importers of `ThemeHost`/the registry (routes that mount surfaces) → import from `@platform/surface/host/*`
- Modify: `product/apps/portal/main.tsx` (CSS imports → `@product/surfaces/web/<name>/<name>.css`; shift/evier/vigie only)
- Modify: `product/apps/storybook/preview.tsx` (`@product/surfaces/web/shift/shift.css`)
- Modify: `product/apps/portal/features/dual-screen/DualScreenRouteRoot.tsx` (`@product/surfaces/web/shift/*`)
- Modify: `product/systems/nixos/flake/sources.nix` (`../../../../product/themes` → `product/surfaces/web`)
- Modify: `product/apps/portal/package.nix` (Tailwind scan glob → `product/surfaces/web`)
- Modify: `tools/testing/nix/korri-rocknix-build-performance-check.nix` (assert `…/product/surfaces/web`)
- Modify: `AGENTS.md` (boundary rule wording → surfaces; medium concept)

**Approach:**
- `git mv` each web surface to preserve history; rewrite `@product/themes/<name>` → `@product/surfaces/web/<name>` repo-wide (exclude `.worktrees/`). Clean break (challenge Q7): delete the old paths, leave no `@product/themes/*` re-export shim.
- Move the mount contract (`bridge.ts`) and the host + dynamic-import registry into `product/platform/surface/` and `product/platform/surface/host/` (challenge Q11, Q12); update portal routes to import the host from `@platform/surface/host`. Keep `entry` as the per-surface mount module name (challenge Q13); behavior unchanged.
- Drop plain-demo (challenge Q14): delete the theme and its `+demo-theme.tsx` route, remove it from `FirstPartySurfaceId`, and relocate its `entry.test.ts` into `product/platform/surface/bridge.test.ts` as the platform-bridge contract test (challenge Q15).
- Author each `surface.ts` (`medium: "web"`, `consumes` labels seeded from real usage, empty `requires`/`recommends`) and wire the central `first-party-surfaces.ts` registry over them.
- Update the Nix sources + Tailwind glob + rocknix check in the same commit so packaging and CSS purging never disagree.
- `@product` resolves the new path — only the path segment changes (R9).

**Execution note:** Characterization-first — run the existing ThemeHost/registry tests, keep them green through the move+rename; land as one coherent web batch so imports, Nix, and Tailwind stay consistent.

**Patterns to follow:**
- Existing `product/apps/portal/themes/theme-registry.ts` shape; `tools/theme-workshop/themes.ts` for the central registry-from-manifests pattern; the `product/themes` Tailwind regression-guard in `package.nix`.

**Test scenarios:**
- Happy path: relocated host/registry (`@platform/surface/host`) loads each `entry` id and returns a surface entrypoint (existing tests, moved + renamed).
- Happy path: the three web manifests register; `list()` returns them with `medium: "web"` and stable ids (`@korri:shift`, `@korri:evier`, `@korri:vigie`).
- Happy path: the relocated bridge contract test (`product/platform/surface/bridge.test.ts`) still proves a no-React mount consumes library+input and disposes cleanly.
- Edge case: `+demo-theme.tsx` is gone and `FirstPartySurfaceId` no longer includes `plain-demo`.
- Edge case: registry build passes the leaf-only invariant (no surface references a surface).
- Error path: unknown surface id throws (preserved host-registry behavior).
- Integration: `just typecheck` resolves all `@product/surfaces/web/*` imports with no dangling `@product/themes/*`; portal dev build renders shift/evier/vigie with correct styling (no purged classes); `just test-nix` green incl. the rocknix check at the new path.

**Verification:**
- No remaining `@product/themes` / `product/themes` references (outside `.worktrees/`); portal + storybook build; renamed host/registry tests green; Nix checks green.

---

### U4. Migrate the CLI: move + manifest, together

**Goal:** Relocate the terminal surface to `product/surfaces/terminal/korri-cli` with its manifest, zero behavior change (challenge Q2).

**Requirements:** R4, R5, R7, R9

**Dependencies:** U1, U2, U3

**Files:**
- Move: `product/apps/cli` → `product/surfaces/terminal/korri-cli`
- Create: `product/surfaces/terminal/korri-cli/surface.ts` (`medium: "terminal"`, `consumes`: `catalog.read`, `library.launch`, `session.read`, `session.stop`, `stream-control.read`)
- Modify: `product/platform/surface/first-party-surfaces.ts` (register `@korri:cli`)
- Modify: `product/systems/nixos/flake/sources.nix` (`product/apps/cli` roots → `product/surfaces/terminal/korri-cli`)
- Modify: any `@product/apps/cli/*` importers and CLI test paths
- Modify: `justfile` / `electrobun.config.ts` only if they reference the CLI path (verify during implementation)

**Approach:**
- `git mv` the folder; rewrite `@product/apps/cli` → `@product/surfaces/terminal/korri-cli`.
- The CLI already consumes `KorriControlService`; the capability contract is unchanged.
- Confirm the Nix `cli` source root and device-runtime composition still resolve.

**Execution note:** Characterization-first — run the CLI unit tests before and after the move; they must stay green.

**Patterns to follow:**
- `product/systems/nixos/flake/sources.nix` existing `cli = mkSource(...)` shape.

**Test scenarios:**
- Happy path: `korri play` / stream-launch command parsing tests pass from the new path.
- Happy path: `@korri:cli` registers with `medium: "terminal"` and the seeded `consumes` labels.
- Integration: Nix `cli` source builds; device-runtime composition still references a valid path.

**Verification:**
- CLI tests green from new location; `just test-nix` green; no dangling `@product/apps/cli` references.

---

### U5. Migrate the pico prototype: move + manifest, together

**Goal:** Relocate pico to `product/surfaces/web/pico` with its manifest (challenge Q3 — move now, not deferred).

**Requirements:** R4, R5, R7

**Dependencies:** U3

**Files:**
- Move: `product/apps/portal/prototypes/pico` → `product/surfaces/web/pico`
- Create: `product/surfaces/web/pico/surface.ts` (`medium: "web"`)
- Modify: `product/platform/surface/first-party-surfaces.ts` (register `@korri:pico`)
- Modify: `tools/theme-workshop/themes.ts` (`@product/apps/portal/prototypes/pico/config` → `@product/surfaces/web/pico/config`)
- Modify: pico-internal references that hard-code the prototype path (comments/doc strings only)

**Approach:**
- Mechanical move (only the workshop imports pico); rewrite the single workshop import and any internal path strings.
- Pico keeps its throwaway status; relocating it now keeps the surfaces tree uniform without changing pico behavior.

**Execution note:** Land after U3 so the web-surface conventions are settled; lowest risk of the moves (single external importer).

**Patterns to follow:**
- U3 import-rewrite approach.

**Test scenarios:**
- Happy path: `@korri:pico` registers with `medium: "web"`.
- Test expectation otherwise: none — prototype relocation with no behavioral change; verified by the workshop building and `product/surfaces/web/pico/screens/PicoDataState.test.ts` passing from the new path.

**Verification:**
- `just dev-theme-workshop` resolves `picoConfig`; pico unit tests pass from the new path; no dangling prototype-path imports.

---

### U6. Enforce surface boundaries and update docs

**Goal:** Make the model self-defending and documented.

**Requirements:** R8, R10

**Dependencies:** U3, U4, U5

**Files:**
- Create: `tools/testing/standards/surface-boundaries.test.ts`
- Modify: Fallow boundary/zone config (add `product/surfaces/*` zones; surfaces may import `@platform/*` only)
- Modify: `AGENTS.md` (surfaces vocabulary: medium, host vs surface, plugins-not-surfaces, boundary rule)

**Approach:**
- Enforce the rule in **both** places (challenge Q10): a bun test and Fallow zones.
- Boundary test asserts: files under `product/surfaces/**` do not import `@product/apps/*`, `@product/services/*`, `@product/systems/*`, or another surface; only `@platform/*` and intra-surface relatives are allowed.
- Fallow zones encode the same rule for ongoing drift detection via `fallow audit`; run `fallow list --boundaries` to confirm zones match real files.
- Mirror the existing autonomous-theme boundary intent, generalized to surfaces (medium-first).
- Update `AGENTS.md` so the "Autonomous themes live under `product/themes/*`" rule becomes "Autonomous surfaces live under `product/surfaces/<medium>/*`".

**Patterns to follow:**
- `product/platform/control/boundary.test.ts` and `tools/testing/standards/*` for boundary-test style.

**Test scenarios:**
- Happy path: current surfaces pass the boundary test.
- Error path: a synthetic fixture importing `@product/apps/*` from a surface fails the test.
- Error path: a synthetic surface manifest referencing another surface fails (reuses U2 invariant).

**Verification:**
- Boundary test green for real surfaces and red for the synthetic violations; `fallow list --boundaries` shows the new `product/surfaces/*` zones and `fallow audit` is clean; `AGENTS.md` reflects the new model.

---

## System-Wide Impact

- **Interaction graph:** The relocated platform host (`@platform/surface/host` `SurfaceHost` + dynamic-import registry), portal routes that mount it, Storybook preview CSS, dual-screen route imports, theme-workshop config import, and Nix source composition all reference moved paths and must move together. Dropping plain-demo also removes the `+demo-theme.tsx` route.
- **Error propagation:** Renames must preserve the existing "unknown surface id throws" behavior in the host registry.
- **State lifecycle risks:** None at runtime; the risk is build-time — a missed Tailwind glob silently purges surface CSS, and a missed Nix source path breaks image composition.
- **API surface parity:** The relocated web mount contract (`product/platform/surface/bridge.ts`) and both registries — the platform data registry (`surface-registry.ts`) and the platform host import registry (`surface-host-registry.ts`) — express the same surface concept; keep them consistent. Portal now imports the host from `@platform/surface/host`.
- **Integration coverage:** `just test-nix` (sources + rocknix build-performance check) is the cross-layer proof that packaging still sees the surfaces; unit tests alone will not catch a stale Nix path.
- **Unchanged invariants:** `KorriControlService`, `KorriPlatformBridge` shape, aliases (`@product`/`@platform`/`@tools`), portal/desktop locations, and all surface *behavior* are explicitly unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Tailwind scan glob not updated after the move → purged surface CSS | Update `product/apps/portal/package.nix` glob in the same commit as the U3 web move; visually verify shift/evier render. |
| Stale Nix source path in `sources.nix` → broken image build | Update sources + run `just test-nix` as U3/U4 verification. |
| Worktree/`.worktrees` copies create misleading grep hits | Scope all rewrites and audits to the main tree; exclude `.worktrees/`. |
| Whole-repo `just typecheck` already fails on unrelated pre-existing drift | Work from a clean worktree off `HEAD`; judge success by *new* surface-path resolution, not the pre-existing failures. |
| Rename + move land together (challenge Q1) → large per-surface diff | Accepted trade-off: keep each surface's move atomic, lean on characterization tests (host/registry green through the rename) and the `just typecheck`/`test-nix` gates rather than splitting into half-states. |
| Origin briefing contradicts refined model ("surfaces as plugins") | Plan explicitly supersedes it; `item.md` retained as history only. |

---

## Documentation / Operational Notes

- Update `AGENTS.md` surfaces vocabulary and boundary rule (U6).
- Defer a full `docs/solutions/architecture-patterns/*` surfaces writeup until the vocabulary is proven post-migration (Scope: Deferred).
- No runtime/rollout/monitoring impact; this is a source reorganization behind unchanged contracts.
- Landing (challenge Q6): the entire migration runs in one dedicated worktree and merges back to trunk only when all units are green. No PRs, no stacked/per-surface checkpoints; do not partially land the rename/move on trunk.

---

## Sources & References

- **Origin briefing:** work/items/active/01KVEZX1VDJDY6Q42QPY8BZS9G-surfaces-architecture-migration/item.md
- Capability contract: product/platform/control/korri-control.ts
- Web mount contract: product/platform/theme/bridge.ts
- Host registry: product/apps/portal/themes/theme-registry.ts
- Nix sources: product/systems/nixos/flake/sources.nix
- Tailwind scan guard: product/apps/portal/package.nix
- Related initiatives (plugin re-taxonomy, deferred): work/items/active/01KV8NZRAAETDX69P5T73BRVY8-first-party-plugin-system-shape, work/items/active/01KVBE3W1NTB209YDWBPGC0DBV-plugin-descriptor-sketch-alignment
- Architecture pattern: docs/solutions/architecture-patterns/korri-product-platform-theme-architecture-2026-06-03.md
