import { describe, expect, it } from "bun:test"
import { classifyGamescopeAbortWindow } from "./diagnose-bandai-gamescope-abort"

describe("Gamescope abort classifier", () => {
  it("classifies compositor abort after the AppID reached running", () => {
    const result = classifyGamescopeAbortWindow({
      appId: "360740",
      serviceJournal: [
        "gamescope: ../src/rendervulkan.cpp:1252: Assertion `0' failed.",
        "[gamescopereaper] Parent of gamescopereaper was killed. Killing children.",
        "korri-steam-gamescope.service: Main process exited, code=killed, status=6/ABRT",
      ],
      steamLogs: [
        "Game process added : AppID 360740",
        "SteamLaunch AppId=360740 -- /var/lib/korri/steam/steamapps/common/Downwell/Downwell.exe",
      ],
    })

    expect(result.classification).toBe("gamescope-abort-after-game-running")
    expect(result.compositorAbort).toBe(true)
    expect(result.gameReachedRunning).toBe(true)
    expect(result.gameExitCausedByAbort).toBe(true)
    expect(result.assertionLines[0]).toContain("rendervulkan.cpp")
  })

  it("classifies normal game exit when service does not abort", () => {
    const result = classifyGamescopeAbortWindow({
      appId: "360740",
      serviceJournal: [],
      steamLogs: [
        "Game process added : AppID 360740",
        "Game process removed: AppID 360740",
      ],
    })

    expect(result.classification).toBe("normal-game-exit")
    expect(result.compositorAbort).toBe(false)
  })
})
