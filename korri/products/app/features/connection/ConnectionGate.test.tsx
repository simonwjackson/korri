import { afterEach, describe, expect, it } from "bun:test"
import { act, cleanup, render, screen } from "@testing-library/react"
import type { ConnectionStateBridgeState } from "../../../../deploy/desktop/connection-state-bridge"
import { ConnectionGate } from "./ConnectionGate"

afterEach(() => {
  cleanup()
  delete (window as { __korriConnection?: unknown }).__korriConnection
})

function installBridge(initial: ConnectionStateBridgeState) {
  let current = initial
  const listeners = new Set<(state: ConnectionStateBridgeState) => void>()
  ;(window as unknown as { __korriConnection: unknown }).__korriConnection = {
    getState: () => current,
    subscribe: (listener: (state: ConnectionStateBridgeState) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    push: (next: ConnectionStateBridgeState) => {
      current = next
      for (const listener of listeners) listener(next)
    },
  }
  return {
    push(next: ConnectionStateBridgeState) {
      current = next
      for (const listener of listeners) listener(next)
    },
  }
}

const SEARCHING: ConnectionStateBridgeState = {
  status: "searching",
  since: new Date(0).toISOString(),
  helpAfter: new Date(Date.now() + 60_000).toISOString(),
}

const RECONNECTING: ConnectionStateBridgeState = {
  status: "reconnecting",
  server: { hostId: "aka", controlUrl: "http://aka:3010" },
  since: new Date(0).toISOString(),
  helpAfter: new Date(Date.now() + 60_000).toISOString(),
}

const CONNECTED: ConnectionStateBridgeState = {
  status: "connected",
  server: { hostId: "aka", controlUrl: "http://aka:3010" },
}

describe("ConnectionGate", () => {
  it("renders children when bridge is missing (portal/Storybook stub)", () => {
    render(
      <ConnectionGate>
        <div>routed content</div>
      </ConnectionGate>,
    )
    expect(screen.queryByTestId("searching-state")).toBeNull()
    expect(screen.getByText("routed content")).toBeTruthy()
  })

  it("renders children when bridge state is connected", () => {
    installBridge(CONNECTED)
    render(
      <ConnectionGate>
        <div>routed content</div>
      </ConnectionGate>,
    )
    expect(screen.queryByTestId("searching-state")).toBeNull()
    expect(screen.getByText("routed content")).toBeTruthy()
  })

  it("renders SearchingState when bridge state is searching", () => {
    installBridge(SEARCHING)
    render(
      <ConnectionGate>
        <div>routed content</div>
      </ConnectionGate>,
    )
    expect(screen.getByTestId("searching-state").dataset.status).toBe(
      "searching",
    )
    expect(screen.queryByText("routed content")).toBeNull()
  })

  it("renders SearchingState with the remembered server name when reconnecting", () => {
    installBridge(RECONNECTING)
    render(
      <ConnectionGate>
        <div>routed content</div>
      </ConnectionGate>,
    )
    expect(screen.getByTestId("searching-state").dataset.status).toBe(
      "reconnecting",
    )
    expect(screen.getByText(/Looking for aka/)).toBeTruthy()
  })

  it("transitions from searching to connected and mounts children", async () => {
    const bridge = installBridge(SEARCHING)
    const { findByText, queryByText } = render(
      <ConnectionGate>
        <div>routed content</div>
      </ConnectionGate>,
    )
    expect(queryByText("routed content")).toBeNull()

    act(() => {
      bridge.push(CONNECTED)
    })
    expect(await findByText("routed content")).toBeTruthy()
  })
})
