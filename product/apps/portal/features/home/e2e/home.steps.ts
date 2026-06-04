/**
 * BDD step definitions for the Shift home surface.
 *
 * Shared steps (`I open {string}`, `I should see {string}`) are
 * registered globally by `tools/testing/bdd/shared-steps.ts` and
 * imported as a side-effect by the generated wrapper, so this file
 * only adds home-specific steps:
 *
 *   - "the resume tile should be focused"
 *   - "I move focus to the tile named {string}"
 *   - "the home caption should show {string}"
 *   - "the launcher should still be at {string}"
 *
 * These read the live DOM via Playwright. They do not stub spatial
 * navigation, so the assertions exercise the same code path that
 * runs in the product route.
 */

import { expect } from "@playwright/test"
import { Then, When } from "../../../../../../tools/testing/bdd/steps"
import type { BddWorld } from "../../../../../../tools/testing/bdd/world"

const TIMEOUT = 30_000

/**
 * The resume target id is fixed by the in-repo games fixture.
 * `product/platform/fixtures/games/games.ts` lists Crystalline Drift first,
 * which is what `ShiftHomeRoot` treats as the default resume target.
 */
const RESUME_TILE_ID = "crystalline-drift"

Then("the resume tile should be focused", async function (this: BddWorld) {
  // ShiftHomeRoot focuses the resume target inside a useEffect after
  // mount. Wait for that to land before asserting.
  await expect
    .poll(
      async () =>
        this.page.evaluate(
          () => (document.activeElement as HTMLElement | null)?.dataset?.tileId,
        ),
      { timeout: TIMEOUT },
    )
    .toBe(RESUME_TILE_ID)
})

When(
  "I move focus to the tile named {string}",
  async function (this: BddWorld, name: string) {
    // Each cell button carries its display name via aria-label
    // (TilegridCells reads `getAriaLabel` from context). Calling
    // `.focus()` directly bypasses pointer-vs-directional input
    // resolution and exercises the rail's delegated focusin listener.
    await this.page.getByRole("button", { name, exact: false }).first().focus()
  },
)

Then(
  "the home caption should show {string}",
  async function (this: BddWorld, text: string) {
    const caption = this.page.locator(".shift-home-caption")
    await expect(caption).toContainText(text, { timeout: TIMEOUT })
  },
)

Then(
  "the launcher should still be at {string}",
  async function (this: BddWorld, path: string) {
    const url = new URL(this.page.url())
    expect(url.pathname).toBe(path)
  },
)
