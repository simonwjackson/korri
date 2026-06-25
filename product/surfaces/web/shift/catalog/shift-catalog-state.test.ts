import { describe, expect, it } from "bun:test"
import { CatalogFactsError } from "@platform/catalog/catalog-facts-source"
import { Cause, Option } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { ShiftCatalogState } from "./shift-catalog-state"

describe("ShiftCatalogState", () => {
  it("renders loading before facts are ready", () => {
    expect(ShiftCatalogState.fromResult(AsyncResult.initial(true))).toEqual({
      _tag: "Loading",
    })
  })

  it("keeps a self-loading snapshot in loading state", () => {
    const state = ShiftCatalogState.fromResult(
      AsyncResult.success({
        ...snapshotBase(),
        peers: [peer("self", true, "loading")],
        health: { ...snapshotBase().health, self: "loading" },
      }),
    )

    expect(state).toEqual({ _tag: "Loading" })
  })

  it("renders defects distinctly from typed load errors", () => {
    const state = ShiftCatalogState.fromResult(
      AsyncResult.failure(Cause.die("boom")),
    )

    expect(state).toEqual({ _tag: "Defect", defect: "boom" })
  })

  it("selects matching presentation cases", () => {
    const ready = ShiftCatalogState.fromResult(
      AsyncResult.success({
        ...snapshotBase(),
        entries: [entry("local/stray")],
        peers: [peer("self", true, "ready")],
        health: { ...snapshotBase().health, self: "ready" },
      }),
    )

    expect(Option.isSome(ShiftCatalogState.select("Ready")(ready))).toBe(true)
    expect(Option.isNone(ShiftCatalogState.select("Empty")(ready))).toBe(true)
  })

  it("preserves folded availability facts on ready games", () => {
    const state = ShiftCatalogState.fromResult(
      AsyncResult.success({
        ...snapshotBase(),
        entries: [entry("remote/stray", "remote-available")],
        peers: [peer("self", true, "ready")],
        health: { ...snapshotBase().health, self: "ready" },
      }),
    )

    expect(state._tag).toBe("Ready")
    if (state._tag === "Ready") {
      expect(state.games[0]?.availability).toBe("remote-available")
    }
  })

  it("renders ready when self has entries even if a peer failed", () => {
    const state = ShiftCatalogState.fromResult(
      AsyncResult.success({
        ...snapshotBase(),
        entries: [entry("local/stray")],
        peers: [peer("self", true, "ready"), peer("aka", false, "failed")],
        health: { ...snapshotBase().health, self: "ready", failedPeers: 1 },
      }),
    )

    expect(state._tag).toBe("Ready")
  })

  it("renders empty when self is ready with no entries", () => {
    const state = ShiftCatalogState.fromResult(
      AsyncResult.success({
        ...snapshotBase(),
        entries: [],
        peers: [peer("self", true, "ready")],
      }),
    )

    expect(state._tag).toBe("Empty")
  })

  it("does not mask a completed failed snapshot just because refresh is waiting", () => {
    const state = ShiftCatalogState.fromResult(
      AsyncResult.success(
        {
          ...snapshotBase(),
          peers: [peer("self", true, "failed", "read failed")],
          health: { ...snapshotBase().health, self: "failed" },
        },
        { waiting: true },
      ),
    )

    expect(state).toMatchObject({
      _tag: "LoadError",
      error: { message: "read failed" },
    })
  })

  it("renders load error when self failed", () => {
    const state = ShiftCatalogState.fromResult(
      AsyncResult.success({
        ...snapshotBase(),
        peers: [peer("self", true, "failed", "read failed")],
        health: { ...snapshotBase().health, self: "failed" },
      }),
    )

    expect(state).toMatchObject({
      _tag: "LoadError",
      error: { message: "read failed" },
    })
  })

  it("preserves transport errors as load errors", () => {
    const error = new CatalogFactsError({
      reason: "unavailable",
      message: "offline",
    })

    expect(ShiftCatalogState.fromResult(AsyncResult.fail(error))).toEqual({
      _tag: "LoadError",
      error,
    })
  })
})

function snapshotBase() {
  return {
    entries: [],
    peers: [peer("self", true, "loading")],
    generation: 1,
    updatedAt: "2026-06-13T00:00:00.000Z",
    health: {
      coordinatorReachable: true,
      self: "loading" as const,
      loadingPeers: 0,
      readyPeers: 0,
      failedPeers: 0,
      generation: 1,
    },
  }
}

function entry(
  id: string,
  availability?: "local-launchable" | "remote-available" | "remote-unreachable",
) {
  return {
    id,
    itemId: id,
    title: "Stray",
    ...(availability ? { availability } : {}),
    releases: [{ id: "default", system: "steam", launchable: true }],
    launchable: true,
    source: {
      hostId: "self",
      controlUrl: "http://127.0.0.1:3001",
      isLocal: true,
    },
  }
}

function peer(
  hostId: string,
  isLocal: boolean,
  status: "loading" | "ready" | "failed",
  error?: string,
) {
  return {
    hostId,
    displayName: hostId,
    controlUrl: `http://${hostId}:3001`,
    isLocal,
    caps: ["source"],
    status,
    entryCount: 0,
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...(error ? { error } : {}),
  }
}
