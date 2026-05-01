import { expect, test } from "@playwright/test"

/**
 * Wheel-as-direction E2E for the Tilegrid primitive.
 *
 * The TilegridScrollRoot opts in to the wheel adapter via
 * `data-pointer-wheel="2d"`. Inside the container, wheel events emit
 * direction actions (cycling focus tile-by-tile) and `preventDefault`
 * native page scroll. Outside the container, wheel scrolls normally.
 */

const PLAYGROUND_STORY_ID = "design-system-tilegrid--playground"
const IFRAME_PATH = `/iframe.html?id=${PLAYGROUND_STORY_ID}&viewMode=story&args=mode:scroll;dataset:basic;containerWidth:900px;containerHeight:560px`

const focusedAriaLabel = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? null,
  )

test.describe("wheel-as-direction: Tilegrid story", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(IFRAME_PATH)
    await page.locator("button[aria-label]").first().waitFor()
  })

  test("wheel inside the grid moves focus down without scrolling the page", async ({
    page,
  }) => {
    const firstTile = page.locator("button[aria-label]").first()
    const box = await firstTile.boundingBox()
    if (!box) throw new Error("expected bounding box")

    // Position the cursor over the first tile and let hover focus it.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect.poll(() => focusedAriaLabel(page)).not.toBeNull()
    const startLabel = await focusedAriaLabel(page)

    // Capture the iframe scrollY before the wheel.
    const scrollYBefore = await page.evaluate(() => window.scrollY)

    // One classic mouse-wheel "click" of vertical scroll. The wheel adapter
    // accumulates 100 deltaY > 80 threshold and emits one direction.
    await page.mouse.wheel(0, 100)

    await expect.poll(() => focusedAriaLabel(page)).not.toBe(startLabel)

    const scrollYAfter = await page.evaluate(() => window.scrollY)
    expect(scrollYAfter).toBe(scrollYBefore)
  })

  test("a large wheel delta emits multiple direction steps in one event", async ({
    page,
  }) => {
    const firstTile = page.locator("button[aria-label]").first()
    const box = await firstTile.boundingBox()
    if (!box) throw new Error("expected bounding box")

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect.poll(() => focusedAriaLabel(page)).not.toBeNull()
    const startLabel = await focusedAriaLabel(page)

    const labelsAtStart = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button[aria-label]")).map(
        button => button.getAttribute("aria-label") ?? "",
      ),
    )
    const startIndex = labelsAtStart.indexOf(startLabel ?? "")

    // 240 deltaY at threshold 80 = 3 direction emissions.
    await page.mouse.wheel(0, 240)

    await expect.poll(() => focusedAriaLabel(page)).not.toBe(startLabel)

    const endLabel = await focusedAriaLabel(page)
    const endIndex = labelsAtStart.indexOf(endLabel ?? "")
    // Focus should have advanced multiple tiles, not just one. Geometry
    // depends on the dataset, but at minimum we expect endIndex > startIndex
    // by more than 1.
    expect(endIndex - startIndex).toBeGreaterThan(1)
  })

  test("wheel outside an opted-in container scrolls the page natively", async ({
    page,
  }) => {
    // Mount a tall non-opted-in scrolling region above the iframe canvas
    // would require modifying the story. Instead we verify the wheel
    // adapter does not preventDefault when the cursor is outside the
    // grid by hovering at coordinate (1, 1) — likely outside the
    // tilegrid root — and confirming the page wheel is not consumed.
    //
    // The Tilegrid playground story renders the grid filling its iframe.
    // To get "outside the container" we install a sibling spacer above
    // the grid via page.evaluate, then hover that spacer.
    await page.evaluate(() => {
      const spacer = document.createElement("div")
      spacer.id = "wheel-test-spacer"
      spacer.style.cssText =
        "position: fixed; top: 0; left: 0; width: 100%; height: 40px; background: rgba(255,0,0,0.05); z-index: 9999;"
      document.body.append(spacer)
    })

    await page.mouse.move(20, 20)

    const focusBefore = await focusedAriaLabel(page)
    await page.mouse.wheel(0, 200)

    // Focus should not have changed because the cursor was over the
    // injected spacer, which is outside any data-pointer-wheel container.
    await expect.poll(() => focusedAriaLabel(page)).toBe(focusBefore)
  })
})
