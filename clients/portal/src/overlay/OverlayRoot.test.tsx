import { describe, expect, test } from "bun:test"
import { act, render, screen, waitFor } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { createInputBus } from "../input/bus"
import { createKeyboardAdapter } from "../input/keyboard-adapter"
import { createSpatialFocusController } from "../input/spatial-focus"
import { OverlayRoot } from "./OverlayRoot"
import { createInMemoryOverlayController } from "./in-memory-overlay-controller"

describe("OverlayRoot browser fixture", () => {
  test("mounts normal ShiftSurface and renders every materialized form", async () => {
    render(
      <OverlayRoot
        bus={createInputBus()}
        controller={createInMemoryOverlayController()}
      />,
    )

    expect(await screen.findByRole("dialog", {
      name: "Gameplay controls for Browser gameplay fixture",
    })).toBeDefined()
    expect(screen.getByRole("button", { name: "Open menu" })).toBeDefined()
    expect(screen.getByRole("switch", { name: "Fill screen" })).toBeDefined()
    expect(screen.getByRole("combobox", { name: "Mouse mode" })).toBeDefined()
    expect(screen.getByRole("slider", { name: "Sharpness" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Unavailable control" })).toBeDefined()
    expect(
      screen.getByRole("button", { name: "Quit fixture" }).getAttribute("data-tone"),
    ).toBe("danger")
  })

  test("routes focused choice and range arrows through the keyboard semantic bus", async () => {
    const bus = createInputBus()
    bus.use(createKeyboardAdapter())
    const stopFocus = createSpatialFocusController(bus)
    render(
      <OverlayRoot
        bus={bus}
        controller={createInMemoryOverlayController()}
      />,
    )
    const choice = await screen.findByRole<HTMLSelectElement>("combobox", {
      name: "Mouse mode",
    })
    choice.focus()
    const choiceArrow = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    })
    act(() => window.dispatchEvent(choiceArrow))
    await waitFor(() => expect(choice.value).toBe("direct"))
    expect(choiceArrow.defaultPrevented).toBe(true)

    const range = screen.getByRole<HTMLInputElement>("slider", { name: "Sharpness" })
    range.focus()
    const rangeArrow = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      repeat: true,
      bubbles: true,
      cancelable: true,
    })
    act(() => window.dispatchEvent(rangeArrow))
    await waitFor(() => expect(range.value).toBe("55"))
    expect(rangeArrow.defaultPrevented).toBe(true)
    stopFocus()
  })

  test("renders an unreachable fixture while Resume remains usable", async () => {
    render(
      <OverlayRoot
        bus={createInputBus()}
        controller={createInMemoryOverlayController("unavailable")}
      />,
    )

    expect(await screen.findByText(
      "Gameplay controls are unavailable right now. Resume still works.",
    )).toBeDefined()
    expect(screen.getByRole("button", { name: "Resume" })).toBeDefined()
  })

  test("marks transparent gameplay mode before render without making the panel transparent", () => {
    const main = readFileSync("src/main.tsx", "utf8")
    const portalCss = readFileSync("src/index.css", "utf8")
    const shiftCss = readFileSync("../../surfaces/shift/src/shift.css", "utf8")

    expect(main.indexOf("dataset.korriGameplayOverlay")).toBeLessThan(
      main.indexOf("root.render(<OverlayRoot"),
    )
    expect(portalCss).toContain("html[data-korri-gameplay-overlay]")
    expect(portalCss).toContain("background-color: transparent")
    expect(shiftCss).toContain("[data-shift-gameplay-overlay]")
    expect(shiftCss).toContain("background-color: transparent")
    expect(shiftCss).toContain("background: var(--shift-scrim-mid)")
    expect(shiftCss).toContain("background: var(--shift-surface-raised)")
    expect(shiftCss).not.toContain(".shift-sheet-panel {\n\tbackground: transparent")
  })

  test("reaches Shift only through its public surface entry", () => {
    const source = readFileSync("src/overlay/OverlayRoot.tsx", "utf8")
    expect(source).toContain('import { ShiftSurface } from "@korri/shift"')
    expect(source).not.toContain("ShiftGameplayOverlaySheet")
    expect(source).not.toContain("contracts/generated")
    expect(source).not.toContain("korri-native-bridge")
  })
})
