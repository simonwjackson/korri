/**
 * Live wiring for the overlay session probe: reads sessiond managed-launch
 * status over its socket/HTTP client, and detects a running Moonlight stream
 * client by scanning /proc/<pid>/comm. Thin adapter (no unit tests); the
 * decision logic lives in overlay-session-state.ts.
 */
import { readdir, readFile } from "node:fs/promises"
import {
  probeSessiondManagedLaunchStatus,
  type SessiondManagedLaunchClientOptions,
} from "@platform/library/sessiond-managed-launch-client"
import type { SessiondManagedLaunchStatus } from "@platform/library/sessiond-managed-launch-protocol"
import {
  createOverlaySessionProbe,
  type OverlaySessionProbe,
} from "./overlay-session-state"

export function createLiveOverlaySessionProbe(deps: {
  readonly sessiond?: SessiondManagedLaunchClientOptions
  readonly procRoot?: string
}): OverlaySessionProbe {
  const sessiond = deps.sessiond ?? { env: process.env }
  const procRoot = deps.procRoot ?? "/proc"
  return createOverlaySessionProbe({
    readStatus: async (): Promise<SessiondManagedLaunchStatus | null> => {
      const result = await probeSessiondManagedLaunchStatus(sessiond)
      return result.kind === "ok" ? result.status : null
    },
    isMoonlightRunning: () => moonlightProcessPresent(procRoot),
  })
}

/**
 * True when any process advertises a moonlight `comm`. Linux truncates comm to
 * 15 chars, so "moonlight" (and "moonlight-embed") both match the needle.
 */
export async function moonlightProcessPresent(
  procRoot: string,
): Promise<boolean> {
  let entries: string[]
  try {
    entries = await readdir(procRoot)
  } catch {
    return false
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue
    let comm: string
    try {
      comm = await readFile(`${procRoot}/${entry}/comm`, "utf8")
    } catch {
      continue
    }
    if (comm.toLowerCase().includes("moonlight")) return true
  }
  return false
}
