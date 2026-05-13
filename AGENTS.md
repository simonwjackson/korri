## Project layout

- Runtime app code: `korri/products/*`
- Shared runtime code: `korri/shared/*`
- Deployment/bootstrap entrypoints: `korri/deploy/*`
- Repo tooling, generators, and test infrastructure: `tools/*`
- Operational scripts: `scripts/*`

## Path aliases

- `@app/*` → `korri/products/app/*`
- `@shared/*` → `korri/shared/*`

The reusable shared layers covered by the no-product-imports rule include `korri/shared/themes/*` and `korri/shared/ui/*`. Pages and templates in `korri/shared/themes/*` compose Roots; the route in `korri/products/app/routes/*` is the composition root that picks one.

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

- Reuse helpers from `@shared/api/rpc/*` where possible.
- Typed errors come from `@shared/api/rpc/errors`.

## Feature gates

- Gate declarations live next to the feature in `gate.ts`.
- Regenerate the registry with `just generate-gates`.
- Use `<FeatureGate gate="..." current={...} next={...} />` for UI branching.
- Use `requireGate` or `branchOnGate` for API branching.
- Gates are temporary; remove when the feature ships.

## Spatial navigation

- The app must remain navigable via device-agnostic directional input and semantic action keys.
- Components stay native HTML (`button`, `a`, `input`, `[tabindex]`); do not import navigation libraries or focus hooks at the component level.
- Navigation-library and device-adapter code lives only under `korri/shared/input/*` and `korri/shared/navigation/*`.
- Subscribe to semantic actions (`back`, `menu`, `options`, `confirm`, `direction`) with `useInputAction` from `@shared/navigation/use-input-action`. Do not reach into `window.__korriSpatialNav` from product code.
- Use LRUD's DOM hints (`lrud-container`, `lrud-ignore`, `data-block-exit`, `data-lrud-overlap-threshold`) when needed; do not create component-level navigation APIs.
- See `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` before changing the navigation architecture.

## Product documentation shape

- Job docs in `docs/jobs/*.md` with `id`, `title`, `status` frontmatter.
- Feature briefs at `korri/products/app/features/<feature>/brief.md` with `id`, `title`, `status`, `jobs` frontmatter.
- BDD `.feature` files, flat `<name>.steps.ts` step bindings, and optional `<demo-name>.demo.yaml` storyboards colocated at `korri/products/app/features/<feature>/e2e/`.
- Generated traceability index: `out/generated/feature-map/feature-map.json` via `just generate-feature-map`; validate with `just check-feature-map`.
- Generated BDD Playwright wrappers: `out/generated/bdd/playwright/`. Generated Argo demo adapters: `out/generated/bdd/argo/`. Both read-only; regenerate with `just generate-bdd`.
- See `tools/testing/bdd/AUTHORING.md` for the BDD authoring contract.

The `tools/feature-map-explorer/` app (run with `just dev-feature-map`) is the canonical UI for inspecting and editing the map locally. Dev-only — never bundled with `korri/products/*`.

## Institutional learnings

`docs/solutions/` holds reusable patterns, post-mortems, and best-practice writeups. Read relevant entries before introducing or revising architecture in an already-documented area. Add or update solutions only when explicitly requested or as part of the compounding workflow.

## Tooling commands

```bash
just dev | just dev-web | just dev-api | just dev-playwright | just dev-storybook
just install-device | just sync-device | just dev-device | just check-device
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

- All ARM builds must use the host `fuji`.
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
