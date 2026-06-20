import { describe, expect, it } from "bun:test"
import { KORRI_STEAM_PLUGIN_ID } from "../plugin"
import type { SteamForegroundProcessInfo } from "./foreground-processes"
import {
  createSteamSessionLifecycleHook,
  steamLaunchCleanupMetadata,
} from "./lifecycle-hook"

const metadata = (appId: string) => ({
  appProviderId: KORRI_STEAM_PLUGIN_ID,
  annotations: {
    [KORRI_STEAM_PLUGIN_ID]: {
      steamSession: true,
      foregroundCleanup: steamLaunchCleanupMetadata({ appId }),
    },
  },
})

describe("Steam session lifecycle hook", () => {
  it("cleans 30XX Steam foreground process children from plugin metadata", async () => {
    const signals: Array<{ pid: number; signal: NodeJS.Signals }> = []
    let scan = 0
    const steamLaunch: SteamForegroundProcessInfo = {
      pid: 100,
      cmdline: ["SteamLaunch", "AppId=1029210"],
    }
    const thirtyXx: SteamForegroundProcessInfo = {
      pid: 101,
      ppid: 100,
      cmdline: [
        "/usr/bin/FEX",
        "/var/lib/korri/steam/steamapps/common/30XX/30XX.exe",
      ],
    }
    const proton: SteamForegroundProcessInfo = {
      pid: 102,
      ppid: 100,
      cmdline: [
        "/var/lib/korri/steam/steamapps/common/Proton - Experimental/proton",
      ],
    }
    const pressureVessel: SteamForegroundProcessInfo = {
      pid: 103,
      ppid: 102,
      cmdline: [
        "/var/lib/korri/steam/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/bin/pv-bwrap",
      ],
    }
    const otherSteamLaunch: SteamForegroundProcessInfo = {
      pid: 104,
      cmdline: ["SteamLaunch", "AppId=452060"],
    }
    const hook = createSteamSessionLifecycleHook({
      graceMs: 0,
      processScanner: async () => {
        scan += 1
        if (scan <= 2)
          return [
            steamLaunch,
            thirtyXx,
            proton,
            pressureVessel,
            otherSteamLaunch,
          ]
        return [otherSteamLaunch]
      },
      signalProcess: (pid, signal) => signals.push({ pid, signal }),
    })

    await hook.afterChildRunning?.({
      launchId: "launch-1",
      spec: { command: "/bin/game", args: [] },
      launchMetadata: metadata("1029210"),
    })
    const result = await hook.cleanup?.({ launchId: "launch-1" })

    expect(signals).toEqual([
      { pid: 100, signal: "SIGTERM" },
      { pid: 101, signal: "SIGTERM" },
      { pid: 102, signal: "SIGTERM" },
      { pid: 103, signal: "SIGTERM" },
      { pid: 100, signal: "SIGKILL" },
      { pid: 101, signal: "SIGKILL" },
      { pid: 102, signal: "SIGKILL" },
      { pid: 103, signal: "SIGKILL" },
    ])
    expect(result).toEqual({ cleaned: [100, 101, 102, 103], residual: [] })
  })

  it("falls back to the provider-owned Steam AppID launcher when metadata is absent", async () => {
    const signals: Array<{ pid: number; signal: NodeJS.Signals }> = []
    let scan = 0
    const hook = createSteamSessionLifecycleHook({
      graceMs: 0,
      processScanner: async () => {
        scan += 1
        if (scan <= 2) {
          return [
            { pid: 100, cmdline: ["SteamLaunch", "AppId=1029210"] },
            { pid: 101, cmdline: ["SteamLaunch", "AppId=401710"] },
          ]
        }
        return [{ pid: 101, cmdline: ["SteamLaunch", "AppId=401710"] }]
      },
      signalProcess: (pid, signal) => signals.push({ pid, signal }),
    })

    await hook.afterChildRunning?.({
      launchId: "launch-1",
      spec: {
        command: "/run/current-system/sw/bin/korri-steam-app",
        args: ["1029210"],
      },
    })
    const result = await hook.cleanup?.({ launchId: "launch-1" })

    expect(signals).toEqual([
      { pid: 100, signal: "SIGTERM" },
      { pid: 100, signal: "SIGKILL" },
    ])
    expect(result).toEqual({ cleaned: [100], residual: [] })
  })
})
