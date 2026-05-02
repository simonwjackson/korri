import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  type SpatialNavigationHandle,
  startSpatialNavigation,
} from "@shared/navigation/start"
import { act, render, waitFor } from "@testing-library/react"
import { ShiftHudButton } from "./ShiftHudButton"

/**
 * ShiftHudButton is the Shift theme's single-chip replacement for the
 * older array-driven `HudButtons` exploration component. The contract
 * pinned down here:
 *
 *   - One <ShiftHudButton /> renders exactly one HUD hint chip.
 *   - Its glyph circle pulses (data-active="") for ~220ms when the
 *     input bus emits the matching semantic action.
 *   - Other actions on the bus do not pulse the chip.
 *   - Unmounting mid-pulse does not throw or warn.
 *
 * Tests boot a real spatial-navigation handle (with keyboard / gamepad
 * adapters disabled) so subscriptions reach the live bus the same way
 * the running app does. Mocking `useInputAction` would test less.
 */

let handle: SpatialNavigationHandle

beforeEach(() => {
  handle = startSpatialNavigation({ keyboard: false, gamepad: false })
})

afterEach(() => {
  handle.dispose()
})

describe("ShiftHudButton", () => {
  it("renders one aria-hidden hint with the supplied glyph and label", () => {
    const { container } = render(
      <ShiftHudButton action="confirm" glyph="A" label="Continue" />,
    )

    const hud = container.querySelector(".shift-hud")
    expect(hud).toBeTruthy()
    expect(hud?.getAttribute("aria-hidden")).toBe("true")

    const hints = container.querySelectorAll(".shift-hud-hint")
    expect(hints.length).toBe(1)
    expect(hints[0]?.querySelector(".shift-hud-glyph")?.textContent).toBe("A")
    expect(hints[0]?.querySelector(".shift-hud-label")?.textContent).toBe(
      "Continue",
    )
  })

  it("pulses data-active on the matching action emit, then clears it", async () => {
    const { container } = render(
      <ShiftHudButton action="options" glyph="+" label="Options" />,
    )

    act(() => {
      handle.bus.emit({ type: "options" })
    })

    await waitFor(() => {
      const hint = container.querySelector(".shift-hud-hint")
      expect(hint?.getAttribute("data-active")).toBe("")
    })

    // Pulse window is 220ms; allow generously for environment scheduling.
    await waitFor(
      () => {
        const hint = container.querySelector(".shift-hud-hint")
        expect(hint?.hasAttribute("data-active")).toBe(false)
      },
      { timeout: 800 },
    )
  })

  it("ignores actions other than the one it subscribed to", async () => {
    const { container } = render(
      <ShiftHudButton action="confirm" glyph="A" label="Continue" />,
    )

    act(() => {
      handle.bus.emit({ type: "back" })
      handle.bus.emit({ type: "options" })
    })

    await new Promise(resolve => setTimeout(resolve, 50))
    const hint = container.querySelector(".shift-hud-hint")
    expect(hint?.hasAttribute("data-active")).toBe(false)
  })

  it("survives unmount while a pulse is in flight without throwing", async () => {
    const { container, unmount } = render(
      <ShiftHudButton action="options" glyph="+" label="Options" />,
    )

    act(() => {
      handle.bus.emit({ type: "options" })
    })

    await waitFor(() => {
      const hint = container.querySelector(".shift-hud-hint")
      expect(hint?.getAttribute("data-active")).toBe("")
    })

    expect(() => unmount()).not.toThrow()

    // Wait past the pulse window — the cleanup useEffect must have
    // cleared the timer so the setTimeout callback does not setState
    // on an unmounted component.
    await new Promise(resolve => setTimeout(resolve, 300))
  })
})
