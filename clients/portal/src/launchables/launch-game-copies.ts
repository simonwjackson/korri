import type {
  LaunchLocalResult,
  StartStreamResult,
} from "@contracts/bridge/korri-native-bridge"
import type {
  LocalGameLaunchOutcome,
  SessionPrepareOutcome,
} from "@contracts/generated/korrid"
import type { PortalGameCopy } from "./fold-games"

export interface CopyStreamTarget {
  readonly hostUuid: string
  readonly appId: number
}

export interface GameCopyLaunchPorts {
  localGameLaunch(gameId: string): Promise<LocalGameLaunchOutcome>
  launchLocal(spec: Extract<LocalGameLaunchOutcome, { _tag: "Ok" }>["payload"]): Promise<LaunchLocalResult>
  streamTarget(host?: string): CopyStreamTarget | undefined
  sessionPrepare(gameId: string, host?: string): Promise<SessionPrepareOutcome>
  startStream(hostUuid: string, appId: number): Promise<StartStreamResult>
}

export type GameCopiesLaunchResult =
  | { readonly _tag: "Started" }
  | { readonly _tag: "StreamResult"; readonly result: StartStreamResult }
  | { readonly _tag: "Unavailable"; readonly message: string }
  | { readonly _tag: "Cancelled" }

/** Try the representative and retained copies in order, as legacy did. */
export async function launchGameCopies(
  copies: readonly PortalGameCopy[],
  ports: GameCopyLaunchPorts,
  isCurrent: () => boolean,
): Promise<GameCopiesLaunchResult> {
  const failures: string[] = []
  for (const copy of copies) {
    if (!isCurrent()) return { _tag: "Cancelled" }
    if (copy.kind === "local") {
      const outcome = await ports.localGameLaunch(copy.game.id)
      if (!isCurrent()) return { _tag: "Cancelled" }
      if (outcome._tag !== "Ok") {
        failures.push(`${copyLabel(copy)}: ${outcome.payload.code}`)
        continue
      }
      const result = await ports.launchLocal(outcome.payload)
      if (!isCurrent()) return { _tag: "Cancelled" }
      if (result._tag === "Launched") return { _tag: "Started" }
      failures.push(`${copyLabel(copy)}: ${result.reason}`)
      continue
    }

    const target = ports.streamTarget(copy.game.host)
    if (target === undefined) {
      failures.push(`${copyLabel(copy)}: NoStreamTarget`)
      continue
    }
    const outcome = await ports.sessionPrepare(copy.game.id, copy.game.host)
    if (!isCurrent()) return { _tag: "Cancelled" }
    if (outcome._tag !== "Ok") {
      failures.push(`${copyLabel(copy)}: ${outcome.payload.code}`)
      continue
    }
    const result = await ports.startStream(target.hostUuid, target.appId)
    if (!isCurrent()) return { _tag: "Cancelled" }
    return { _tag: "StreamResult", result }
  }
  return { _tag: "Unavailable", message: failures.join(" · ") }
}

function copyLabel(copy: PortalGameCopy): string {
  return copy.kind === "local" ? "this device" : (copy.game.host ?? "remote host")
}
