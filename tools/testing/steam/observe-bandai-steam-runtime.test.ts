import { describe, expect, it } from "bun:test"
import { classifyTranscript } from "./observe-bandai-steam-runtime"

describe("Bandai Steam runtime observer classification", () => {
  it("recognizes packaged Nix-store Cachy Proton launches", () => {
    const classification = classifyTranscript(`
      /nix/store/abc123-proton-cachyos-arm64/dist/proton waitforexitandrun
      /var/lib/korri/steam/steamapps/common/Downwell/Downwell.exe
    `)

    expect(classification.launchChain).toBe("intended_cachyos_arm64")
    expect(classification.signals.realProtonCachyos).toBe(true)
  })

  it("does not treat stale removals before the current mark as current", () => {
    const classification = classifyTranscript(
      `Game process removed: AppID 360740\n---CURRENT-LAUNCH-MARK---\nSteamLaunch AppId=360740`,
      { appId: "360740", sinceMarker: "---CURRENT-LAUNCH-MARK---" },
    )

    expect(classification.signals.processRemoved).toBe(false)
  })

  it("treats current removal as wrapper evidence when AppID is still running", () => {
    const classification = classifyTranscript(
      `Game process removed: AppID 360740\nsteam_app_360740\nDownwell.exe`,
      { appId: "360740", expectedExe: "Downwell.exe" },
    )

    expect(classification.signals.wrapperRemoved).toBe(true)
    expect(classification.signals.processRemoved).toBe(false)
  })

  it("does not use historical logs as live process evidence", () => {
    const classification = classifyTranscript(
      `Game process removed: AppID 360740\nSteamLaunch AppId=360740`,
      { appId: "360740", liveEvidenceTranscript: "" },
    )

    expect(classification.signals.wrapperRemoved).toBe(false)
    expect(classification.signals.processRemoved).toBe(true)
  })
})
