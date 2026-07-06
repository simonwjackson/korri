import { spawn } from "node:child_process"

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

type KorridToolsOptions = {
  readonly fetch?: typeof fetch
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
  library: { tag: "app.catalog.snapshot", payload: { scope: "fabric" } },
  sources: { tag: "app.catalog.snapshot", payload: { scope: "self" } },
  "source-status": { tag: "app.source.status", payload: {} },
  "session-status": { tag: "app.session.status", payload: {} },
  "stream-state": { tag: "app.stream-control.state.get", payload: {} },
  "stream-config": { tag: "app.stream-control.config.get", payload: {} },
  "plugin-diagnostics": {
    tag: "app.plugin.diagnostics.collect",
    payload: { providerId: "@korri:steam" },
  },
} as const

const READ_ONLY_RPC_TAGS = new Set<string>([
  ...Object.values(READ_ONLY_COMMANDS).map(command => command.tag),
  "app.hello.get",
  "app.library.launch.dry-run",
  "app.plugin.diagnostics.collect",
])

export default function register(pi: PiApi) {
  registerKorridTools(pi)
}

export function registerKorridTools(
  pi: PiApi,
  options: KorridToolsOptions = {},
): void {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)

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
      providerId: {
        type: "string",
        description:
          "Plugin provider id when command is plugin-diagnostics. Defaults to @korri:steam.",
      },
      compact: {
        type: "boolean",
        description: "Return compact summaries for large list responses.",
      },
    }),
    async execute(_toolCallId, params, signal) {
      return executeSpecFromParams(
        params,
        signal,
        fetchImpl,
        readOnlySpec,
        readOnlyFallbackTag(params),
      )
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
      return executeFindGame(params, signal, fetchImpl)
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
      return executeSpecFromParams(
        params,
        signal,
        fetchImpl,
        dryRunSpec,
        "app.library.launch.dry-run",
      )
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
      return executeSpecFromParams(
        params,
        signal,
        fetchImpl,
        launchSpec,
        "app.library.launch",
      )
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
      return executeSpecFromParams(
        params,
        signal,
        fetchImpl,
        stopSpec,
        "app.session.stop",
      )
    },
  })

  const steamAppObserveParameters = steamSshParameters({
    appId: {
      type: "string",
      description: "Steam AppID to observe. Defaults to 1029210 (30XX).",
    },
    appName: {
      type: "string",
      description:
        "Optional human-readable app name for summaries, e.g. Stray.",
    },
    expectedGameExe: {
      type: "string",
      description:
        "Executable name to identify in Proton/FEX process lists. Defaults to 30XX.exe.",
    },
    processNeedle: {
      type: "string",
      description:
        "Additional literal substring to identify the live game process, useful for Unreal Shipping executables.",
    },
    timeoutSeconds: {
      type: "number",
      description: "Overall observation timeout. Defaults to 180 seconds.",
    },
    pollIntervalSeconds: {
      type: "number",
      description: "Poll interval. Defaults to 5 seconds.",
    },
    steamHome: {
      type: "string",
      description: "Korri Steam home. Defaults to /var/lib/korri/steam.",
    },
  })

  pi.registerTool({
    name: "korri_steam_launch_supervise",
    label: "Korri Steam Launch Supervise",
    description:
      "Read-only SSH observer for a Steam AppID launch: classifies prompts, instant exits, FEX/runtime failures, live game process, GPU acceleration, and input access.",
    parameters: steamAppObserveParameters,
    async execute(_toolCallId, params, signal) {
      return executeSteamLaunchSupervise(params, signal)
    },
  })

  pi.registerTool({
    name: "korri_steam_app_observe",
    label: "Korri Steam App Observe",
    description:
      "Read-only SSH observer for arbitrary Steam/FEX AppID launches, including app manifest, FEX rootfs Mesa/Freedreno versions, live process mappings, GPU render-node access, and common Proton/FEX failure signals.",
    parameters: steamAppObserveParameters,
    async execute(_toolCallId, params, signal) {
      return executeSteamLaunchSupervise(params, signal)
    },
  })

  pi.registerTool({
    name: "korri_steam_runtime_verify",
    label: "Korri Steam Runtime Verify",
    description:
      "Read-only SSH verifier for Korri-managed Steam/FEX mutable runtime state: Sniper FEX wrappers, runtime-prep unit/watchers, and FEX rootfs Freedreno architecture.",
    parameters: steamSshParameters({
      steamHome: {
        type: "string",
        description: "Korri Steam home. Defaults to /var/lib/korri/steam.",
      },
      expectedWrapperBin: {
        type: "string",
        description:
          "Expected FEX path embedded in pressure-vessel wrappers. Defaults to /usr/bin/FEX.",
      },
    }),
    async execute(_toolCallId, params, signal) {
      return executeSteamRuntimeVerify(params, signal)
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

function readOnlyFallbackTag(params: Record<string, unknown>): string {
  return typeof params.tag === "string" ? params.tag : "app.server.status"
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
      payload: readOnlyRpcPayload(tag, params.payload),
      mutates: false,
      confirmed: true,
    }
  }
  if (!isReadOnlyCommand(command)) {
    throw new Error(`unknown read-only command: ${command}`)
  }
  const spec = READ_ONLY_COMMANDS[command]
  return {
    ...spec,
    payload:
      command === "plugin-diagnostics"
        ? pluginDiagnosticsPayload(params)
        : spec.payload,
    mutates: false,
    confirmed: true,
  }
}

function pluginDiagnosticsPayload(
  params: Record<string, unknown>,
): Record<string, unknown> {
  return {
    providerId:
      typeof params.providerId === "string"
        ? params.providerId
        : "@korri:steam",
  }
}

function readOnlyRpcPayload(tag: string, payload: unknown): unknown {
  if (payload !== undefined) return payload
  if (tag === "app.catalog.snapshot") return { scope: "fabric" }
  return {}
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

async function executeSpecFromParams(
  params: Record<string, unknown>,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch,
  buildSpec: (params: Record<string, unknown>) => CommandSpec,
  fallbackTag: string,
) {
  try {
    return executeSpec(params, signal, fetchImpl, buildSpec(params))
  } catch (error) {
    return toolResult(
      {
        ok: false,
        rpcUrl: safeRpcUrlFromParams(params),
        tag: fallbackTag,
        error: error instanceof Error ? error.message : String(error),
      },
      true,
    )
  }
}

async function executeSpec(
  params: Record<string, unknown>,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch,
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
    const rawResult = await callKorridRpc(rpcUrl, spec, signal, fetchImpl)
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
  fetchImpl: typeof fetch,
) {
  const rpcUrl = rpcUrlFromParams(params)
  const query = typeof params.query === "string" ? params.query.trim() : ""
  if (query.length === 0) {
    return toolResult(
      {
        ok: false,
        rpcUrl,
        tag: "app.catalog.snapshot",
        result: { _tag: "MissingQuery" },
      },
      true,
    )
  }

  try {
    const response = await callKorridRpc(
      rpcUrl,
      { tag: "app.catalog.snapshot", payload: { scope: "fabric" } },
      signal,
      fetchImpl,
    )
    const result = findGameInList(response, query)
    return toolResult(
      {
        ok: result._tag === "GameFound",
        rpcUrl,
        tag: "app.catalog.snapshot",
        result,
      },
      result._tag !== "GameFound",
    )
  } catch (error) {
    return toolResult(
      {
        ok: false,
        rpcUrl,
        tag: "app.catalog.snapshot",
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

function safeRpcUrlFromParams(params: Record<string, unknown>): string {
  try {
    return rpcUrlFromParams(params)
  } catch {
    return "unavailable"
  }
}

export async function callKorridRpc(
  rpcUrl: string,
  spec: Pick<CommandSpec, "tag" | "payload">,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<unknown> {
  const requestId = createRequestId()
  const response = await fetchImpl(rpcUrl, {
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
    isRecord(response) && Array.isArray(response.entries)
      ? response.entries
      : []
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
  if (tag === "app.catalog.snapshot" && isRecord(result)) {
    const games = Array.isArray(result.entries) ? result.entries : []
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

function steamSshParameters(properties: Record<string, unknown>) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      host: {
        type: "string",
        description:
          "SSH host for the Korri guest. Defaults to bandai-guest-ip.",
      },
      sshUser: {
        type: "string",
        description: "Optional SSH user prefix, e.g. root or korri.",
      },
      sshConfig: {
        type: "string",
        description:
          "Optional ssh_config path. Defaults to /tmp/bandai-deploy/ssh_config_ip when present in the caller environment.",
      },
      ...properties,
    },
  }
}

async function executeSteamLaunchSupervise(
  params: Record<string, unknown>,
  signal: AbortSignal | undefined,
) {
  const appId = stringParam(params.appId, "1029210")
  const appName = stringParam(
    params.appName,
    appId === "1029210" ? "30XX" : appId,
  )
  const expectedGameExe = stringParam(params.expectedGameExe, "30XX.exe")
  const processNeedle = stringParam(params.processNeedle, expectedGameExe)
  const timeoutSeconds = numberParam(params.timeoutSeconds, 180)
  const pollIntervalSeconds = numberParam(params.pollIntervalSeconds, 5)
  const steamHome = stringParam(params.steamHome, "/var/lib/korri/steam")
  const ssh = sshInvocationFromParams(params)

  const script = steamLaunchSuperviseScript({
    appId,
    appName,
    expectedGameExe,
    processNeedle,
    timeoutSeconds,
    pollIntervalSeconds,
    steamHome,
  })

  try {
    const capture = await runSshScript(ssh, script, signal)
    const result = classifySteamLaunchTranscript(capture.stdout, {
      appId,
      expectedGameExe,
      processNeedle,
    })
    return toolResult(
      {
        ok: result.signals.validGamescopedProtonProof,
        ssh: ssh.redacted,
        appId,
        appName,
        expectedGameExe,
        processNeedle,
        result,
        stdoutTail: tailLines(capture.stdout, 160),
        stderrTail: tailLines(capture.stderr, 80),
      },
      result.outcome.startsWith("failed") || result.outcome === "exited",
    )
  } catch (error) {
    return toolResult(
      {
        ok: false,
        ssh: ssh.redacted,
        appId,
        appName,
        expectedGameExe,
        processNeedle,
        error: error instanceof Error ? error.message : String(error),
      },
      true,
    )
  }
}

async function executeSteamRuntimeVerify(
  params: Record<string, unknown>,
  signal: AbortSignal | undefined,
) {
  const steamHome = stringParam(params.steamHome, "/var/lib/korri/steam")
  const expectedWrapperBin = stringParam(
    params.expectedWrapperBin,
    "/usr/bin/FEX",
  )
  const ssh = sshInvocationFromParams(params)

  try {
    const capture = await runSshScript(
      ssh,
      steamRuntimeVerifyScript({ steamHome }),
      signal,
    )
    const result = classifySteamRuntimeVerifyTranscript(capture.stdout, {
      steamHome,
      expectedWrapperBin,
    })
    return toolResult(
      {
        ok: result.ok,
        ssh: ssh.redacted,
        steamHome,
        expectedWrapperBin,
        result,
        stdoutTail: tailLines(capture.stdout, 220),
        stderrTail: tailLines(capture.stderr, 80),
      },
      !result.ok,
    )
  } catch (error) {
    return toolResult(
      {
        ok: false,
        ssh: ssh.redacted,
        steamHome,
        expectedWrapperBin,
        error: error instanceof Error ? error.message : String(error),
      },
      true,
    )
  }
}

type SteamLaunchClassifyOptions = {
  readonly appId: string
  readonly expectedGameExe: string
  readonly processNeedle?: string
}

export function classifySteamLaunchTranscript(
  transcript: string,
  options: SteamLaunchClassifyOptions,
) {
  const processAdded = transcript.includes("Game process added")
  const processRemoved = transcript.includes("Game process removed")
  const gamePidMatches = [...transcript.matchAll(/GAME_PID=(\d+)/g)].map(
    match => match[1],
  )
  const gameRunning = gamePidMatches.length > 0
  const gpuFreedreno = /libvulkan_freedreno\.so/.test(transcript)
  const renderNode = /renderD128|renderD\d+/.test(transcript)
  const inputAccess = /\/dev\/input|\/dev\/uinput|uinput/.test(transcript)
  const gamescopedSteam = transcript
    .split(/\r?\n/)
    .some(line =>
      /(?:^|\s)(?:\/[^\s]+\/)?gamescope\b.*\bkorri-steam-guest\b/.test(line),
    )
  const realProtonCachyos =
    /compatibilitytools\.d\/proton-cachyos-11\.0-20260601-slr-arm64\/proton/.test(
      transcript,
    )
  const steamLinuxRuntime4 = /SteamLinuxRuntime_4\//.test(transcript)
  const steamLinuxRuntimeSniper = /SteamLinuxRuntime_sniper\//.test(transcript)
  const officialProtonFallback =
    /steamapps\/common\/Proton(?:\s|-)/.test(transcript) && !realProtonCachyos
  const waitingForUser = /waiting for user response/.test(transcript)
  const firstRunSetup =
    /Upgrading prefix|Successfully registered DLL|ProcessingInstallScript/.test(
      transcript,
    )
  const fexMissing =
    /FEX: No such file or directory|\/FEX: No such file|FEX.*No such file/.test(
      transcript,
    )
  const execFormat = /Exec format error|cannot execute binary file/.test(
    transcript,
  )
  const runtimeHelperExecFormat =
    execFormat && /pressure-vessel|pv-adverb|srt-bwrap/.test(transcript)
  const launchChain = classifySteamLaunchChain({
    realProtonCachyos,
    steamLinuxRuntime4,
    steamLinuxRuntimeSniper,
    officialProtonFallback,
    runtimeHelperExecFormat,
  })
  const protonFailure =
    /Assertion failed|Unhandled exception|wine:.*failed|Proton:.*failed/i.test(
      transcript,
    )

  const signals = {
    processAdded,
    processRemoved,
    gameRunning,
    gamePids: gamePidMatches,
    gpuFreedreno,
    renderNode,
    inputAccess,
    waitingForUser,
    firstRunSetup,
    fexMissing,
    execFormat,
    runtimeHelperExecFormat,
    protonFailure,
    gamescopedSteam,
    realProtonCachyos,
    steamLinuxRuntime4,
    steamLinuxRuntimeSniper,
    officialProtonFallback,
    launchChain,
    validGamescopedProtonProof:
      gameRunning && gamescopedSteam && realProtonCachyos,
    appId: options.appId,
    expectedGameExe: options.expectedGameExe,
    processNeedle: options.processNeedle,
  }

  let outcome:
    | "running_gpu"
    | "running_unverified_gpu"
    | "waiting_for_user"
    | "first_run_setup"
    | "failed_fex_missing"
    | "failed_exec_format"
    | "failed_proton"
    | "exited"
    | "no_launch_observed"
  if (fexMissing) outcome = "failed_fex_missing"
  else if (execFormat) outcome = "failed_exec_format"
  else if (protonFailure) outcome = "failed_proton"
  else if (gameRunning && gpuFreedreno && renderNode) outcome = "running_gpu"
  else if (gameRunning) outcome = "running_unverified_gpu"
  else if (processAdded && processRemoved) outcome = "exited"
  else if (waitingForUser) outcome = "waiting_for_user"
  else if (firstRunSetup) outcome = "first_run_setup"
  else outcome = "no_launch_observed"

  return { outcome, launchChain, signals }
}

type SteamLaunchChain =
  | "intended_cachyos_arm64"
  | "official_runtime4_fallback"
  | "legacy_sniper_runtime"
  | "runtime4_helper_failure"
  | "sniper_helper_failure"
  | "no_runtime_observed"

function classifySteamLaunchChain(input: {
  readonly realProtonCachyos: boolean
  readonly steamLinuxRuntime4: boolean
  readonly steamLinuxRuntimeSniper: boolean
  readonly officialProtonFallback: boolean
  readonly runtimeHelperExecFormat: boolean
}): SteamLaunchChain {
  if (input.runtimeHelperExecFormat && input.steamLinuxRuntime4)
    return "runtime4_helper_failure"
  if (input.runtimeHelperExecFormat && input.steamLinuxRuntimeSniper)
    return "sniper_helper_failure"
  if (input.realProtonCachyos) return "intended_cachyos_arm64"
  if (input.officialProtonFallback && input.steamLinuxRuntime4)
    return "official_runtime4_fallback"
  if (input.steamLinuxRuntimeSniper) return "legacy_sniper_runtime"
  return "no_runtime_observed"
}

type RuntimeVerifyOptions = {
  readonly steamHome: string
  readonly expectedWrapperBin: string
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function hasExpectedFexTrampoline(
  wrapperSection: string,
  expectedWrapperBin: string,
): boolean {
  const expected = escapeRegex(expectedWrapperBin)
  return new RegExp(
    `exec\\s+${expected}\\s+"\\$0\\.x86_64"\\s+(?:"\\$@"|"\\$\\{filtered_args\\[@\\]\\}")`,
  ).test(wrapperSection)
}

export function classifySteamRuntimeVerifyTranscript(
  transcript: string,
  options: RuntimeVerifyOptions,
) {
  const pressureVesselWrap = section(transcript, "WRAPPER_PRESSURE_VESSEL_WRAP")
  const pvAdverb = section(transcript, "WRAPPER_PV_ADVERB")
  const checks = [
    checkSignal(
      "pressure-vessel-wrap uses expected FEX trampoline",
      hasExpectedFexTrampoline(pressureVesselWrap, options.expectedWrapperBin),
    ),
    checkSignal(
      "pv-adverb uses expected FEX trampoline",
      hasExpectedFexTrampoline(pvAdverb, options.expectedWrapperBin),
    ),
    checkSignal(
      "pressure-vessel-wrap x86_64 backup exists",
      /WRAPPER_PRESSURE_VESSEL_WRAP_BACKUP_EXISTS=yes/.test(transcript),
    ),
    checkSignal(
      "pv-adverb x86_64 backup exists",
      /WRAPPER_PV_ADVERB_BACKUP_EXISTS=yes/.test(transcript),
    ),
    checkSignal(
      "runtime prep service uses full --apply repair",
      /ExecStart=.*steam-guest-runtime-prep --apply/.test(transcript),
    ),
    checkSignal(
      "runtime prep service embeds FHS-visible wrapper path",
      /FEX_WRAPPER_BIN=\/usr\/bin\/FEX/.test(transcript),
    ),
    checkSignal(
      "runtime prep watches Proton 10",
      /PathChanged=.*Proton 10\.0\/proton/.test(transcript),
    ),
    checkSignal(
      "runtime prep watches Sniper pressure-vessel-wrap",
      /PathChanged=.*SteamLinuxRuntime_sniper\/pressure-vessel\/bin\/pressure-vessel-wrap/.test(
        transcript,
      ),
    ),
    checkSignal(
      "runtime prep watches Sniper pv-adverb",
      /PathChanged=.*SteamLinuxRuntime_sniper\/pressure-vessel\/libexec\/steam-runtime-tools-0\/pv-adverb/.test(
        transcript,
      ),
    ),
    checkSignal(
      "FEX rootfs Freedreno is x86_64",
      /FREEDRENO_EMACHINE=3e 00|FREEDRENO_EMACHINE=003e|FREEDRENO_MACHINE=x86-64/.test(
        transcript,
      ),
    ),
  ]
  const failures = checks.filter(check => !check.ok)
  return {
    ok: failures.length === 0,
    checks,
    failures,
    steamHome: options.steamHome,
    expectedWrapperBin: options.expectedWrapperBin,
  }
}

function steamLaunchSuperviseScript(options: {
  readonly appId: string
  readonly appName: string
  readonly expectedGameExe: string
  readonly processNeedle: string
  readonly timeoutSeconds: number
  readonly pollIntervalSeconds: number
  readonly steamHome: string
}): string {
  const appId = shellQuote(options.appId)
  const appName = shellQuote(options.appName)
  const exe = shellQuote(options.expectedGameExe)
  const processNeedle = shellQuote(options.processNeedle)
  const steamHome = shellQuote(options.steamHome)
  const timeout = Math.max(1, Math.floor(options.timeoutSeconds))
  const interval = Math.max(1, Math.floor(options.pollIntervalSeconds))
  return `set +e
app_id=${appId}
app_name=${appName}
expected_exe=${exe}
process_needle=${processNeedle}
steam_home=${steamHome}
start_epoch=$(date +%s)
deadline=$((start_epoch + ${timeout}))
echo "WATCH_MARKER=$(date '+%Y-%m-%d %H:%M:%S')"
echo "APP_ID=$app_id"
echo "APP_NAME=$app_name"
echo "EXPECTED_GAME_EXE=$expected_exe"
echo "PROCESS_NEEDLE=$process_needle"
rootfs=$(readlink "$steam_home/fex-rootfs" 2>/dev/null || true)
echo "ACTIVE_FEX_ROOTFS=$rootfs"
echo "MESA26_STAGE=$(cat "$steam_home/fex-data/RootFS/.korri-mesa26-stage-current" 2>/dev/null || true)"
echo "###ROOTFS_PACKAGES"
if [ -n "$rootfs" ] && [ -d "$rootfs/var/lib/pacman/local" ]; then
  for package in mesa lib32-mesa vulkan-freedreno lib32-vulkan-freedreno vulkan-icd-loader; do
    desc=$(find "$rootfs/var/lib/pacman/local" -maxdepth 1 -type d -name "$package-*" 2>/dev/null | sort | tail -1)/desc
    if [ -f "$desc" ]; then
      awk -v pkg="$package" '
        $0 == "%NAME%" { getline name }
        $0 == "%VERSION%" { getline version }
        END { if (name != "" || version != "") print pkg "=" name " " version }
      ' "$desc"
    fi
  done
fi
echo "###APP_MANIFEST"
for manifest in "$steam_home/steamapps/appmanifest_$app_id.acf" /var/lib/korri/content/games/steam/steamapps/appmanifest_$app_id.acf; do
  [ -f "$manifest" ] || continue
  echo "$manifest"
  awk -F'"' '/"name"|"StateFlags"|"installdir"|"LastUpdated"|"SizeOnDisk"/{print}' "$manifest"
done
echo "###DISCOVERED_EXES"
find "$steam_home/steamapps/common" /var/lib/korri/content/games/steam/steamapps/common -maxdepth 6 -type f -iname "*.exe" 2>/dev/null | sed -n '1,160p'
while [ "$(date +%s)" -le "$deadline" ]; do
  echo "===POLL $(date '+%Y-%m-%d %H:%M:%S')==="
  echo "###PROCESSES"
  ps -eo pid,stat,etime,pcpu,pmem,cmd | awk -v exe="$expected_exe" -v needle="$process_needle" '
    /SteamLaunch AppId=|wine64-preloader|wine-preloader|wineserver|pressure-vessel|pv-adverb|proton|gamescope/ {print}
    index($0, "/usr/bin/FEX") {print}
    exe != "" && index($0, exe) {print}
    needle != "" && needle != exe && index($0, needle) {print}
  ' | sed -n '1,260p'
  echo "###JOURNAL"
  journalctl --no-pager -u korri-steam-gamescope.service -u korri-steam.service --since "@$start_epoch" 2>/dev/null | grep -E "$app_id|$expected_exe|$process_needle|FEX|pressure-vessel|Exec format|No such file|Game Recording|Adding process|Removing process|ERROR|err:|wine|vulkan|freedreno|Mesa|Turnip|Assertion|Unhandled|Upgrading prefix|Successfully registered DLL|ProcessingInstallScript|gamescoped Steam|korri-steam-app" | tail -180 || true
  echo "###CONSOLE"
  tail -220 "$steam_home/logs/console_log.txt" 2>/dev/null | grep -E "GameAction \\[AppID $app_id|Game process|$expected_exe|$process_needle|CreatingProcess|Completed|failed|error|FEX|pressure|Proton|continues|waiting|ProcessingInstallScript" | tail -120 || true
  live=0
  for pid in $(ps -eo pid=,cmd= | awk -v exe="$expected_exe" -v needle="$process_needle" '((exe != "" && index($0, exe)) || (needle != "" && index($0, needle))) && $0 !~ /awk/ {print $1}'); do
    live=1
    echo "GAME_PID=$pid"
    tr '\\0' '\\n' < "/proc/$pid/environ" 2>/dev/null | grep -E 'SteamAppId|SteamGameId|FEX|DXVK|VK|MESA|DISPLAY|WAYLAND' | sort || true
    echo "###MAPS $pid"
    grep -aoE '/[^ ]*(libvulkan_freedreno|winevulkan|libvulkan|libGL|d3d|dxvk|vkd3d)[^ ]*' "/proc/$pid/maps" 2>/dev/null | sort -u || true
    echo "###FDS $pid"
    ls -l "/proc/$pid/fd" 2>/dev/null | grep -E 'renderD[0-9]+|card[0-9]+|uinput|/dev/input' || true
  done
  if [ "$live" = 1 ]; then
    break
  fi
  sleep ${interval}
done
`
}

function steamRuntimeVerifyScript(options: {
  readonly steamHome: string
}): string {
  const steamHome = shellQuote(options.steamHome)
  return `set +e
steam_home=${steamHome}
wrap="$steam_home/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/bin/pressure-vessel-wrap"
pv="$steam_home/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/libexec/steam-runtime-tools-0/pv-adverb"
freedreno="$steam_home/fex-rootfs/usr/lib/libvulkan_freedreno.so"
echo "###CURRENT_SYSTEM"
readlink /run/current-system 2>/dev/null || true
echo "###RUNTIME_PREP_UNIT"
systemctl cat korri-steam-runtime-prep.service korri-steam-runtime-prep.path 2>/dev/null || true
echo "###RUNTIME_PREP_STATE"
systemctl show -p ActiveState -p SubState -p Result -p ExecMainStatus korri-steam-runtime-prep.service korri-steam-runtime-prep.path 2>/dev/null || true
echo "###WRAPPER_PRESSURE_VESSEL_WRAP"
sed -n '1,80p' "$wrap" 2>/dev/null || true
[ -f "$wrap.x86_64" ] && echo WRAPPER_PRESSURE_VESSEL_WRAP_BACKUP_EXISTS=yes || echo WRAPPER_PRESSURE_VESSEL_WRAP_BACKUP_EXISTS=no
echo "###WRAPPER_PV_ADVERB"
sed -n '1,80p' "$pv" 2>/dev/null || true
[ -f "$pv.x86_64" ] && echo WRAPPER_PV_ADVERB_BACKUP_EXISTS=yes || echo WRAPPER_PV_ADVERB_BACKUP_EXISTS=no
echo "###FREEDRENO"
if [ -f "$freedreno" ]; then
  machine=$(od -An -tx1 -j18 -N2 "$freedreno" 2>/dev/null | tr -d '[:space:]')
  case "$machine" in
    3e00) echo FREEDRENO_EMACHINE="3e 00"; echo FREEDRENO_MACHINE=x86-64 ;;
    b700) echo FREEDRENO_EMACHINE="b7 00"; echo FREEDRENO_MACHINE=aarch64 ;;
    *) echo FREEDRENO_EMACHINE="$machine" ;;
  esac
else
  echo FREEDRENO_MISSING=yes
fi
`
}

type SshInvocation = {
  readonly command: string
  readonly args: readonly string[]
  readonly redacted: readonly string[]
}

function sshInvocationFromParams(
  params: Record<string, unknown>,
): SshInvocation {
  const host = stringParam(params.host, "bandai-guest-ip")
  const user =
    typeof params.sshUser === "string" && params.sshUser.trim()
      ? `${params.sshUser.trim()}@`
      : ""
  const target = `${user}${host}`
  const args: string[] = []
  const sshConfig = stringParam(
    params.sshConfig,
    "/tmp/bandai-deploy/ssh_config_ip",
  )
  if (sshConfig) args.push("-F", sshConfig)
  args.push(target, "bash -s")
  return { command: "ssh", args, redacted: ["ssh", ...args] }
}

async function runSshScript(
  ssh: SshInvocation,
  script: string,
  signal: AbortSignal | undefined,
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ssh.command, ssh.args, { signal })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", chunk => {
      stdout += String(chunk)
    })
    child.stderr.on("data", chunk => {
      stderr += String(chunk)
    })
    child.on("error", reject)
    child.on("close", code => {
      if (code === 0) resolve({ stdout, stderr })
      else
        reject(
          new Error(`ssh exited ${code}: ${tailLines(stderr || stdout, 40)}`),
        )
    })
    child.stdin.end(script)
  })
}

function section(transcript: string, name: string): string {
  const marker = `###${name}`
  const start = transcript.indexOf(marker)
  if (start < 0) return ""
  const rest = transcript.slice(start + marker.length)
  const next = rest.indexOf("\n###")
  return next < 0 ? rest : rest.slice(0, next)
}

function checkSignal(name: string, ok: boolean) {
  return { name, ok }
}

function stringParam(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback
}

function numberParam(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function tailLines(value: string, count: number): string {
  const lines = value.split(/\r?\n/)
  return lines.slice(Math.max(0, lines.length - count)).join("\n")
}
