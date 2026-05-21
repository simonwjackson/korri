import { describe, expect, it } from "bun:test"
import type { ConnectionState } from "./connection"
import { toBridgeState } from "./to-bridge-state"

describe("toBridgeState", () => {
  it("serializes searching with ISO-string timestamps", () => {
    const since = new Date("2026-05-21T12:00:00.000Z")
    const helpAfter = new Date("2026-05-21T12:00:30.000Z")
    const state: ConnectionState = { status: "searching", since, helpAfter }
    expect(toBridgeState(state)).toEqual({
      status: "searching",
      since: since.toISOString(),
      helpAfter: helpAfter.toISOString(),
    })
  })

  it("serializes reconnecting with the remembered server", () => {
    const server = { hostId: "aka", controlUrl: "http://aka:3010" }
    const since = new Date("2026-05-21T12:00:00.000Z")
    const helpAfter = new Date("2026-05-21T12:00:30.000Z")
    const state: ConnectionState = {
      status: "reconnecting",
      server,
      since,
      helpAfter,
    }
    expect(toBridgeState(state)).toEqual({
      status: "reconnecting",
      server,
      since: since.toISOString(),
      helpAfter: helpAfter.toISOString(),
    })
  })

  it("serializes connected with just the server record", () => {
    const server = { hostId: "aka", controlUrl: "http://aka:3010" }
    const state: ConnectionState = { status: "connected", server }
    expect(toBridgeState(state)).toEqual({ status: "connected", server })
  })
})
