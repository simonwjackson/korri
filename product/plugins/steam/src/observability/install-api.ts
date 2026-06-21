import {
  findActiveSteamInstallRequest,
  findSteamInstallRequestById,
} from "../app-control/install-request-ledger"
import { collectSteamInstallSnapshot } from "./install-state"

export interface SteamInstallStatusInput {
  readonly appId: string
  readonly requestId?: string
}

export async function collectSteamInstallStatus(
  input: SteamInstallStatusInput,
) {
  const request = input.requestId
    ? findSteamInstallRequestById(input.requestId)
    : findActiveSteamInstallRequest({ appId: input.appId })
  const requested = request?.appId === input.appId
  return collectSteamInstallSnapshot({ appId: input.appId, requested })
}
