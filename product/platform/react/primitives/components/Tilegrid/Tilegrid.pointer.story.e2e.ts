import { expect, test } from "@playwright/test"

/**
 * Pointer (mouse) spatial-navigation E2E for the Tilegrid primitive.
 *
 * Drives the real pointer adapter via Playwright's `page.mouse` so the
 * full hover-focus + last-input-wins flow runs through production code:
 *
 *   - Hover focuses the tile under the cursor (via .focus()).
 *   - The cursor flips `<html data-input-mode>` to "pointer" on every move.
 *   - A keyboard arrow press flips `data-input-mode` to "directional".
 *   - The next mousemove flips it back to "pointer" and re-focuses under
 *     the cursor.
 *
 * No fake driver — the browser's native PointerEvent stream already drives
 * the adapter. We only need a deterministic story canvas and tile geometry
 * to hover predictable positions.
 */

const PLAYGROUND_STORY_ID = "design-system-tilegrid--playground"
const IFRAME_PATH = `/iframe.html?id=${PLAYGROUND_STORY_ID}&viewMode=story&args=mode:scroll;dataset:basic;containerWidth:900px;containerHeight:560px`

const focusedAriaLabel = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? null,
  )

const inputMode = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () => document.documentElement.getAttribute("data-input-mode") ?? null,
  )

test.describe("spatial navigation: Tilegrid story via pointer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(IFRAME_PATH)
    await page.locator("button[aria-label]").first().waitFor()
  })

  test("hovering a tile focuses it and flips input mode to pointer", async ({
    page,
  }) => {
    const targetButton = page.locator("button[aria-label]").nth(2)
    const targetLabel = await targetButton.getAttribute("aria-label")
    expect(targetLabel).not.toBeNull()

    const box = await targetButton.boundingBox()
    expect(box).not.toBeNull()
    if (!box) return

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

    await expect.poll(() => focusedAriaLabel(page)).toBe(targetLabel)
    await expect.poll(() => inputMode(page)).toBe("pointer")
  })

  test("arrow press after hover hides the cursor and switches to directional mode", async ({
    page,
  }) => {
    const initial = page.locator("button[aria-label]").nth(2)
    const box = await initial.boundingBox()
    if (!box) throw new Error("expected bounding box")

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect.poll(() => focusedAriaLabel(page)).not.toBeNull()
    const beforeArrow = await focusedAriaLabel(page)

    await page.keyboard.press("ArrowRight")

    await expect.poll(() => focusedAriaLabel(page)).not.toBe(beforeArrow)
    await expect.poll(() => inputMode(page)).toBe("directional")
  })

  test("mousemove after arrow press re-shows the cursor and snaps focus", async ({
    page,
  }) => {
    // Start in directional mode by pressing an arrow first.
    await page.locator("button[aria-label]").first().focus()
    await page.keyboard.press("ArrowRight")
    await expect.poll(() => inputMode(page)).toBe("directional")

    // Move to a different tile — focus should snap and mode should flip back.
    const target = page.locator("button[aria-label]").nth(5)
    const targetLabel = await target.getAttribute("aria-label")
    const box = await target.boundingBox()
    if (!box) throw new Error("expected bounding box")

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

    await expect.poll(() => focusedAriaLabel(page)).toBe(targetLabel)
    await expect.poll(() => inputMode(page)).toBe("pointer")
  })

  test("clicking non-focusable canvas space does not clear the active tile", async ({
    page,
  }) => {
    const target = page.locator("button[aria-label]").nth(2)
    const targetLabel = await target.getAttribute("aria-label")
    const box = await target.boundingBox()
    if (!box) throw new Error("expected bounding box")

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect.poll(() => focusedAriaLabel(page)).toBe(targetLabel)

    // The Storybook decorator leaves non-focusable canvas/background space
    // at the top-left of the iframe. Clicking there used to let the browser
    // fall back to body/html focus, visually leaving no active tile.
    await page.mouse.click(4, 4)

    await expect.poll(() => focusedAriaLabel(page)).toBe(targetLabel)
  })

  test("arrow navigation after attempted deselection continues from the retained tile", async ({
    page,
  }) => {
    const target = page.locator("button[aria-label]").nth(2)
    const targetLabel = await target.getAttribute("aria-label")
    const box = await target.boundingBox()
    if (!box) throw new Error("expected bounding box")

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect.poll(() => focusedAriaLabel(page)).toBe(targetLabel)

    // Capture the exact LRUD neighbor for this tile so the regression proves
    // navigation resumes from the retained focus target, not from a fallback
    // first tile or another arbitrary origin.
    await page.keyboard.press("ArrowRight")
    const expectedRightNeighbor = await focusedAriaLabel(page)
    expect(expectedRightNeighbor).not.toBeNull()
    expect(expectedRightNeighbor).not.toBe(targetLabel)

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect.poll(() => focusedAriaLabel(page)).toBe(targetLabel)

    await page.mouse.click(4, 4)
    await expect.poll(() => focusedAriaLabel(page)).toBe(targetLabel)

    await page.keyboard.press("ArrowRight")

    await expect.poll(() => focusedAriaLabel(page)).toBe(expectedRightNeighbor)
  })

  test("clicking another tile still changes focus normally", async ({
    page,
  }) => {
    const first = page.locator("button[aria-label]").nth(2)
    const second = page.locator("button[aria-label]").nth(4)
    const secondLabel = await second.getAttribute("aria-label")
    const firstBox = await first.boundingBox()
    const secondBox = await second.boundingBox()
    if (!firstBox || !secondBox) throw new Error("expected bounding boxes")

    await page.mouse.move(
      firstBox.x + firstBox.width / 2,
      firstBox.y + firstBox.height / 2,
    )
    await expect.poll(() => focusedAriaLabel(page)).not.toBe(secondLabel)

    await page.mouse.click(
      secondBox.x + secondBox.width / 2,
      secondBox.y + secondBox.height / 2,
    )

    await expect.poll(() => focusedAriaLabel(page)).toBe(secondLabel)
  })

  test("right-click on non-focusable canvas space preserves the native context menu", async ({
    page,
  }) => {
    await page.evaluate(() => {
      const w = window as Window & { __ctxPrevented?: boolean[] }
      w.__ctxPrevented = []
      document.addEventListener(
        "contextmenu",
        ev => {
          queueMicrotask(() => {
            w.__ctxPrevented?.push(ev.defaultPrevented)
          })
        },
        false,
      )
    })

    await page.mouse.click(4, 4, { button: "right" })

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __ctxPrevented?: boolean[] })
              .__ctxPrevented ?? [],
        ),
      )
      .toContain(false)
  })

  test("right-click on a tile fires a click event without showing native menu", async ({
    page,
  }) => {
    // The pointer adapter emits an `options` action on contextmenu of a
    // focusable, and preventDefault's the native menu. We assert
    // preventDefault by checking that a contextmenu listener sees the
    // event but its defaultPrevented flag is true after the adapter runs.
    await page.evaluate(() => {
      const w = window as Window & { __ctxPrevented?: boolean[] }
      w.__ctxPrevented = []
      document.addEventListener(
        "contextmenu",
        ev => {
          // Read in a microtask so the adapter (also listening at window)
          // has had a chance to call preventDefault.
          queueMicrotask(() => {
            w.__ctxPrevented?.push(ev.defaultPrevented)
          })
        },
        false,
      )
    })

    const target = page.locator("button[aria-label]").first()
    const box = await target.boundingBox()
    if (!box) throw new Error("expected bounding box")

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
      button: "right",
    })

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __ctxPrevented?: boolean[] })
              .__ctxPrevented ?? [],
        ),
      )
      .toContain(true)
  })
})
