import { describe, expect, test } from "bun:test"
import { render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { createInputBus } from "../input/bus"
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

  test("reaches Shift only through its public surface entry", () => {
    const source = readFileSync("src/overlay/OverlayRoot.tsx", "utf8")
    expect(source).toContain('import { ShiftSurface } from "@korri/shift"')
    expect(source).not.toContain("ShiftGameplayOverlaySheet")
    expect(source).not.toContain("contracts/generated")
    expect(source).not.toContain("korri-native-bridge")
  })
})
