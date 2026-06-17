import { describe, expect, it } from "bun:test"
import type {
  GamescopeControlCommandMethod,
  GamescopeControlCommandResult,
  GamescopeControlSuccessResponse,
} from "../runtime-control"
import {
  type GamescopeCommandClient,
  setGamescopeFilter,
  setGamescopeFps,
  setGamescopeMode,
  setGamescopeSharpness,
} from "./handlers"

describe("gamescope stream-control handlers", () => {
  it("delegates Gamescope control actions through the runtime-control client", async () => {
    const calls: unknown[] = []
    const response = (
      command: GamescopeControlCommandMethod,
      requested: unknown,
    ): GamescopeControlSuccessResponse<GamescopeControlCommandResult> => ({
      jsonrpc: "2.0",
      id: 1,
      result: {
        _tag: "command.result",
        command,
        requested,
        status: "applied",
        applied: {},
      },
    })
    const client = {
      setMode: async payload => {
        calls.push(["mode", payload])
        return response("mode.set", payload)
      },
      requestCommand: async (method, payload) => {
        calls.push([method, payload])
        return response(method, payload)
      },
      setFilter: async payload => {
        calls.push(["filter", payload])
        return response("filter.set", payload)
      },
      setSharpness: async payload => {
        calls.push(["sharpness", payload])
        return response("sharpness.set", payload)
      },
    } satisfies GamescopeCommandClient

    await setGamescopeMode(client, { width: 960, height: 540 })
    await setGamescopeFps(client, { fps: 60 })
    await setGamescopeFilter(client, { filter: "fsr" })
    await setGamescopeSharpness(client, { sharpness: 8 })

    expect(calls).toEqual([
      ["mode", { width: 960, height: 540 }],
      ["fps.set", { fps: 60 }],
      ["filter", { filter: "fsr" }],
      ["sharpness", { sharpness: 8 }],
    ])
  })
})
