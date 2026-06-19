import { describe, expect, it } from "bun:test"
import { parseSteamInstallLogSignal } from "./install-signals"

describe("Steam install log signals", () => {
  it("recognizes AppID download lines", () => {
    expect(
      parseSteamInstallLogSignal("AppID 1029210 App Downloading"),
    ).toMatchObject({ appId: "1029210", state: "downloading" })
  })

  it("prioritizes failure over progress words", () => {
    expect(
      parseSteamInstallLogSignal("AppID 1029210 download failed"),
    ).toMatchObject({ appId: "1029210", state: "failed" })
  })

  it("ignores unrelated lines", () => {
    expect(parseSteamInstallLogSignal("nothing useful")).toBeUndefined()
  })
})
