# BDD Authoring Guide

## Layout

```
product/apps/<app>/features/<feature>/e2e/
├── <name>.feature                  ← AUTHORED  Gherkin scenarios
├── <name>.steps.ts                 ← AUTHORED  feature-specific step bindings
└── <demo-name>.demo.yaml           ← AUTHORED  demo presentation metadata

out/generated/bdd/playwright/
└── product/apps/<app>/features/<feature>/e2e/
    └── <name>.e2e.ts               ← GENERATED Playwright wrapper (do not edit)

out/generated/bdd/argo/
├── <demo-name>.demo.ts             ← GENERATED Argo demo adapter (do not edit)
└── <demo-name>.scenes.json         ← GENERATED Argo scene manifest  (do not edit)
```

Only `.feature`, `.steps.ts`, and `.demo.yaml` files are hand-edited. Everything
under `out/generated/bdd/` is regenerated on demand by the BDD generator.

## Step definition file shape

Step definitions register Cucumber expressions and bind them to functions that
receive `BddWorld` as `this`:

```ts
import { Given, When, Then, type DataTable } from "../../../../../../tools/testing/bdd/steps"
import type { BddWorld } from "../../../../../../tools/testing/bdd/world"

Given("the launcher has a previous game named {string}", async function (this: BddWorld, name: string) {
  // step implementation using this.page / this.baseUrl
})
```

The shared step registry in `tools/testing/bdd/shared-steps.ts` provides
common steps such as `I open {string}`, `I should see {string}`, and the
heading/URL helpers. Generated wrappers always import shared steps, so feature
step files do not need to re-import them.

## Generated wrappers

Generated wrappers contain only:
1. The `test` import from `@playwright/test`.
2. Imports of `BddWorld`, `executeScenario`, and `parseFeatureFile` from the
   BDD runtime.
3. Side-effect imports of `shared-steps` and any flat `<name>.steps.ts` files
   that sit beside the feature.
4. A single `parseFeatureFile()` call at module scope.
5. A `test.describe(...)` containing one `test(...)` per scenario.

They must never contain assertions, locators, fixtures, conditional logic, or
helpers. If you need to change behavior, edit the `.feature` file or the
step definitions.

## BDD-derived Argo demos

A scenario opts into Argo recording with a `@demo(<demo-name>)` tag:

```gherkin
@demo(launcher-overview)
Scenario: User opens the launcher and sees their library
  Given the launcher data is reset to seed state
  When I open "/"
  Then I should see "Library"
```

Optional presentation metadata lives in `e2e/<demo-name>.demo.yaml`:

```yaml
demo: launcher-overview
recording:
  start: after-step-1
scenes:
  after-step-1:
    scene: welcome
    durationMs: 7900
    narration: |
      Korri loads your library from a local seed.
    overlay:
      type: headline-card
      title: Reproducible from seed data
      placement: bottom-center
```

Storyboards are presentation-only. Do not put routes, selectors, clicks,
fills, assertions, or step lists in them; behavior belongs in `.feature`
files and step definitions. Storyboard YAML without a matching
`@demo(<demo-name>)` scenario is rejected by generation.

`just generate-bdd` emits both Playwright wrappers and Argo demo adapters.
`just check-bdd` validates that generated artifacts are current without
rewriting them.

## Adding a new BDD feature

1. Create `product/apps/<app>/features/<feature>/e2e/<name>.feature`.
2. Optionally add `<name>.steps.ts` for feature-specific steps.
3. (Optional) tag a scenario with `@demo(<name>)` and add
   `<name>.demo.yaml` for narration/overlays.
4. Run `just generate-bdd` to regenerate Playwright wrappers and Argo
   adapters. Run `just check-bdd` in validation to detect stale output.

## Notes

- `tools/testing/bdd/architecture.ts` documents the generated/authored
  contract enforced by tooling.
- `out/generated/bdd/**` is git-ignored; never commit generated wrappers,
  Argo adapters, or scene manifests.
- The current `safe-game-resume` feature is `@fixme` — do not tag it with
  `@demo(...)` until the underlying behavior ships.
