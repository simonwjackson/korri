import { expect, test } from "@playwright/test"

/**
 * Spatial navigation E2E demo for the Tilegrid primitive.
 *
 * Drives the Tilegrid Playground story with synthetic arrow keys and asserts
 * focus moves across native <button> elements. Proves the navigation layer
 * works without any per-component coupling — the cells in this story are
 * plain <button>s rendered by the consumer through TilegridCells cellProps
 * with no useFocusable, no refs, no provider.
 *
 * Storybook's preview wires startSpatialNavigation() once at module scope,
 * so every story inherits keyboard + gamepad-driven focus for free.
 *
 * Retargeted from korri/shared/themes/shift/organisms/GameGrid.story.e2e.ts
 * during the Tilegrid consolidation.
 */

const PLAYGROUND_STORY_ID = "design-system-tilegrid--playground"
const VIEW_TRANSITIONS_STORY_ID = "design-system-tilegrid--view-transitions"

const iframePath = (storyId: string, args?: string) => {
  const query = new URLSearchParams({ id: storyId, viewMode: "story" })
  if (args) query.set("args", args)
  return `/iframe.html?${query.toString()}`
}

const focusedAriaLabel = async (page: import("@playwright/test").Page) => {
  return page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? null,
  )
}

test.describe("spatial navigation: Tilegrid scroll playground", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(
      iframePath(PLAYGROUND_STORY_ID, "mode:scroll;dataset:basic"),
    )
    // Cells render as <button aria-label="...">. Wait for at least one.
    await page.locator("button[aria-label]").first().waitFor()
  })

  test("ArrowDown / ArrowRight move focus across cells", async ({ page }) => {
    const buttons = page.locator("button[aria-label]")
    await buttons.first().focus()

    const start = await focusedAriaLabel(page)
    expect(start).not.toBeNull()

    await page.keyboard.press("ArrowRight")
    const afterRight = await focusedAriaLabel(page)
    expect(afterRight).not.toBeNull()
    expect(afterRight).not.toBe(start)

    await page.keyboard.press("ArrowDown")
    const afterDown = await focusedAriaLabel(page)
    expect(afterDown).not.toBeNull()
    expect(afterDown).not.toBe(afterRight)
  })

  test("ArrowLeft after ArrowRight returns focus to the original cell", async ({
    page,
  }) => {
    const buttons = page.locator("button[aria-label]")
    await buttons.first().focus()

    const start = await focusedAriaLabel(page)
    await page.keyboard.press("ArrowRight")
    const afterRight = await focusedAriaLabel(page)
    expect(afterRight).not.toBe(start)

    await page.keyboard.press("ArrowLeft")
    const afterLeft = await focusedAriaLabel(page)
    expect(afterLeft).toBe(start)
  })

  test("Enter fires a click on the focused cell", async ({ page }) => {
    const buttons = page.locator("button[aria-label]")
    await buttons.first().focus()

    await page.evaluate(() => {
      const w = window as Window & { __clicks?: string[] }
      w.__clicks = []
      document.addEventListener(
        "click",
        ev => {
          const target = ev.target as HTMLElement | null
          const button = target?.closest(
            "button[aria-label]",
          ) as HTMLElement | null
          const label = button?.getAttribute("aria-label")
          if (label) w.__clicks?.push(label)
        },
        true,
      )
    })

    const focused = await focusedAriaLabel(page)
    await page.keyboard.press("Enter")

    const clicks = await page.evaluate(
      () => (window as Window & { __clicks?: string[] }).__clicks ?? [],
    )
    expect(clicks).toContain(focused)
  })
})

test.describe("spatial navigation: Tilegrid scroll hero playground", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(iframePath(PLAYGROUND_STORY_ID, "mode:scroll;dataset:hero"))
    await page.locator("button[aria-label]").first().waitFor()
  })

  test("ArrowRight from the hero (2x2) tile lands on a real neighbor", async ({
    page,
  }) => {
    // The first tile is span:2 (2x2). Geometric LRUD must still find a
    // single-cell neighbor to its right despite the irregular row heights
    // produced by CSS grid-auto-flow:dense around the hero.
    const hero = page.locator('button[aria-label="tile-0"]')
    await hero.focus()
    expect(await focusedAriaLabel(page)).toBe("tile-0")

    await page.keyboard.press("ArrowRight")
    const after = await focusedAriaLabel(page)
    expect(after).not.toBeNull()
    expect(after).not.toBe("tile-0")
  })
})

test.describe("Tilegrid paged playground", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(
      iframePath(
        PLAYGROUND_STORY_ID,
        "mode:paged;dataset:manyHeroes;cellSize:90",
      ),
    )
    await page.locator("button[aria-label]").first().waitFor()
  })

  test("Next and Prev controls switch pages without unmounting the grid", async ({
    page,
  }) => {
    await expect(page.getByText("1 /", { exact: false })).toBeVisible()

    await page.getByRole("button", { name: "Next →" }).click()
    await expect(page.getByText("2 /", { exact: false })).toBeVisible()

    await page.getByRole("button", { name: "← Prev" }).click()
    await expect(page.getByText("1 /", { exact: false })).toBeVisible()
  })
})

test.describe("Tilegrid View Transitions story", () => {
  test("publishes stable view-transition-name styles on cells", async ({
    page,
  }) => {
    await page.goto(iframePath(VIEW_TRANSITIONS_STORY_ID, "dataset:manyHeroes"))
    const firstCell = page.locator('button[aria-label="tile-0"]')
    await firstCell.waitFor()

    await expect(firstCell).toHaveCSS("view-transition-name", "tile-tile-0")
  })
})
