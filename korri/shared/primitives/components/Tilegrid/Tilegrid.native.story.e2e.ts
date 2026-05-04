import { expect, test } from "@playwright/test"

/**
 * Native input bridge spatial navigation E2E for the Tilegrid primitive.
 *
 * Installs an in-page WebSocket implementation before Storybook preview starts
 * so the real native adapter connects exactly as it does in production, while
 * the test controls bridge messages through `window.__fakeNative`.
 */

const PLAYGROUND_STORY_ID = "design-system-tilegrid--playground"
const IFRAME_PATH = `/iframe.html?id=${PLAYGROUND_STORY_ID}&viewMode=story&args=mode:scroll;dataset:basic;containerWidth:900px;containerHeight:560px`

const EV_KEY = 1
const BTN_A = 304
const BTN_DPAD_RIGHT = 547
const BTN_DPAD_LEFT = 546

declare global {
  interface Window {
    __fakeNative?: {
      dispatch(message: unknown): void
      sent(): unknown[]
    }
    __korriStorybookNativeBridgeUrl?: string
  }
}

const installNativeBridge = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    window.__korriStorybookNativeBridgeUrl = "ws://native-input-storybook"

    const sockets = new Set<EventTarget & { send(data: string): void }>()
    const sentMessages: unknown[] = []

    class NativeStoryWebSocket extends EventTarget {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3

      readonly url: string
      readyState = NativeStoryWebSocket.CONNECTING
      binaryType: BinaryType = "blob"

      constructor(url: string) {
        super()
        this.url = url
        sockets.add(this)
        window.setTimeout(() => {
          this.readyState = NativeStoryWebSocket.OPEN
          this.dispatchEvent(new Event("open"))
        }, 0)
      }

      send(data: string) {
        sentMessages.push(JSON.parse(data))
      }

      close() {
        this.readyState = NativeStoryWebSocket.CLOSED
        sockets.delete(this)
        this.dispatchEvent(new CloseEvent("close"))
      }
    }

    Object.assign(NativeStoryWebSocket, {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
    })

    window.WebSocket = NativeStoryWebSocket as unknown as typeof WebSocket
    window.__fakeNative = {
      dispatch(message: unknown) {
        const event = new MessageEvent("message", {
          data: JSON.stringify(message),
        })
        for (const socket of sockets) socket.dispatchEvent(event)
      },
      sent() {
        return sentMessages
      },
    }
  })
}

const focusedAriaLabel = async (page: import("@playwright/test").Page) => {
  return page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? null,
  )
}

const dispatchNative = async (
  page: import("@playwright/test").Page,
  message: unknown,
) => {
  await page.evaluate(
    payload => window.__fakeNative?.dispatch(payload),
    message,
  )
}

const nativeInput = (
  overrides: Partial<{
    kind: "input"
    deviceId: string
    class: "gamepad" | "keyboard" | "mouse" | "touch" | "unknown"
    type: number
    code: number
    value: number
    timestamp: number
  }>,
) => ({
  kind: "input",
  deviceId: "inputplumber-virtual-xbox360",
  class: "gamepad",
  type: EV_KEY,
  code: BTN_DPAD_RIGHT,
  value: 1,
  timestamp: Date.now(),
  ...overrides,
})

test.describe("spatial navigation: Tilegrid story via native input bridge", () => {
  test.beforeEach(async ({ page }) => {
    await installNativeBridge(page)
    await page.goto(IFRAME_PATH)
    await page.locator("button[aria-label]").first().waitFor()
    await expect
      .poll(() => page.evaluate(() => window.__fakeNative?.sent() ?? []))
      .toContainEqual({ classes: ["gamepad"] })
  })

  test("d-pad right moves focus and d-pad left returns it", async ({
    page,
  }) => {
    const buttons = page.locator("button[aria-label]")
    await buttons.first().focus()

    const start = await focusedAriaLabel(page)
    expect(start).not.toBeNull()

    await dispatchNative(page, nativeInput({ code: BTN_DPAD_RIGHT, value: 1 }))
    await expect.poll(() => focusedAriaLabel(page)).not.toBe(start)
    await dispatchNative(page, nativeInput({ code: BTN_DPAD_RIGHT, value: 0 }))

    await dispatchNative(page, nativeInput({ code: BTN_DPAD_LEFT, value: 1 }))
    await expect.poll(() => focusedAriaLabel(page)).toBe(start)
    await dispatchNative(page, nativeInput({ code: BTN_DPAD_LEFT, value: 0 }))
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
    await dispatchNative(page, nativeInput({ code: BTN_A, value: 1 }))

    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { __clicks?: string[] }).__clicks ?? [],
        ),
      )
      .toContain(focused)
  })

  test("holding d-pad repeats directional movement", async ({ page }) => {
    const buttons = page.locator("button[aria-label]")
    await buttons.first().focus()

    const start = await focusedAriaLabel(page)
    await dispatchNative(page, nativeInput({ code: BTN_DPAD_RIGHT, value: 1 }))

    await expect
      .poll(() => focusedAriaLabel(page), { timeout: 1_000 })
      .not.toBe(start)
    const afterFirstMove = await focusedAriaLabel(page)

    await expect
      .poll(() => focusedAriaLabel(page), { timeout: 1_500 })
      .not.toBe(afterFirstMove)
  })

  test("device lifecycle and non-gamepad events do not move focus", async ({
    page,
  }) => {
    const buttons = page.locator("button[aria-label]")
    await buttons.first().focus()

    const start = await focusedAriaLabel(page)
    await dispatchNative(page, {
      kind: "device-added",
      device: {
        deviceId: "keyboard",
        class: "keyboard",
        name: "Keyboard",
        capabilities: ["EV_KEY"],
      },
    })
    await dispatchNative(
      page,
      nativeInput({ class: "keyboard", code: BTN_DPAD_RIGHT, value: 1 }),
    )
    await page.waitForTimeout(100)

    expect(await focusedAriaLabel(page)).toBe(start)
  })

  test("native directions switch the page to directional input mode", async ({
    page,
  }) => {
    const buttons = page.locator("button[aria-label]")
    await buttons.first().focus()

    await dispatchNative(page, nativeInput({ code: BTN_DPAD_RIGHT, value: 1 }))

    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.getAttribute("data-input-mode"),
        ),
      )
      .toBe("directional")
  })
})
