import { afterEach, describe, expect, it } from "bun:test"
import {
  findSteamInstallRequestById,
  resetSteamInstallRequestLedgerForTests,
  upsertSteamInstallRequest,
} from "./install-request-ledger"

afterEach(() => resetSteamInstallRequestLedgerForTests())

describe("Steam install request ledger", () => {
  it("records and finds install requests", () => {
    const entry = upsertSteamInstallRequest({ appId: "1029210" })

    expect(findSteamInstallRequestById(entry.requestId)).toEqual(entry)
  })

  it("does not return expired request ids", () => {
    const entry = upsertSteamInstallRequest({
      appId: "1029210",
      now: new Date(Date.now() - 11 * 60 * 1000),
    })

    expect(findSteamInstallRequestById(entry.requestId)).toBeUndefined()
  })

  it("deduplicates recent requests for an app", () => {
    const first = upsertSteamInstallRequest({ appId: "1029210" })
    const second = upsertSteamInstallRequest({ appId: "1029210" })

    expect(second.requestId).toBe(first.requestId)
  })
})
