import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import type { ConnectionStateBridgeState } from "../../../../deploy/desktop/connection-state-bridge"
import { SearchingState } from "./SearchingState"

afterEach(() => cleanup())

const longAfter = (msFromNow: number) =>
  new Date(Date.now() + msFromNow).toISOString()

const searching = (helpAfterIso: string): ConnectionStateBridgeState => ({
  status: "searching",
  since: new Date(0).toISOString(),
  helpAfter: helpAfterIso,
})

const reconnecting = (helpAfterIso: string): ConnectionStateBridgeState => ({
  status: "reconnecting",
  server: { hostId: "aka", controlUrl: "http://aka:3010" },
  since: new Date(0).toISOString(),
  helpAfter: helpAfterIso,
})

describe("SearchingState", () => {
  it("renders searching copy and hides help text before helpAfter", () => {
    const state = searching(longAfter(60_000))
    if (state.status === "connected") throw new Error("unexpected status")
    render(<SearchingState state={state} />)
    expect(screen.getByText(/Looking for a Korri server/)).toBeTruthy()
    expect(screen.getByText(/Ethernet/)).toBeTruthy()
    expect(screen.queryByTestId("searching-state-help")).toBeNull()
  })

  it("renders reconnecting copy with the remembered server name", () => {
    const state = reconnecting(longAfter(60_000))
    if (state.status === "connected") throw new Error("unexpected status")
    render(<SearchingState state={state} />)
    expect(screen.getByText(/Looking for aka/)).toBeTruthy()
  })

  it("shows help text immediately when helpAfter has already elapsed", () => {
    const state = searching(new Date(Date.now() - 1000).toISOString())
    if (state.status === "connected") throw new Error("unexpected status")
    render(<SearchingState state={state} />)
    expect(screen.getByTestId("searching-state-help")).toBeTruthy()
    expect(screen.getByText(/wired network/)).toBeTruthy()
  })
})
