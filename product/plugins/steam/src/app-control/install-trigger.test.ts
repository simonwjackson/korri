import { afterEach, describe, expect, it } from "bun:test"
import {
  parseVdf,
  steamConfigPath,
  type SteamStateFileSystem,
} from "../state-materializer"
import { resetSteamInstallRequestLedgerForTests } from "./install-request-ledger"
import { prepareSteamAppInstallState, requestSteamAppInstall } from "./install-trigger"

afterEach(() => resetSteamInstallRequestLedgerForTests())

const memoryFs = () => {
  const files = new Map<string, string>()
  const toolRoot = "/steam-home/compatibilitytools.d/proton-cachyos-arm64"
  const fs: SteamStateFileSystem = {
    readText: async path => {
      if (path === `${toolRoot}/toolmanifest.vdf`) return '"manifest" {}'
      if (path === `${toolRoot}/proton`) return "#!/bin/sh\nexit 0\n"
      return files.get(path)
    },
    writeTextAtomic: async (path, content) => {
      files.set(path, content)
    },
    mkdirp: async () => {},
    listDirectories: async () => [],
    pathExists: async path => path === toolRoot || path === `${toolRoot}/proton`,
    isExecutableFile: async path => path === `${toolRoot}/proton`,
  }
  return { fs, files }
}

describe("Steam install trigger", () => {
  it("rejects invalid AppIDs before spawning", async () => {
    let spawned = false
    const result = await requestSteamAppInstall({
      appId: "abc",
      authorized: true,
      helperPath: "/helper",
      spawn: async () => {
        spawned = true
        return { exitCode: 0 }
      },
    })

    expect(result.outcome).toBe("rejected")
    expect(spawned).toBe(false)
  })

  it("can prepare default Cachy policy for an AppID install", async () => {
    const { fs, files } = memoryFs()

    await prepareSteamAppInstallState({
      appId: "360740",
      stateRoot: "/steam-home",
      compatTool: "proton-cachyos-arm64",
      fs,
    })

    expect(parseVdf(files.get(steamConfigPath("/steam-home")) ?? "")).toMatchObject({
      InstallConfigStore: {
        Software: {
          Valve: {
            Steam: {
              CompatToolMapping: {
                "0": { name: "proton-cachyos-arm64" },
              },
            },
          },
        },
      },
    })
  })

  it("prepares Steam policy before invoking the install helper", async () => {
    const events: string[] = []
    const result = await requestSteamAppInstall({
      appId: "1029210",
      authorized: true,
      helperPath: "/helper",
      prepare: async ({ appId }) => {
        events.push(`prepare:${appId}`)
      },
      spawn: async (_command, args) => {
        events.push(`spawn:${args.join(",")}`)
        return { exitCode: 0 }
      },
    })

    expect(result.outcome).toBe("accepted")
    expect(result.state).toBe("requested")
    expect(events).toEqual(["prepare:1029210", "spawn:1029210"])
  })

  it("rejects without spawning when Steam policy preparation fails", async () => {
    let spawned = false
    const result = await requestSteamAppInstall({
      appId: "1029210",
      authorized: true,
      helperPath: "/helper",
      prepare: async () => {
        throw new Error("steam-busy: downloading 401710")
      },
      spawn: async () => {
        spawned = true
        return { exitCode: 0 }
      },
    })

    expect(result.outcome).toBe("rejected")
    expect(result.state).toBe("failed")
    expect(result.message).toContain("steam-busy")
    expect(spawned).toBe(false)
  })

  it("does not retain failed helper requests as active", async () => {
    const failed = await requestSteamAppInstall({
      appId: "1029210",
      authorized: true,
      helperPath: "/helper",
      spawn: async () => ({ exitCode: 1, stderr: "nope" }),
    })
    const retried = await requestSteamAppInstall({
      appId: "1029210",
      authorized: true,
      helperPath: "/helper",
      spawn: async () => ({ exitCode: 0 }),
    })

    expect(failed.outcome).toBe("rejected")
    expect(retried.outcome).toBe("accepted")
  })

  it("deduplicates repeated requests without spawning again", async () => {
    let spawnCount = 0
    const spawn = async () => {
      spawnCount += 1
      return { exitCode: 0 }
    }
    const first = await requestSteamAppInstall({
      appId: "1029210",
      authorized: true,
      helperPath: "/helper",
      spawn,
    })
    const second = await requestSteamAppInstall({
      appId: "1029210",
      authorized: true,
      helperPath: "/helper",
      spawn,
    })

    expect(second.requestId).toBe(first.requestId)
    expect(second.outcome).toBe("already-in-progress")
    expect(spawnCount).toBe(1)
  })
})
