import { describe, expect, it } from "bun:test"
import { render, screen } from "@testing-library/react"
import { ShiftNetworkIcon } from "./ShiftNetworkIcon"

describe("ShiftNetworkIcon", () => {
  it("renders the network name and signal strength when connected", () => {
    const { container } = render(
      <ShiftNetworkIcon
        network={{ _tag: "Connected", name: "KorriNet", strengthPercent: 82 }}
      />,
    )

    expect(screen.getByLabelText("KorriNet · Strong Wi-Fi (82%)")).toBeTruthy()
    expect(screen.getByText("KorriNet")).toBeTruthy()
    expect(
      container.querySelector("[data-shift-network-strength='strong']"),
    ).toBeTruthy()
  })

  it("falls back to Wi-Fi rather than Connected when the SSID is unavailable", () => {
    render(
      <ShiftNetworkIcon
        network={{ _tag: "Connected", name: null, strengthPercent: 82 }}
      />,
    )

    expect(screen.getByText("Wi-Fi")).toBeTruthy()
    expect(screen.queryByText("Connected")).toBeNull()
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
