import { describe, expect, it } from "bun:test"
import type { LaunchSpec } from "@contracts/generated/korrid"
import {
  launchGameCopies,
  type GameCopyLaunchPorts,
} from "./launch-game-copies"

const spec: LaunchSpec = {
  launcherId: "retroarch",
  component: { packageName: "retroarch", className: "Activity" },
  extras: {},
  directories: [],
  files: [],
  integrity: "signed",
}

function ports(overrides: Partial<GameCopyLaunchPorts> = {}): GameCopyLaunchPorts {
  return {
    localGameLaunch: async () => ({ _tag: "Ok", payload: spec }),
    launchLocal: async () => ({ _tag: "Launched" }),
    streamTarget: host =>
      host === "zao" ? { hostUuid: "zao-uuid", appId: 20 } : undefined,
    sessionPrepare: async gameId => ({ _tag: "Ok", payload: { gameId } }),
    startStream: async () => ({ _tag: "StreamStarted" }),
    ...overrides,
  }
}

const local = {
  kind: "local" as const,
  game: { id: "wl4", title: "Wario Land 4", system: "GBA" },
}
const zao = {
  kind: "remote" as const,
  game: { id: "wl4", title: "Wario Land 4", host: "zao" },
}

describe("launchGameCopies", () => {
  it("uses the local representative without preparing a peer", async () => {
    let prepares = 0
    const result = await launchGameCopies(
      [local, zao],
      ports({
        sessionPrepare: async gameId => {
          prepares += 1
          return { _tag: "Ok", payload: { gameId } }
        },
      }),
      () => true,
    )

    expect(result).toEqual({ _tag: "Started" })
    expect(prepares).toBe(0)
  })

  it("falls back to Zao when the local copy cannot launch", async () => {
    const prepared: Array<[string, string | undefined]> = []
    const result = await launchGameCopies(
      [local, zao],
      ports({
        localGameLaunch: async () => ({
          _tag: "Err",
          payload: { code: "RomMissing", message: "gone" },
        }),
        sessionPrepare: async (gameId, host) => {
          prepared.push([gameId, host])
          return { _tag: "Ok", payload: { gameId } }
        },
      }),
      () => true,
    )

    expect(prepared).toEqual([["wl4", "zao"]])
    expect(result).toEqual({
      _tag: "StreamResult",
      result: { _tag: "StreamStarted" },
    })
  })

  it("reports every unavailable copy without arming an unseen host", async () => {
    const result = await launchGameCopies(
      [local, zao],
      ports({
        localGameLaunch: async () => ({
          _tag: "Err",
          payload: { code: "RomMissing", message: "gone" },
        }),
        streamTarget: () => undefined,
      }),
      () => true,
    )

    expect(result).toEqual({
      _tag: "Unavailable",
      message: "this device: RomMissing · zao: NoStreamTarget",
    })
  })
})
