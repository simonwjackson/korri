import { expect, test } from "@playwright/test"

/**
 * Gamepad spatial navigation E2E demo for the Tilegrid primitive.
 *
 * Installs a fake Standard-layout Gamepad before Storybook preview starts
 * so the real gamepad adapter polls navigator.getGamepads() exactly as it
 * would in production. Proves device-agnostic input reaches the same DOM
 * focus engine as keyboard input without component coupling.
 *
 * Retargeted from
 * korri/shared/themes/shift/organisms/GameGrid.gamepad.story.e2e.ts
 * during the Tilegrid consolidation.
 */

const PLAYGROUND_STORY_ID = "design-system-tilegrid--playground"
// The Tilegrid stories default to a parent-filling canvas; pin the size for
// deterministic spatial-nav coverage regardless of Playwright viewport.
const IFRAME_PATH = `/iframe.html?id=${PLAYGROUND_STORY_ID}&viewMode=story&args=mode:scroll;dataset:basic;containerWidth:900px;containerHeight:560px`

const GAMEPAD_BUTTON = {
  confirm: 0,
  dpadLeft: 14,
  dpadRight: 15,
} as const

declare global {
  interface Window {
    __fakeGamepad?: {
      press(buttonIndex: number): void
      release(buttonIndex: number): void
      setAxis(index: number, value: number): void
      reset(): void
    }
  }
}

const installFakeGamepad = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 16 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }))
    const axes = [0, 0, 0, 0]
    const pad = {
      id: "playwright-fake-gamepad",
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: 0,
      axes,
      buttons,
      vibrationActuator: null,
    }

    Object.defineProperty(navigator, "getGamepads", {
      value: () => [pad],
      configurable: true,
    })

    window.__fakeGamepad = {
      press(buttonIndex: number) {
        const button = buttons[buttonIndex]
        if (!button) return
        button.pressed = true
        button.value = 1
      },
      release(buttonIndex: number) {
        const button = buttons[buttonIndex]
        if (!button) return
        button.pressed = false
        button.value = 0
      },
      setAxis(index: number, value: number) {
        axes[index] = value
      },
      reset() {
        for (const button of buttons) {
          button.pressed = false
          button.value = 0
        }
        axes.fill(0)
      },
    }

    window.dispatchEvent(new Event("gamepadconnected"))
  })
}

const focusedAriaLabel = async (page: import("@playwright/test").Page) => {
  return page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? null,
  )
}

const pressGamepadButton = async (
  page: import("@playwright/test").Page,
  buttonIndex: number,
) => {
  await page.evaluate(index => window.__fakeGamepad?.press(index), buttonIndex)
}

const releaseGamepadButton = async (
  page: import("@playwright/test").Page,
  buttonIndex: number,
) => {
  await page.evaluate(
    index => window.__fakeGamepad?.release(index),
    buttonIndex,
  )
}

test.describe("spatial navigation: Tilegrid story via gamepad", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeGamepad(page)
    await page.goto(IFRAME_PATH)
    await page.locator("button[aria-label]").first().waitFor()
  })

  test("d-pad right moves focus and d-pad left returns it", async ({
    page,
  }) => {
    const buttons = page.locator("button[aria-label]")
    await buttons.first().focus()

    const start = await focusedAriaLabel(page)
    expect(start).not.toBeNull()

    await pressGamepadButton(page, GAMEPAD_BUTTON.dpadRight)
    await expect.poll(() => focusedAriaLabel(page)).not.toBe(start)
    await releaseGamepadButton(page, GAMEPAD_BUTTON.dpadRight)

    await pressGamepadButton(page, GAMEPAD_BUTTON.dpadLeft)
    await expect.poll(() => focusedAriaLabel(page)).toBe(start)
    await releaseGamepadButton(page, GAMEPAD_BUTTON.dpadLeft)
  })

  test("confirm button fires a click on the focused cell", async ({ page }) => {
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
    await pressGamepadButton(page, GAMEPAD_BUTTON.confirm)

    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { __clicks?: string[] }).__clicks ?? [],
        ),
      )
      .toContain(focused)

    await releaseGamepadButton(page, GAMEPAD_BUTTON.confirm)
  })

  test("holding d-pad repeats directional movement", async ({ page }) => {
    const buttons = page.locator("button[aria-label]")
    await buttons.first().focus()

    const start = await focusedAriaLabel(page)
    await pressGamepadButton(page, GAMEPAD_BUTTON.dpadRight)

    await expect
      .poll(() => focusedAriaLabel(page), { timeout: 1_000 })
      .not.toBe(start)
    const afterFirstMove = await focusedAriaLabel(page)

    await expect
      .poll(() => focusedAriaLabel(page), { timeout: 1_500 })
      .not.toBe(afterFirstMove)

    await releaseGamepadButton(page, GAMEPAD_BUTTON.dpadRight)
  })

  test("left stick right moves focus", async ({ page }) => {
    const buttons = page.locator("button[aria-label]")
    await buttons.first().focus()

    const start = await focusedAriaLabel(page)
    await page.evaluate(() => window.__fakeGamepad?.setAxis(0, 0.8))

    await expect
      .poll(() => focusedAriaLabel(page), { timeout: 1_000 })
      .not.toBe(start)

    await page.evaluate(() => window.__fakeGamepad?.reset())
  })
})
