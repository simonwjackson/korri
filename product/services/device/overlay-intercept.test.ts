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
  it("subscribes once up front and enables intercept (mode 2) on activate", async () => {
    const fake = createFakePort()
    const controller = createOverlayInterceptController(fake.port)

    // Persistent subscription: monitor is live before activate (no startup race).
    expect(fake.isSubscribed()).toBe(true)

    await controller.activate(() => {})

    expect(fake.modes).toEqual([2])
    expect(controller.isActive()).toBe(true)
  })

  it("does not deliver nav until active", async () => {
    const fake = createFakePort()
    const controller = createOverlayInterceptController(fake.port)
    const navs: OverlayNav[] = []
    fake.emit("ui_left", 1) // before activate -> ignored
    await controller.activate(nav => navs.push(nav))
    fake.emit("ui_right", 1)
    expect(navs).toEqual(["right"])
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

  it("fires onChord once when the full dismiss chord is held while active", async () => {
    const fake = createFakePort()
    const controller = createOverlayInterceptController(fake.port)
    let chords = 0
    await controller.activate(
      () => {},
      () => {
        chords++
      },
    )
    // Partial chord does nothing.
    fake.emit("ui_l1", 1)
    fake.emit("ui_r1", 1)
    fake.emit("ui_select", 1)
    expect(chords).toBe(0)
    // The fourth capability completes the chord -> fires exactly once.
    fake.emit("ui_option", 1)
    expect(chords).toBe(1)
    fake.emit("ui_option", 1) // still held, not re-fired
    expect(chords).toBe(1)
    // Release one and re-press to complete again -> re-arms and fires again.
    fake.emit("ui_option", 0)
    fake.emit("ui_option", 1)
    expect(chords).toBe(2)
  })

  it("does not fire onChord before activate or after deactivate", async () => {
    const fake = createFakePort()
    const controller = createOverlayInterceptController(fake.port)
    let chords = 0
    const hold = () => {
      fake.emit("ui_l1", 1)
      fake.emit("ui_r1", 1)
      fake.emit("ui_select", 1)
      fake.emit("ui_option", 1)
    }
    hold() // before activate -> ignored
    expect(chords).toBe(0)
    await controller.activate(
      () => {},
      () => {
        chords++
      },
    )
    await controller.deactivate()
    fake.emit("ui_l1", 0)
    fake.emit("ui_r1", 0)
    fake.emit("ui_select", 0)
    fake.emit("ui_option", 0)
    hold() // after deactivate -> ignored
    expect(chords).toBe(0)
  })

  it("disables intercept (mode 0) and stops nav on deactivate", async () => {
    const fake = createFakePort()
    const controller = createOverlayInterceptController(fake.port)
    const navs: OverlayNav[] = []

    await controller.activate(nav => navs.push(nav))
    await controller.deactivate()

    expect(fake.modes).toEqual([2, 0])
    expect(controller.isActive()).toBe(false)

    fake.emit("ui_left", 1) // gated off; not delivered
    expect(navs).toEqual([])
  })

  it("waits for a held accept release before ungating", async () => {
    const fake = createFakePort()
    const controller = createOverlayInterceptController(fake.port)
    const navs: OverlayNav[] = []

    await controller.activate(nav => navs.push(nav))
    fake.emit("ui_accept", 1)
    const deactivated = controller.deactivate()

    expect(controller.isActive()).toBe(false)
    expect(fake.modes).toEqual([2])

    fake.emit("ui_right", 1) // pending deactivate; ignore new presses
    expect(navs).toEqual(["accept"])
    expect(fake.modes).toEqual([2])

    fake.emit("ui_accept", 0)
    await deactivated
    expect(fake.modes).toEqual([2, 0])
  })

  it("waits for every held dismiss-chord button to release before ungating", async () => {
    const fake = createFakePort()
    const controller = createOverlayInterceptController(fake.port)
    let chords = 0

    await controller.activate(
      () => {},
      () => {
        chords++
      },
    )
    fake.emit("ui_l1", 1)
    fake.emit("ui_r1", 1)
    fake.emit("ui_select", 1)
    fake.emit("ui_option", 1)
    expect(chords).toBe(1)

    const deactivated = controller.deactivate()
    expect(fake.modes).toEqual([2])

    fake.emit("ui_l1", 0)
    fake.emit("ui_r1", 0)
    fake.emit("ui_select", 0)
    expect(fake.modes).toEqual([2])

    fake.emit("ui_option", 0)
    await deactivated
    expect(fake.modes).toEqual([2, 0])
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
    // Recovery path issued a best-effort restore-to-0.
    expect(fake.modes).toEqual([0])
  })
})
