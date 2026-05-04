import { expect, type Locator, test } from "@playwright/test"

const DUAL_SCREEN_STORY_ID =
  "themes-shift-experiments-dual-screen--primary-and-companion"

const iframePath = (storyId: string) => {
  const query = new URLSearchParams({ id: storyId, viewMode: "story" })
  return `/iframe.html?${query.toString()}`
}

test.describe("Shift dual-screen story", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(iframePath(DUAL_SCREEN_STORY_ID))
    await page.locator('[data-dual-screen-preview="primary"]').waitFor()
  })

  test("preserves the physical screen ratios", async ({ page }) => {
    await expectRatio(
      page.locator('[data-dual-screen-preview="primary"]'),
      16 / 9,
    )
    await expectRatio(
      page.locator('[data-dual-screen-preview="companion"]'),
      8 / 7,
    )
  })

  test("updates the companion when primary focus changes", async ({ page }) => {
    await page.locator('[data-tile-id="ember-circuit"]').focus()

    await expect(
      page
        .locator('[data-dual-screen-preview="companion"]')
        .getByText("Ember Circuit"),
    ).toBeVisible()
  })
})

async function expectRatio(locator: Locator, expected: number): Promise<void> {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box ? box.width / box.height : 0).toBeCloseTo(expected, 2)
}
