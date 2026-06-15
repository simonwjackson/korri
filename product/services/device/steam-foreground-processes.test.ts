import { describe, expect, it } from "bun:test"
import {
  collectSteamForegroundProcesses,
  isSteamForegroundProcess,
  type SteamForegroundProcessInfo,
} from "./steam-foreground-processes"

const steamLaunch = (appId = "584400"): SteamForegroundProcessInfo => ({
  pid: 42,
  uid: 1000,
  cmdline: [
    "/var/lib/korri/steam/steamrtarm64/reaper",
    "SteamLaunch",
    `AppId=${appId}`,
    "--",
    "/var/lib/korri/steam/steamapps/common/Sonic Mania/SonicMania.exe",
  ],
})

describe("Steam foreground process classification", () => {
  it("matches SteamLaunch foreground roots and can filter by AppID", () => {
    expect(isSteamForegroundProcess(steamLaunch("584400"))).toBe(true)
    expect(
      collectSteamForegroundProcesses([steamLaunch("584400")], {
        appId: "584400",
      }).map(process => process.pid),
    ).toEqual([42])
    expect(
      collectSteamForegroundProcesses([steamLaunch("452060")], {
        appId: "584400",
      }),
    ).toEqual([])
  })

  it("matches Steam game executables under steamapps/common", () => {
    expect(
      isSteamForegroundProcess({
        pid: 43,
        uid: 1000,
        cmdline: [
          "/usr/bin/FEX",
          "/var/lib/korri/steam/steamapps/common/Sonic Mania/SonicMania.exe",
        ],
      }),
    ).toBe(true)
  })

  it("does not match warm Steam client or service processes", () => {
    const processes: readonly SteamForegroundProcessInfo[] = [
      {
        pid: 44,
        uid: 1000,
        cmdline: ["/var/lib/korri/steam/steamrtarm64/steam", "-silent"],
      },
      {
        pid: 45,
        uid: 1000,
        cmdline: [
          "/var/lib/korri/steam/ubuntu12_32/steamwebhelper",
          "--type=renderer",
        ],
      },
      {
        pid: 46,
        uid: 1000,
        cmdline: [
          "/var/lib/korri/steam/steamapps/common/Tools/readme.txt",
        ],
      },
    ]

    expect(collectSteamForegroundProcesses(processes)).toEqual([])
  })
})
