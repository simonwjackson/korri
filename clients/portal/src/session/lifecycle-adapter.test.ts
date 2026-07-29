import { describe, expect, it } from "bun:test"
import type { KorriSessionBridgeSurface } from "@contracts/bridge/korri-native-bridge"
import {
  createSessionLifecycleAdapter,
  parseStreamLifecycleEvent,
} from "./lifecycle-adapter"
import type { SessionLifecycleState } from "./state"

describe("parseStreamLifecycleEvent", () => {
  it("parses stage, connected, failed, and terminated events", () => {
    expect(
      parseStreamLifecycleEvent(
        JSON.stringify({ type: "stage-starting", stage: "handshaking" }),
      ),
    ).toEqual({ type: "stage-starting", stage: "handshaking" })
    expect(parseStreamLifecycleEvent(JSON.stringify({ type: "connected" }))).toEqual(
      { type: "connected" },
    )
    expect(
      parseStreamLifecycleEvent(
        JSON.stringify({
          type: "failed",
          reason: "HostUnreachable",
          stage: "handshaking",
          errorCode: -408,
        }),
      ),
    ).toEqual({
      type: "failed",
      reason: "HostUnreachable",
      stage: "handshaking",
      errorCode: -408,
    })
    expect(
      parseStreamLifecycleEvent(
        JSON.stringify({
          type: "terminated",
          graceful: true,
          reason: "Unknown",
          errorCode: 0,
        }),
      ),
    ).toEqual({ type: "terminated", graceful: true, reason: "Unknown", errorCode: 0 })
  })

  it("rejects malformed payloads", () => {
    expect(parseStreamLifecycleEvent("not json")).toBeNull()
    expect(parseStreamLifecycleEvent("7")).toBeNull()
    expect(
      parseStreamLifecycleEvent(JSON.stringify({ type: "stage-starting" })),
    ).toBeNull()
    expect(
      parseStreamLifecycleEvent(
        JSON.stringify({ type: "stage-starting", stage: "warp-drive" }),
      ),
    ).toBeNull()
    expect(
      parseStreamLifecycleEvent(JSON.stringify({ type: "failed", reason: 3 })),
    ).toBeNull()
  })
})

describe("createSessionLifecycleAdapter", () => {
  it("seeds from the snapshot pull, then folds pushed events", () => {
    const surface: KorriSessionBridgeSurface = {
      lifecycleSnapshot: () =>
        JSON.stringify({
          events: [
            { type: "stage-starting", stage: "launching-app" },
            { type: "stage-complete", stage: "launching-app" },
          ],
        }),
      exitToPortal: () => {},
    }
    const states: SessionLifecycleState[] = []
    const stop = createSessionLifecycleAdapter(surface).start(state =>
      states.push(state),
    )

    const seeded = states.at(-1)
    if (seeded?._tag !== "Connecting") throw new Error("expected Connecting")
    expect(seeded.completed).toEqual(["launching-app"])

    const host = window as unknown as Record<string, unknown>
    const push = host.__korriSessionEvent as (json: string) => void
    expect(typeof push).toBe("function")

    push(JSON.stringify({ type: "stage-starting", stage: "initializing" }))
    push("garbage")
    push(JSON.stringify({ type: "connected" }))

    expect(states.at(-1)?._tag).toBe("Connected")

    stop()
    expect(host.__korriSessionEvent).toBeUndefined()
  })

  it("tolerates a malformed snapshot by starting from the initial state", () => {
    const surface: KorriSessionBridgeSurface = {
      lifecycleSnapshot: () => "garbage",
      exitToPortal: () => {},
    }
    const states: SessionLifecycleState[] = []
    const stop = createSessionLifecycleAdapter(surface).start(state =>
      states.push(state),
    )
    const seeded = states.at(-1)
    if (seeded?._tag !== "Connecting") throw new Error("expected Connecting")
    expect(seeded.completed).toEqual([])
    stop()
  })
})
