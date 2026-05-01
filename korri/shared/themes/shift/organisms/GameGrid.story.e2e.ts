import { expect, test } from "@playwright/test"

/**
 * Spatial navigation E2E demo.
 *
 * Drives the GameGrid story with synthetic arrow keys and asserts focus moves
 * across native <button> elements. Proves the navigation layer works without
 * any per-component coupling — the cards in this story are plain <button>s
 * with no useFocusable, no refs, no provider.
 *
 * Storybook's preview wires startSpatialNavigation() once at module scope, so
 * every story inherits keyboard + (eventually) gamepad-driven focus for free.
 */

const STORY_ID = "themes-shift-organisms-gamegrid--grid"
const IFRAME_PATH = `/iframe.html?id=${STORY_ID}&viewMode=story`

const focusedAriaLabel = async (page: import("@playwright/test").Page) => {
  return page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? null,
  )
}

test.describe("spatial navigation: GameGrid story", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(IFRAME_PATH)
    // Cards render as <button aria-label="...">. Wait for at least one.
    await page.locator("button[aria-label]").first().waitFor()
  })

  test("ArrowDown / ArrowRight move focus across cards", async ({ page }) => {
    // Establish initial focus by tabbing into the grid once. The engine also
    // auto-focuses an initial element on first directional input; either path
    // is acceptable, so we trigger from a known starting point.
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

  test("ArrowLeft after ArrowRight returns focus to the original card", async ({
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

  test("Enter fires a click on the focused card", async ({ page }) => {
    const buttons = page.locator("button[aria-label]")
    await buttons.first().focus()

    // Install a document-level click spy that records aria-labels of clicked
    // elements. The engine's confirm handler invokes .click() on the active
    // element by default; we verify that the click reaches the DOM.
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
