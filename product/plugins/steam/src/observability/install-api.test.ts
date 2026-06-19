import { afterEach, describe, expect, it } from "bun:test"
import {
  resetSteamInstallRequestLedgerForTests,
  upsertSteamInstallRequest,
} from "../app-control/install-request-ledger"
import { collectSteamInstallStatus } from "./install-api"

describe("Steam install API", () => {
  afterEach(() => resetSteamInstallRequestLedgerForTests())

  it("returns a current snapshot for an AppID", async () => {
    const result = await collectSteamInstallStatus({ appId: "1029210" })

    expect(result.appId).toBe("1029210")
    expect([
      "not-installed",
      "requested",
      "queued",
      "downloading",
      "installing",
      "installed",
      "failed",
      "unknown",
    ]).toContain(result.state)
  })

  it("does not treat arbitrary request ids as active requests", async () => {
    const result = await collectSteamInstallStatus({
      appId: "1029210",
      requestId: "missing",
    })

    expect(result.state).toBe("not-installed")
  })

  it("uses matching ledger requests as requested evidence", async () => {
    const entry = upsertSteamInstallRequest({ appId: "1029210" })
    const result = await collectSteamInstallStatus({
      appId: "1029210",
      requestId: entry.requestId,
    })

    expect(result.state).toBe("requested")
  })

  it("uses an active app request as requested evidence without requestId", async () => {
    upsertSteamInstallRequest({ appId: "1029210" })
    const result = await collectSteamInstallStatus({ appId: "1029210" })

    expect(result.state).toBe("requested")
  })
})
