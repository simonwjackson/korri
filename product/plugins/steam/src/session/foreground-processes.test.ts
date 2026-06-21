import { describe, expect, it } from "bun:test"
import {
  collectSteamForegroundProcesses,
  isSteamForegroundProcess,
  type SteamForegroundProcessInfo,
  steamAppIdFromProcess,
} from "./foreground-processes"

const steamLaunch = (
  appId = "584400",
  pid = 42,
): SteamForegroundProcessInfo => ({
  pid,
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

  it("scopes Proton, FEX, pressure-vessel, and game exe children to the AppID root", () => {
    const processes: readonly SteamForegroundProcessInfo[] = [
      steamLaunch("1029210"),
      {
        pid: 43,
        ppid: 42,
        uid: 1000,
        cmdline: [
          "/usr/bin/FEX",
          "/var/lib/korri/steam/steamapps/common/30XX/30XX.exe",
        ],
      },
      {
        pid: 44,
        ppid: 42,
        uid: 1000,
        cmdline: [
          "/var/lib/korri/steam/steamapps/common/Proton - Experimental/proton",
          "waitforexitandrun",
        ],
      },
      {
        pid: 45,
        ppid: 44,
        uid: 1000,
        cmdline: [
          "/var/lib/korri/steam/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/bin/pv-bwrap",
        ],
      },
      {
        pid: 47,
        ppid: 45,
        uid: 1000,
        cmdline: [
          "/usr/bin/FEXInterpreter",
          "--rootfs",
          "/run/pressure-vessel",
        ],
      },
      steamLaunch("452060", 46),
    ]

    expect(
      collectSteamForegroundProcesses(processes, { appId: "1029210" }).map(
        process => process.pid,
      ),
    ).toEqual([42, 43, 44, 45, 47])
  })

  it("scopes detached Proton/FEX game processes by Steam AppID environment", () => {
    const processes: readonly SteamForegroundProcessInfo[] = [
      steamLaunch("1029210", 42),
      {
        pid: 43,
        ppid: 1,
        uid: 1000,
        cmdline: [
          "/usr/bin/FEX",
          "/var/lib/korri/steam/steamapps/common/Proton 10.0/files/bin/wine64-preloader",
          "Z:\\var\\lib\\korri\\steam\\steamapps\\common\\30XX\\30XX.exe",
        ],
        environ: ["SteamGameId=1029210", "SteamAppId=1029210"],
      },
      {
        pid: 44,
        ppid: 43,
        uid: 1000,
        cmdline: [
          "/usr/bin/FEX",
          "/var/lib/korri/steam/steamapps/common/Proton 10.0/files/bin/wineserver",
        ],
      },
      {
        pid: 45,
        ppid: 1,
        uid: 1000,
        cmdline: [
          "/usr/bin/FEX",
          "/var/lib/korri/steam/steamapps/common/Caveblazers/Caveblazers.exe",
        ],
        environ: ["SteamGameId=452060"],
      },
    ]

    expect(steamAppIdFromProcess(processes[1])).toBe("1029210")
    expect(
      collectSteamForegroundProcesses(processes, { appId: "1029210" }).map(
        process => process.pid,
      ),
    ).toEqual([42, 43, 44])
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
        cmdline: ["/var/lib/korri/steam/steamapps/common/Tools/readme.txt"],
      },
    ]

    expect(collectSteamForegroundProcesses(processes)).toEqual([])
  })
})
