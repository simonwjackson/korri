import { describe, expect, it } from "bun:test"
import {
  controlLaunchResultFromLaunchLibraryResponse,
  korriRpcUrlForBase,
} from "./korri-control-rpc"

describe("KorriControl RPC client", () => {
  it("normalizes daemon base URLs to the RPC endpoint", () => {
    expect(korriRpcUrlForBase("http://bandai:3001")).toBe(
      "http://bandai:3001/api/rpc",
    )
    expect(korriRpcUrlForBase("http://bandai:3001/")).toBe(
      "http://bandai:3001/api/rpc",
    )
    expect(korriRpcUrlForBase("http://bandai:3001/api/rpc")).toBe(
      "http://bandai:3001/api/rpc",
    )
    expect(korriRpcUrlForBase("bandai")).toBe("http://bandai:3001/api/rpc")
  })

  it("maps launch RPC response tags to control launch results", () => {
    expect(
      controlLaunchResultFromLaunchLibraryResponse("game-1", {
        _tag: "Accepted",
        status: "launched",
      }),
    ).toEqual({ _tag: "Launched", selection: { id: "game-1" } })
    expect(
      controlLaunchResultFromLaunchLibraryResponse("game-1", {
        _tag: "PreflightRejected",
        status: "failed",
        exitCode: 121,
        stderrTail: "busy",
      }),
    ).toEqual({
      _tag: "PreflightRejected",
      selection: { id: "game-1" },
      message: "busy",
    })
    expect(
      controlLaunchResultFromLaunchLibraryResponse("game-1", {
        _tag: "DaemonRejected",
        status: "failed",
        exitCode: 121,
      }),
    ).toEqual({
      _tag: "DaemonRejected",
      selection: { id: "game-1" },
      message: "session daemon rejected launch",
    })
    expect(
      controlLaunchResultFromLaunchLibraryResponse("game-1", {
        _tag: "HostUnavailable",
        status: "failed",
        exitCode: 124,
        stderrTail: "offline",
      }),
    ).toEqual({
      _tag: "HostUnavailable",
      selection: { id: "game-1" },
      message: "offline",
    })
    expect(
      controlLaunchResultFromLaunchLibraryResponse("game-1", {
        _tag: "LaunchFailed",
        status: "failed",
        exitCode: 1,
        failureKind: "command-failed",
        stderrTail: "boom",
      }),
    ).toEqual({
      _tag: "LaunchFailed",
      selection: { id: "game-1" },
      exitCode: 1,
      failureKind: "command-failed",
      stderrTail: "boom",
    })
  })
})
