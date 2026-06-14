## Project layout

- Product apps/services/platform/themes/vendor/systems: `product/*`
- Shared runtime capabilities: `product/platform/*`
- Repo tooling, generators, and test infrastructure: `tools/*`
- Distributable workspace packages, including Pi packages consumed from `.pi/settings.json`: `packages/*`

## Path aliases

- `@product/*` → `product/*`
- `@platform/*` → `product/platform/*`

Autonomous themes live under `product/themes/*`. They may use public platform APIs, but must not import `product/apps/*`, `product/services/*`, `product/systems/*`, or app internals.

## RPC conventions

RPC folders are organized by domain concept, not HTTP verb.

Single RPC:

```text
<feature-or-domain>/api/<concept>/
  rpc.ts
  rpc-handler.ts
```

Multi RPC:

```text
<feature-or-domain>/api/<concept>/
  get.rpc.ts
  get.rpc-handler.ts
  save.rpc.ts
  save.rpc-handler.ts
```

- Reuse helpers from `@platform/api/rpc/*` where possible.
- Typed errors come from `@platform/api/rpc/errors`.

## Feature gates

- Gate declarations live next to the feature in `gate.ts`.
- Regenerate the registry with `just generate-gates`.
- Use `<FeatureGate gate="..." current={...} next={...} />` for UI branching.
- Use `requireGate` or `branchOnGate` for API branching.
- Gates are temporary; remove when the feature ships.

## Spatial navigation

- The app must remain navigable via device-agnostic directional input and semantic action keys.
- Components stay native HTML (`button`, `a`, `input`, `[tabindex]`); do not import navigation libraries or focus hooks at the component level.
- Navigation-library and device-adapter code lives only under `product/platform/input/*` and `product/platform/browser/navigation/*`.
- Subscribe to semantic actions (`back`, `menu`, `options`, `confirm`, `direction`) with `useInputAction` from `@platform/react/input/use-input-action`. Do not reach into `window.__korriSpatialNav` from product code.
- Use LRUD's DOM hints (`lrud-container`, `lrud-ignore`, `data-block-exit`, `data-lrud-overlap-threshold`) when needed; do not create component-level navigation APIs.
- See `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` before changing the navigation architecture.

## Product documentation shape

- Job docs in `docs/jobs/*.md` with `id`, `title`, `status` frontmatter.
- Feature briefs at `product/apps/portal/features/<feature>/brief.md` with `id`, `title`, `status`, `jobs` frontmatter.
- BDD `.feature` files, flat `<name>.steps.ts` step bindings, and optional `<demo-name>.demo.yaml` storyboards colocated at `product/apps/portal/features/<feature>/e2e/`.
- Generated traceability index: `out/generated/feature-map/feature-map.json` via `just generate-feature-map`; validate with `just check-feature-map`.
- Generated BDD Playwright wrappers: `out/generated/bdd/playwright/`. Generated Argo demo adapters: `out/generated/bdd/argo/`. Both read-only; regenerate with `just generate-bdd`.
- See `tools/testing/bdd/AUTHORING.md` for the BDD authoring contract.

The `tools/feature-map-explorer/` app (run with `just dev-feature-map`) is the canonical UI for inspecting and editing the map locally. Dev-only — never bundled with `product/apps/*`.

## Institutional learnings

`docs/solutions/` holds documented solutions to past problems — bugs, reusable patterns, workflow learnings, and best-practice writeups — organized by category directories with YAML frontmatter (`module`, `tags`, `problem_type`) for search. Relevant when implementing, debugging, or making decisions in already-documented areas. Add or update solutions only when explicitly requested or as part of the compounding workflow.

## Tooling commands

```bash
just dev | just dev-web | just dev-api | just dev-playwright | just dev-storybook
just device-run | just device-print-run-command
just test-unit
just test-e2e
just format
just lint
just typecheck                # whole-repo only because of path aliases
just generate-gates
just generate-bdd
just generate-feature-map
```

## Rules of engagement

- Android is not a current target platform for Korri implementation work. Prototype client/device flows on Linux first unless the user explicitly reopens Android targeting.
- Do not hard-code ARM builder hosts in committed Korri tooling; builder selection belongs in local Nix configuration or ignored local env overrides.
- Never create documentation, report, or summary Markdown files unless explicitly requested.
- Read before you touch. Do not propose changes to code you have not read.
- Before changing code, read a nearby similar feature/domain first and follow the local pattern.
- Do exactly what was asked. No bonus refactors.

## Irreversible actions

Freely take local, reversible actions. Confirm first for:

- Destructive operations
- Visible shared-state changes
- Force pushes
- Dependency removals with unclear impact
