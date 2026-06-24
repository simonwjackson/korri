import { expect, test } from "@playwright/test"

const HOME_STORY_ID = "themes-shift-pages-home--default"

const iframePath = (storyId: string) => {
  const query = new URLSearchParams({ id: storyId, viewMode: "story" })
  return `/iframe.html?${query.toString()}`
}

test.describe("Shift Home Labs panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(iframePath(HOME_STORY_ID))
    await page.getByRole("button", { name: "Labs" }).waitFor()
  })

  test("opens Labs and scales the surface in realtime", async ({ page }) => {
    await page.getByRole("button", { name: "Labs" }).click()

    await expect(page.getByRole("dialog", { name: "Labs" })).toBeVisible()

    const slider = page.getByRole("slider", { name: "UI scale" })
    await slider.evaluate(element => {
      const input = element as HTMLInputElement
      input.value = "1.15"
      input.dispatchEvent(new Event("input", { bubbles: true }))
      input.dispatchEvent(new Event("change", { bubbles: true }))
    })

    await expect(page.getByText("115%")).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const host = document.querySelector<HTMLElement>("[data-shift-home]")
          return host?.style.getPropertyValue("--intrinsic-text-scale") ?? ""
        }),
      )
      .toBe("1.15")
  })

  test("closes Labs and leaves home focus usable", async ({ page }) => {
    const labs = page.getByRole("button", { name: "Labs" })
    await labs.click()
    await expect(page.getByRole("dialog", { name: "Labs" })).toBeVisible()

    await page.keyboard.press("Escape")

    await expect(page.getByRole("dialog", { name: "Labs" })).toBeHidden()
    await expect(labs).toBeFocused()

    await page.keyboard.press("ArrowDown")

    const focusedTileId = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null
      return active?.dataset.tileId ?? null
    })

    expect(focusedTileId).not.toBeNull()
  })
})
