import { describe, expect, it } from "bun:test"
import {
  createOverlayInterceptController,
  type InputPlumberInterceptPort,
  type InterceptMode,
  type OverlayNav,
} from "./overlay-intercept"

function createFakePort() {
  const modes: InterceptMode[] = []
  let emit: ((capability: string, value: number) => void) | null = null
  let subscribed = 0
  let failNextSet = false
  const port: InputPlumberInterceptPort = {
    async setInterceptMode(mode) {
      if (failNextSet) {
        failNextSet = false
        throw new Error("bus error")
      }
      modes.push(mode)
    },
    subscribeInputEvents(onEvent) {
      subscribed++
      emit = onEvent
      return () => {
        subscribed--
        emit = null
      }
    },
  }
  return {
    port,
    modes,
    emit: (capability: string, value: number) => emit?.(capability, value),
    isSubscribed: () => subscribed > 0,
    setFailNextSet: () => {
      failNextSet = true
    },
  }
}

describe("overlay intercept controller", () => {
  it("enables intercept (mode 2) and subscribes on activate", async () => {
    const fake = createFakePort()
    const controller = createOverlayInterceptController(fake.port)

    await controller.activate(() => {})

    expect(fake.modes).toEqual([2])
    expect(fake.isSubscribed()).toBe(true)
    expect(controller.isActive()).toBe(true)
  })

  it("maps ui_* presses to nav and ignores releases", async () => {
    const fake = createFakePort()
    const controller = createOverlayInterceptController(fake.port)
    const navs: OverlayNav[] = []

    await controller.activate(nav => navs.push(nav))
    fake.emit("ui_left", 1)
    fake.emit("ui_left", 0) // release -> ignored
    fake.emit("ui_right", 1)
    fake.emit("ui_up", 1)
    fake.emit("ui_down", 1)
    fake.emit("ui_accept", 1)
    fake.emit("ui_back", 1)

    expect(navs).toEqual(["left", "right", "up", "down", "accept", "back"])
  })

  it("ignores unknown capabilities", async () => {
    const fake = createFakePort()
    const controller = createOverlayInterceptController(fake.port)
    const navs: OverlayNav[] = []

    await controller.activate(nav => navs.push(nav))
    fake.emit("ui_context", 1)
    fake.emit("gamepad:south", 1)

    expect(navs).toEqual([])
  })

  it("disables intercept (mode 0) and unsubscribes on deactivate", async () => {
    const fake = createFakePort()
    const controller = createOverlayInterceptController(fake.port)
    const navs: OverlayNav[] = []

    await controller.activate(nav => navs.push(nav))
    await controller.deactivate()

    expect(fake.modes).toEqual([2, 0])
    expect(fake.isSubscribed()).toBe(false)
    expect(controller.isActive()).toBe(false)

    fake.emit("ui_left", 1) // no longer delivered
    expect(navs).toEqual([])
  })

  it("is idempotent on repeated activate/deactivate", async () => {
    const fake = createFakePort()
    const controller = createOverlayInterceptController(fake.port)

    await controller.activate(() => {})
    await controller.activate(() => {})
    await controller.deactivate()
    await controller.deactivate()

    expect(fake.modes).toEqual([2, 0])
  })

  it("does not leave the game gated if enabling intercept fails", async () => {
    const fake = createFakePort()
    const controller = createOverlayInterceptController(fake.port)
    fake.setFailNextSet()

    await expect(controller.activate(() => {})).rejects.toThrow("bus error")

    expect(controller.isActive()).toBe(false)
    expect(fake.isSubscribed()).toBe(false)
    // Recovery path issued a restore-to-0.
    expect(fake.modes).toEqual([0])
  })
})
