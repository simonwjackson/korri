import { afterEach, describe, expect, it } from "bun:test"
import { requestSteamAppInstall } from "./install-trigger"
import { resetSteamInstallRequestLedgerForTests } from "./install-request-ledger"

afterEach(() => resetSteamInstallRequestLedgerForTests())

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

  it("returns requested after helper success", async () => {
    const result = await requestSteamAppInstall({
      appId: "1029210",
      authorized: true,
      helperPath: "/helper",
      spawn: async (_command, args) => {
        expect(args).toEqual(["1029210"])
        return { exitCode: 0 }
      },
    })

    expect(result.outcome).toBe("accepted")
    expect(result.state).toBe("requested")
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
    const first = await requestSteamAppInstall({ appId: "1029210", authorized: true, helperPath: "/helper", spawn })
    const second = await requestSteamAppInstall({ appId: "1029210", authorized: true, helperPath: "/helper", spawn })

    expect(second.requestId).toBe(first.requestId)
    expect(second.outcome).toBe("already-in-progress")
    expect(spawnCount).toBe(1)
  })
})
