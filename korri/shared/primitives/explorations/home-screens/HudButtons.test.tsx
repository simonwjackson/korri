import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  type SpatialNavigationHandle,
  startSpatialNavigation,
} from "@platform/browser/navigation/start"
import { act, render, waitFor } from "@testing-library/react"
import { HudButtons } from "./HudButtons"

/**
 * HudButtons is a shared component consumed by three home-screen
 * explorations (Hero, Mosaic, Sunlit). Its public API gained two
 * extension axes — `actions` (which chips render and in what order) and
 * three glyph-character props — and the contract these tests pin down is:
 *
 *   - Defaults preserve Hero/Mosaic byte-identically.
 *   - The `actions` array drives both membership and render order.
 *   - Filtered actions never receive `data-active`, even when their
 *     semantic action is dispatched on the input bus.
 *
 * Tests boot a real spatial-navigation handle (with keyboard and gamepad
 * adapters disabled) so the input bus is reachable via emit(). This is
 * how the live app routes actions; mocking the hook would test less.
 */

let handle: SpatialNavigationHandle

beforeEach(() => {
  handle = startSpatialNavigation({ keyboard: false, gamepad: false })
})

afterEach(() => {
  handle.dispose()
})

describe("HudButtons — defaults preserve Hero/Mosaic compatibility", () => {
  it("renders confirm/back/options in canonical order with A/B/Y glyphs and default labels", () => {
    const { container } = render(<HudButtons />)
    const hints = container.querySelectorAll(".hud-hint")
    expect(hints.length).toBe(3)

    expect(hints[0]?.querySelector(".hud-glyph")?.textContent).toBe("A")
    expect(hints[0]?.querySelector(".hud-label")?.textContent).toBe("Confirm")

    expect(hints[1]?.querySelector(".hud-glyph")?.textContent).toBe("B")
    expect(hints[1]?.querySelector(".hud-label")?.textContent).toBe("Back")

    expect(hints[2]?.querySelector(".hud-glyph")?.textContent).toBe("Y")
    expect(hints[2]?.querySelector(".hud-label")?.textContent).toBe("Options")
  })

  it("preserves custom labels alongside default actions and glyphs", () => {
    const { container } = render(
      <HudButtons
        confirmLabel="Continue"
        backLabel="Dismiss"
        optionsLabel="Menu"
      />,
    )
    const labels = Array.from(container.querySelectorAll(".hud-label")).map(
      el => el.textContent,
    )
    expect(labels).toEqual(["Continue", "Dismiss", "Menu"])

    const glyphs = Array.from(container.querySelectorAll(".hud-glyph")).map(
      el => el.textContent,
    )
    expect(glyphs).toEqual(["A", "B", "Y"])
  })

  it("renders the .hud container with aria-hidden", () => {
    const { container } = render(<HudButtons />)
    const hud = container.querySelector(".hud")
    expect(hud).toBeTruthy()
    expect(hud?.getAttribute("aria-hidden")).toBe("true")
  })
})

describe("HudButtons — actions and glyph customization", () => {
  it("renders only the selected actions, in the given order, with custom glyphs", () => {
    const { container } = render(
      <HudButtons
        actions={["options", "confirm"]}
        confirmGlyph="A"
        confirmLabel="Continue"
        optionsGlyph="+"
        optionsLabel="Options"
      />,
    )
    const hints = container.querySelectorAll(".hud-hint")
    expect(hints.length).toBe(2)

    // First hint is options (`+ Options`), second is confirm (`A Continue`).
    expect(hints[0]?.querySelector(".hud-glyph")?.textContent).toBe("+")
    expect(hints[0]?.querySelector(".hud-label")?.textContent).toBe("Options")

    expect(hints[1]?.querySelector(".hud-glyph")?.textContent).toBe("A")
    expect(hints[1]?.querySelector(".hud-label")?.textContent).toBe("Continue")
  })

  it("renders no hints when actions is empty but keeps the .hud container", () => {
    const { container } = render(<HudButtons actions={[]} />)
    expect(container.querySelector(".hud")).toBeTruthy()
    expect(container.querySelectorAll(".hud-hint").length).toBe(0)
  })

  it("renders a single confirm chip when actions is ['confirm']", () => {
    const { container } = render(
      <HudButtons actions={["confirm"]} confirmLabel="Continue" />,
    )
    const hints = container.querySelectorAll(".hud-hint")
    expect(hints.length).toBe(1)
    expect(hints[0]?.querySelector(".hud-glyph")?.textContent).toBe("A")
    expect(hints[0]?.querySelector(".hud-label")?.textContent).toBe("Continue")

    // B and Y must not appear in the rendered output.
    const allText = container.textContent ?? ""
    expect(allText).not.toContain("Back")
    expect(allText).not.toContain("Options")
  })
})

describe("HudButtons — pulse on input bus emit", () => {
  it("toggles data-active on the matching hint when the input bus emits, then clears it", async () => {
    const { container } = render(
      <HudButtons actions={["confirm"]} confirmLabel="Continue" />,
    )

    act(() => {
      handle.bus.emit({ type: "confirm" })
    })

    await waitFor(() => {
      const hint = container.querySelector(".hud-hint")
      expect(hint?.getAttribute("data-active")).toBe("")
    })

    // Pulse window is 220ms; allow generously for environment scheduling.
    await waitFor(
      () => {
        const hint = container.querySelector(".hud-hint")
        expect(hint?.hasAttribute("data-active")).toBe(false)
      },
      { timeout: 800 },
    )
  })

  it("does not pulse for actions absent from the actions array", async () => {
    const { container } = render(
      <HudButtons actions={["confirm"]} confirmLabel="Continue" />,
    )

    // Dispatch `back`, which the consumer did not include in actions.
    act(() => {
      handle.bus.emit({ type: "back" })
    })

    // Give React + the bus a tick to propagate (no state change should
    // occur), then assert the rendered hint never gained data-active.
    await new Promise(resolve => setTimeout(resolve, 50))
    const hint = container.querySelector(".hud-hint")
    expect(hint?.hasAttribute("data-active")).toBe(false)
  })

  it("survives unmount during an active pulse without throwing", async () => {
    const { container, unmount } = render(
      <HudButtons
        actions={["options"]}
        optionsGlyph="+"
        optionsLabel="Options"
      />,
    )

    act(() => {
      handle.bus.emit({ type: "options" })
    })

    await waitFor(() => {
      const hint = container.querySelector(".hud-hint")
      expect(hint?.getAttribute("data-active")).toBe("")
    })

    // Unmount mid-pulse. The cleanup useEffect must clear the timer so the
    // setTimeout callback doesn't fire setPulse on an unmounted component.
    expect(() => unmount()).not.toThrow()

    // Wait past the pulse window — if the timer wasn't cleared, the
    // callback would attempt setState on an unmounted component, which
    // happy-dom would not crash on but would log a warning. We're not
    // asserting absence-of-warning here; the not.toThrow() above is the
    // contract.
    await new Promise(resolve => setTimeout(resolve, 300))
  })
})
