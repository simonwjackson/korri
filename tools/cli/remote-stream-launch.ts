import type { GameRecord } from "@shared/fixtures/games/game"
import { getGameDisplayName } from "@shared/fixtures/games/game"
import type { GamePicker } from "./game-picker"
import {
  type DiscoverStreamHostsOptions,
  discoverStreamHosts,
  type StreamHostCandidate,
} from "./lan-stream-discovery"
import {
  launchMoonlight,
  type MoonlightLaunchResult,
} from "./moonlight-launcher"
import {
  createRemoteStreamControlClient,
  type RemotePrepareResult,
  type RemoteStreamControlClient,
} from "./remote-stream-control-client"

export interface RunRemoteStreamLaunchCommandOptions {
  readonly host?: string
  readonly gamePicker?: GamePicker
  readonly stdinIsTty?: boolean
  readonly discoverHosts?: (
    options: DiscoverStreamHostsOptions,
  ) => Promise<readonly StreamHostCandidate[]>
  readonly clientForHost?: (
    host: StreamHostCandidate,
  ) => RemoteStreamControlClient
  readonly launchMoonlight?: (options: {
    readonly host?: string
  }) => Promise<MoonlightLaunchResult>
  readonly output?: (line: string) => void
  readonly errorOutput?: (line: string) => void
}

interface RemoteGameChoice {
  readonly choice: GameRecord
  readonly game: GameRecord
  readonly host: StreamHostCandidate
}

export async function runRemoteStreamLaunchCommand(
  options: RunRemoteStreamLaunchCommandOptions,
): Promise<number> {
  const output = options.output ?? console.log
  const errorOutput = options.errorOutput ?? console.error
  const discover = options.discoverHosts ?? discoverStreamHosts
  const hosts = await discover({ manualHost: options.host })
  if (hosts.length === 0) {
    errorOutput("No streamable Korri hosts were discovered")
    return 4
  }

  const choices: RemoteGameChoice[] = []
  for (const host of hosts) {
    const client = clientFor(options, host)
    let games: readonly GameRecord[]
    try {
      games = await client.listGames()
    } catch (error) {
      errorOutput(
        `Could not list games from ${host.name}: ${errorMessage(error)}`,
      )
      continue
    }
    for (const game of games) choices.push(remoteChoice(host, game))
  }

  if (choices.length === 0) {
    errorOutput("No remote streamable games were found")
    return 5
  }
  if (options.stdinIsTty === false) {
    errorOutput("Interactive remote game selection requires a terminal")
    return 2
  }
  if (!options.gamePicker) {
    errorOutput("Interactive remote game selection is unavailable")
    return 2
  }

  const selected = await options.gamePicker(
    choices.map(choice => choice.choice),
  )
  if (!selected) {
    errorOutput("Remote stream launch cancelled")
    return 130
  }
  const remote = choices.find(choice => choice.choice.id === selected.id)
  if (!remote) {
    errorOutput("Selected remote game is no longer available")
    return 6
  }

  const prepare = await clientFor(options, remote.host).prepareGame(
    remote.game.id,
  )
  if (prepare.status === "failed") {
    errorOutput(prepare.message)
    return exitCodeForPrepareFailure(prepare)
  }

  output(
    `Prepared ${getGameDisplayName(remote.game)} from ${remote.host.name} for Korri Stream.`,
  )
  output("Attempting to open Moonlight locally...")
  const moonlight = await (options.launchMoonlight ?? launchMoonlight)({
    host: remote.host.id,
  })
  if (moonlight.status === "started") {
    output(`Moonlight launch attempted via ${moonlight.command}.`)
    return 0
  }

  output(moonlight.message)
  output(
    "Remote staging succeeded; connect to the Korri Stream app manually if needed.",
  )
  return 0
}

function clientFor(
  options: RunRemoteStreamLaunchCommandOptions,
  host: StreamHostCandidate,
): RemoteStreamControlClient {
  return (
    options.clientForHost?.(host) ??
    createRemoteStreamControlClient(host.controlUrl)
  )
}

function remoteChoice(
  host: StreamHostCandidate,
  game: GameRecord,
): RemoteGameChoice {
  return {
    host,
    game,
    choice: {
      ...game,
      id: `${host.id}:${game.id}`,
      metadata: {
        ...(game.metadata ?? {}),
        name: `${getGameDisplayName(game)} · ${host.name}`,
      },
    },
  }
}

function exitCodeForPrepareFailure(
  result: Extract<RemotePrepareResult, { status: "failed" }>,
): number {
  switch (result.category) {
    case "host-unavailable":
      return 4
    case "host-control-disabled":
      return 5
    case "no-such-game":
      return 3
    case "prepare-failed":
      return 6
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return String(error)
}
