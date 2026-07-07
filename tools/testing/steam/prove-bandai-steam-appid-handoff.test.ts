import { describe, expect, it } from "bun:test"

import {
  classifyProbeTranscript,
  stepPassed,
} from "./prove-bandai-steam-appid-handoff"

describe("Bandai Steam AppID handoff proof classifier", () => {
  const downwell = {
    appId: "360740",
    expectedExe: "Downwell.exe",
    name: "Downwell",
  }

  it("accepts desktop Steam in Gamescope with Cachy Proton and screenshot proof", () => {
    const classification = classifyProbeTranscript(
      `###SERVICE
active
ActiveState=active
Result=success
###PROCESSES
123 S 00:10 steamwebhelper -uimode=7 --type=renderer
234 S 00:01 SteamLaunch AppId=360740 -- /nix/store/abc-proton-cachyos-arm64-11/share/korri/proton-cachyos-arm64/dist/proton waitforexitandrun /var/lib/korri/steam/steamapps/common/Downwell/Downwell.exe
345 S 00:01 Downwell.exe
###CONSOLE
Game process added : AppID 360740 "/nix/store/abc-proton-cachyos-arm64-11/share/korri/proton-cachyos-arm64/dist/proton" ProcID 234
###JOURNAL
Jul 07 service still running
###SWAY
"name":"Downwell"
###SCREENSHOT
SCREENSHOT_OK /tmp/proof.png
-rw-r--r-- 1 korri users 100 /tmp/proof.png
`,
      downwell,
    )

    expect(classification).toMatchObject({
      serviceActive: true,
      steamDesktopPersona: true,
      steamGamepadPersona: false,
      gameProcessAdded: true,
      expectedProcess: true,
      realProtonCachyos: true,
      screenshotCaptured: true,
      swayTitleObserved: true,
      gamescopeAbort: false,
    })
    expect(stepPassed(classification)).toBe(true)
  })

  it("rejects Gamepad UI even when the game process is otherwise healthy", () => {
    const classification = classifyProbeTranscript(
      `###SERVICE
active
###PROCESSES
123 S 00:10 steamwebhelper -uimode=4 --type=renderer
234 S 00:01 SteamLaunch AppId=360740 -- /nix/store/abc-proton-cachyos-arm64-11/share/korri/proton-cachyos-arm64/dist/proton waitforexitandrun Downwell.exe
###CONSOLE
Game process added : AppID 360740
###JOURNAL
###SWAY
"name":"Downwell"
###SCREENSHOT
SCREENSHOT_OK /tmp/proof.png
`,
      downwell,
    )

    expect(classification.steamGamepadPersona).toBe(true)
    expect(stepPassed(classification)).toBe(false)
  })

  it("rejects Gamescope ABRT/status=134 as compositor failure", () => {
    const classification = classifyProbeTranscript(
      `###SERVICE
active
###PROCESSES
123 S 00:10 steamwebhelper -uimode=7
234 S 00:01 SteamLaunch AppId=360740 -- /nix/store/abc-proton-cachyos-arm64-11/share/korri/proton-cachyos-arm64/dist/proton waitforexitandrun Downwell.exe
###CONSOLE
Game process added : AppID 360740
###JOURNAL
korri-steam-gamescope.service: Main process exited, code=dumped, status=134/ABRT
###SWAY
"name":"Downwell"
###SCREENSHOT
SCREENSHOT_OK /tmp/proof.png
`,
      downwell,
    )

    expect(classification.gamescopeAbort).toBe(true)
    expect(stepPassed(classification)).toBe(false)
  })
})
