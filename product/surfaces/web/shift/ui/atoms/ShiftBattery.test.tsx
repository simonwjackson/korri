import { describe, expect, it } from "bun:test"
import { render, screen } from "@testing-library/react"
import { ShiftBattery } from "./ShiftBattery"

describe("ShiftBattery", () => {
  it("renders icon-only battery without numeric text", () => {
    const { container } = render(<ShiftBattery level="medium" />)

    expect(screen.getByLabelText("Battery medium")).toBeTruthy()
    expect(container.textContent).toBe("")
  })

  it("renders battery percentage when provided", () => {
    render(<ShiftBattery level="full" percent={82} />)

    expect(screen.getByLabelText("Battery 82%")).toBeTruthy()
    expect(screen.getByText("82%")).toBeTruthy()
  })

  it("includes charging state in the accessible label", () => {
    render(<ShiftBattery level="low" charging percent={18} />)

    expect(screen.getByLabelText("Battery 18%, charging")).toBeTruthy()
  })
})
