import { describe, expect, it } from "bun:test"
import { render, screen } from "@testing-library/react"
import { ShiftNetworkIcon } from "./ShiftNetworkIcon"

describe("ShiftNetworkIcon", () => {
  it("renders a connected label with signal when connected", () => {
    render(
      <ShiftNetworkIcon network={{ _tag: "Connected", strengthPercent: 82 }} />,
    )

    expect(screen.getByLabelText("Strong Wi-Fi (82%)")).toBeTruthy()
  })

  it("renders a disconnected label when disconnected", () => {
    render(<ShiftNetworkIcon network={{ _tag: "Disconnected" }} />)

    expect(screen.getByLabelText("Disconnected")).toBeTruthy()
  })

  it("renders nothing for unknown network state", () => {
    const { container } = render(
      <ShiftNetworkIcon network={{ _tag: "Unknown" }} />,
    )

    expect(container.textContent).toBe("")
    expect(container.querySelector("svg")).toBeNull()
  })
})
