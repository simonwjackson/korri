import { describe, expect, it } from "bun:test"
import { render, screen } from "@testing-library/react"
import { ShiftStatusBar } from "./ShiftStatusBar"

describe("ShiftStatusBar", () => {
  it("omits the battery slot when no battery is available", () => {
    render(<ShiftStatusBar network={{ _tag: "Unknown" }} />)

    expect(screen.queryByLabelText(/Battery/)).toBeNull()
  })

  it("passes battery percentage through to the battery atom", () => {
    render(
      <ShiftStatusBar
        network={{ _tag: "Unknown" }}
        battery={{ level: "full", charging: false, percent: 82 }}
      />,
    )

    expect(screen.getByText("82%")).toBeTruthy()
    expect(screen.getByLabelText("Battery 82%")).toBeTruthy()
  })
})
