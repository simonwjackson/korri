import { describe, expect, test } from "bun:test"
import type { StreamLifecycleEvent } from "@contracts/bridge/korri-native-bridge"
import { FIXTURE_TIMELINE_EVENTS, SessionLifecycleState, STAGE_ORDER } from "./state"

describe("SessionLifecycleState.fromEvents", () => {
  test("empty snapshot yields a connecting state with all stages pending", () => {
    const state = SessionLifecycleState.fromEvents([])
    expect(state._tag).toBe("Connecting")
    if (state._tag !== "Connecting") throw new Error("unreachable")
    expect(state.currentStage).toBeNull()
    expect(state.completed).toEqual([])
  })

  test("snapshot pull seeds state and stage events advance the timeline in order", () => {
    const events: StreamLifecycleEvent[] = [
      { type: "stage-starting", stage: "launching-app", detail: "Skate 3" },
      { type: "stage-complete", stage: "launching-app" },
      { type: "stage-starting", stage: "initializing" },
    ]
    const seeded = SessionLifecycleState.fromEvents(events)
    expect(seeded._tag).toBe("Connecting")
    if (seeded._tag !== "Connecting") throw new Error("unreachable")
    expect(seeded.completed).toEqual(["launching-app"])
    expect(seeded.currentStage).toBe("initializing")

    const advanced = SessionLifecycleState.applyEvent(seeded, {
      type: "stage-complete",
      stage: "initializing",
    })
    if (advanced._tag !== "Connecting") throw new Error("expected Connecting")
    expect(advanced.completed).toEqual(["launching-app", "initializing"])
  })

  test("replayed or duplicate stage events do not regress the timeline", () => {
    const state = SessionLifecycleState.fromEvents([
      { type: "stage-starting", stage: "launching-app" },
      { type: "stage-complete", stage: "launching-app" },
      { type: "stage-starting", stage: "handshaking" },
      // replayed events for a stage already passed
      { type: "stage-starting", stage: "launching-app" },
      { type: "stage-starting", stage: "initializing" },
    ])
    if (state._tag !== "Connecting") throw new Error("expected Connecting")
    expect(state.currentStage).toBe("handshaking")
    expect(state.completed).toEqual(["launching-app"])
  })

  test("connected is terminal: later stage events are ignored", () => {
    const state = SessionLifecycleState.fromEvents([
      { type: "stage-starting", stage: "establishing-streams" },
      { type: "connected" },
      { type: "stage-starting", stage: "initializing" },
    ])
    expect(state._tag).toBe("Connected")
  })

  test("stage failure produces a failed state carrying the tagged reason", () => {
    const state = SessionLifecycleState.fromEvents([
      { type: "stage-starting", stage: "handshaking" },
      {
        type: "failed",
        reason: "HostUnreachable",
        stage: "handshaking",
        errorCode: -408,
        detail: "RTSP handshake",
      },
    ])
    expect(state._tag).toBe("Failed")
    if (state._tag !== "Failed") throw new Error("unreachable")
    expect(state.reason).toBe("HostUnreachable")
    expect(state.errorCode).toBe(-408)
  })

  test("non-graceful termination becomes a failed state; graceful becomes Ended", () => {
    const failed = SessionLifecycleState.fromEvents([
      { type: "connected" },
      {
        type: "terminated",
        graceful: false,
        reason: "NoVideoTraffic",
        errorCode: -100,
      },
    ])
    expect(failed._tag).toBe("Failed")

    const ended = SessionLifecycleState.fromEvents([
      { type: "connected" },
      { type: "terminated", graceful: true, reason: "Unknown", errorCode: 0 },
    ])
    expect(ended._tag).toBe("Ended")
  })

  test("stage rows derive pending/active/done for rendering", () => {
    const state = SessionLifecycleState.fromEvents([
      { type: "stage-starting", stage: "launching-app" },
      { type: "stage-complete", stage: "launching-app" },
      { type: "stage-starting", stage: "initializing" },
    ])
    if (state._tag !== "Connecting") throw new Error("expected Connecting")
    const rows = SessionLifecycleState.stageRows(state)
    expect(rows.map(row => row.status)).toEqual([
      "done",
      "active",
      "pending",
      "pending",
    ])
    expect(rows.map(row => row.stage)).toEqual([...STAGE_ORDER])
  })

  test("the browser-dev fixture timeline folds to a connected state", () => {
    const state = SessionLifecycleState.fromEvents(FIXTURE_TIMELINE_EVENTS)
    expect(state._tag).toBe("Connected")
  })
})
