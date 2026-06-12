type PiToolRegistration = {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly parameters: unknown
  readonly execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<unknown>
}

type PiApi = {
  readonly registerTool: (tool: PiToolRegistration) => void
}

type CommandSpec = {
  readonly tag: string
  readonly payload: unknown
  readonly mutates: boolean
  readonly confirmed: boolean
}

type RpcExitFrame = {
  readonly _tag: "Exit"
  readonly requestId: string
  readonly exit:
    | { readonly _tag: "Success"; readonly value: unknown }
    | { readonly _tag: "Failure"; readonly cause?: unknown }
}

const DEFAULT_KORRID_RPC_TIMEOUT_MS = 15_000

const READ_ONLY_COMMANDS = {
  status: { tag: "app.server.status", payload: {} },
  library: { tag: "app.library.list", payload: {} },
  sources: { tag: "app.source.list", payload: {} },
  "source-status": { tag: "app.source.status", payload: {} },
  "session-status": { tag: "app.session.status", payload: {} },
  "stream-state": { tag: "app.stream-control.state.get", payload: {} },
  "stream-config": { tag: "app.stream-control.config.get", payload: {} },
} as const

const READ_ONLY_RPC_TAGS = new Set<string>([
  ...Object.values(READ_ONLY_COMMANDS).map(command => command.tag),
  "app.hello.get",
  "app.library.launch.dry-run",
])

export default function register(pi: PiApi) {
  registerKorridTools(pi)
}

export function registerKorridTools(pi: PiApi): void {
  pi.registerTool({
    name: "korrid_query",
    label: "Korrid Query",
    description:
      "Run a read-only Korri daemon RPC query for server status, library, session lifecycle, or stream-control settings.",
    parameters: baseParameters({
      command: {
        enum: [...Object.keys(READ_ONLY_COMMANDS), "rpc"],
        description:
          "Read-only query to run. Use rpc with tag/payload for allowlisted read-only RPC tags.",
      },
      tag: {
        type: "string",
        description: "RPC tag when command is rpc.",
      },
      payload: {
        description: "Payload object when command is rpc. Defaults to {}.",
      },
      compact: {
        type: "boolean",
        description: "Return compact summaries for large list responses.",
      },
    }),
    async execute(_toolCallId, params, signal) {
      return executeSpec(params, signal, readOnlySpec(params))
    },
  })

  pi.registerTool({
    name: "korrid_find_game",
    label: "Korrid Find Game",
    description:
      "Find a Korri library game by exact playable id or case-insensitive id/title match.",
    parameters: baseParameters({
      query: { type: "string", description: "Playable id or title query." },
    }),
    async execute(_toolCallId, params, signal) {
      return executeFindGame(params, signal)
    },
  })

  pi.registerTool({
    name: "korrid_dry_run_launch",
    label: "Korrid Dry Run Launch",
    description:
      "Resolve a Korri library launch through app.library.launch.dry-run without spawning.",
    parameters: baseParameters({
      id: { type: "string", description: "Playable game id to resolve." },
      profileId: { type: "string", description: "Optional launch profile id." },
      releaseId: { type: "string", description: "Optional release id." },
      appId: { type: "string", description: "Optional app id." },
    }),
    async execute(_toolCallId, params, signal) {
      return executeSpec(params, signal, dryRunSpec(params))
    },
  })

  pi.registerTool({
    name: "korrid_launch_game",
    label: "Korrid Launch Game",
    description:
      "Launch a Korri library game through the daemon. Requires confirmLaunch=true.",
    parameters: baseParameters({
      id: { type: "string", description: "Playable game id to launch." },
      profileId: { type: "string", description: "Optional launch profile id." },
      releaseId: { type: "string", description: "Optional release id." },
      appId: { type: "string", description: "Optional app id." },
      confirmLaunch: {
        type: "boolean",
        description: "Must be true to confirm this mutating launch request.",
      },
    }),
    async execute(_toolCallId, params, signal) {
      return executeSpec(params, signal, launchSpec(params))
    },
  })

  pi.registerTool({
    name: "korrid_stop_session",
    label: "Korrid Stop Session",
    description:
      "Stop the active foreground session through sessiond. Requires confirmStop=true; force stop requires force=true and confirmStop=true.",
    parameters: baseParameters({
      force: { type: "boolean", description: "Request force termination." },
      confirmStop: {
        type: "boolean",
        description: "Must be true to confirm this mutating stop request.",
      },
    }),
    async execute(_toolCallId, params, signal) {
      return executeSpec(params, signal, stopSpec(params))
    },
  })
}

function baseParameters(properties: Record<string, unknown>) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      host: {
        type: "string",
        description:
          "Host or IP for korrid, e.g. 'bandai'. Defaults to 127.0.0.1. Ignored when url is set.",
      },
      url: {
        type: "string",
        description:
          "Full korrid base URL or RPC URL. '/api/rpc' is appended when omitted.",
      },
      ...properties,
    },
  }
}

function readOnlySpec(params: Record<string, unknown>): CommandSpec {
  const command = typeof params.command === "string" ? params.command : "status"
  if (command === "rpc") {
    const tag = requiredString(params.tag, "tag")
    if (!READ_ONLY_RPC_TAGS.has(tag)) {
      throw new Error(`rpc tag is not a known read-only command: ${tag}`)
    }
    return {
      tag,
      payload: params.payload ?? {},
      mutates: false,
      confirmed: true,
    }
  }
  if (!isReadOnlyCommand(command)) {
    throw new Error(`unknown read-only command: ${command}`)
  }
  const spec = READ_ONLY_COMMANDS[command]
  return { ...spec, mutates: false, confirmed: true }
}

function dryRunSpec(params: Record<string, unknown>): CommandSpec {
  const id = requiredString(params.id, "id")
  return {
    tag: "app.library.launch.dry-run",
    payload: launchSelectionPayload(params, id),
    mutates: false,
    confirmed: true,
  }
}

function launchSpec(params: Record<string, unknown>): CommandSpec {
  const id = requiredString(params.id, "id")
  const confirmed = params.confirmLaunch === true
  return {
    tag: "app.library.launch",
    payload: launchSelectionPayload(params, id),
    mutates: true,
    confirmed,
  }
}

function launchSelectionPayload(
  params: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  return {
    id,
    ...(typeof params.releaseId === "string"
      ? { releaseId: params.releaseId }
      : {}),
    ...(typeof params.profileId === "string"
      ? { profileId: params.profileId }
      : {}),
    ...(typeof params.appId === "string" ? { appId: params.appId } : {}),
  }
}

function stopSpec(params: Record<string, unknown>): CommandSpec {
  const force = params.force === true
  const confirmed = params.confirmStop === true
  return {
    tag: "app.session.stop",
    payload: { force, confirmed },
    mutates: true,
    confirmed,
  }
}

async function executeSpec(
  params: Record<string, unknown>,
  signal: AbortSignal | undefined,
  spec: CommandSpec,
) {
  const rpcUrl = rpcUrlFromParams(params)

  if (spec.mutates && !spec.confirmed) {
    return toolResult(
      {
        ok: false,
        rpcUrl,
        tag: spec.tag,
        error: "mutating tool call requires explicit confirmation",
      },
      true,
    )
  }

  try {
    const rawResult = await callKorridRpc(rpcUrl, spec, signal)
    const result =
      params.compact === true ? compactResult(spec.tag, rawResult) : rawResult
    return toolResult({ ok: true, rpcUrl, tag: spec.tag, result })
  } catch (error) {
    return toolResult(
      {
        ok: false,
        rpcUrl,
        tag: spec.tag,
        error: error instanceof Error ? error.message : String(error),
      },
      true,
    )
  }
}

async function executeFindGame(
  params: Record<string, unknown>,
  signal: AbortSignal | undefined,
) {
  const rpcUrl = rpcUrlFromParams(params)
  const query = typeof params.query === "string" ? params.query.trim() : ""
  if (query.length === 0) {
    return toolResult(
      {
        ok: false,
        rpcUrl,
        tag: "app.library.list",
        result: { _tag: "MissingQuery" },
      },
      true,
    )
  }

  try {
    const response = await callKorridRpc(
      rpcUrl,
      { tag: "app.library.list", payload: {} },
      signal,
    )
    const result = findGameInList(response, query)
    return toolResult(
      {
        ok: result._tag === "GameFound",
        rpcUrl,
        tag: "app.library.list",
        result,
      },
      result._tag !== "GameFound",
    )
  } catch (error) {
    return toolResult(
      {
        ok: false,
        rpcUrl,
        tag: "app.library.list",
        error: error instanceof Error ? error.message : String(error),
      },
      true,
    )
  }
}

function rpcUrlFromParams(params: Record<string, unknown>): string {
  return normalizeKorridRpcUrl(
    typeof params.url === "string"
      ? params.url
      : typeof params.host === "string"
        ? hostToUrl(params.host)
        : (process.env.KORRI_RPC_URL ??
          process.env.KORRI_PUBLIC_API_BASE_URL ??
          "http://127.0.0.1:3001/api/rpc"),
  )
}

export async function callKorridRpc(
  rpcUrl: string,
  spec: Pick<CommandSpec, "tag" | "payload">,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const requestId = createRequestId()
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      _tag: "Request",
      id: requestId,
      tag: spec.tag,
      payload: spec.payload,
      headers: [],
    }),
    signal: signalWithFallbackTimeout(signal),
  })

  const text = await response.text()
  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`)

  const parsed = JSON.parse(text) as unknown
  const frames = Array.isArray(parsed) ? parsed : [parsed]
  const exitFrame = frames.find(isRpcExitFrame)
  if (!exitFrame) {
    throw new Error(
      `RPC response did not include an Exit frame: ${text.slice(0, 500)}`,
    )
  }

  if (exitFrame.exit._tag === "Success") return exitFrame.exit.value
  throw new Error(
    `RPC failure: ${JSON.stringify(exitFrame.exit.cause ?? exitFrame.exit)}`,
  )
}

export function normalizeKorridRpcUrl(value: string): string {
  // Keep this portable package in sync with the app-owned RPC client defaults:
  // bare hostnames use korrid's default port 3001 and the `/api/rpc` path.
  const raw =
    value.startsWith("http://") || value.startsWith("https://")
      ? value
      : hostToUrl(value)
  const trimmed = raw.replace(/\/+$/, "")
  return trimmed.endsWith("/api/rpc") ? trimmed : `${trimmed}/api/rpc`
}

function hostToUrl(host: string): string {
  return `http://${host}:3001`
}

function findGameInList(response: unknown, query: string) {
  const games =
    isRecord(response) && Array.isArray(response.games) ? response.games : []
  const exact = games.find(game => isRecord(game) && game.id === query)
  if (isRecord(exact)) {
    return {
      _tag: "GameFound" as const,
      game: compactGame(exact),
      match: "exact-id",
    }
  }

  const normalized = query.toLocaleLowerCase()
  const matches = games.filter(game => {
    if (!isRecord(game)) return false
    const id = typeof game.id === "string" ? game.id.toLocaleLowerCase() : ""
    const title =
      typeof game.title === "string" ? game.title.toLocaleLowerCase() : ""
    return id.includes(normalized) || title.includes(normalized)
  })

  if (matches.length === 1 && isRecord(matches[0])) {
    const game = matches[0]
    const id = typeof game.id === "string" ? game.id.toLocaleLowerCase() : ""
    return {
      _tag: "GameFound" as const,
      game: compactGame(game),
      match: id.includes(normalized) ? "id" : "title",
    }
  }

  const candidates = matches.filter(isRecord).map(compactGame)
  if (matches.length > 1) {
    return { _tag: "AmbiguousGame" as const, query, candidates }
  }
  return { _tag: "GameNotFound" as const, query, candidates }
}

function compactResult(tag: string, result: unknown): unknown {
  if (tag === "app.library.list" && isRecord(result)) {
    const games = Array.isArray(result.games) ? result.games : []
    return {
      count: games.length,
      games: games.map(game => {
        const record = isRecord(game) ? game : {}
        return {
          id: record.id,
          title: record.title,
          source: record.source,
        }
      }),
    }
  }
  return result
}

function compactGame(game: Record<string, unknown>) {
  const source = isRecord(game.source) ? game.source : undefined
  return {
    id: game.id,
    ...(typeof game.title === "string" ? { title: game.title } : {}),
    ...(source && typeof source.hostId === "string"
      ? { sourceId: source.hostId }
      : {}),
  }
}

function toolResult(details: Record<string, unknown>, isError = false) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(details, null, 2),
      },
    ],
    details,
    ...(isError ? { isError: true } : {}),
  }
}

function isRpcExitFrame(value: unknown): value is RpcExitFrame {
  return (
    isRecord(value) &&
    value._tag === "Exit" &&
    isRecord(value.exit) &&
    (value.exit._tag === "Success" || value.exit._tag === "Failure")
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isReadOnlyCommand(
  value: string,
): value is keyof typeof READ_ONLY_COMMANDS {
  return value in READ_ONLY_COMMANDS
}

function requiredString(value: unknown, name: string): string {
  if (typeof value === "string" && value.trim().length > 0) return value
  throw new Error(`${name} is required`)
}

let requestSequence = 0

function createRequestId(): string {
  requestSequence = (requestSequence + 1) % 1_000_000
  return `${Date.now()}${requestSequence.toString().padStart(6, "0")}`
}

function signalWithFallbackTimeout(signal: AbortSignal | undefined) {
  const timeoutSignal = AbortSignal.timeout(DEFAULT_KORRID_RPC_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
}
