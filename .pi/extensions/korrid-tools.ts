import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

type RpcTag = string

type KorridQueryParams = {
  readonly host?: string
  readonly url?: string
  readonly command?:
    | "status"
    | "library"
    | "sources"
    | "source-status"
    | "stream-config"
    | "stream-state"
    | "rpc"
  readonly tag?: string
  readonly payload?: unknown
  readonly compact?: boolean
}

type CommandSpec = {
  readonly tag: RpcTag
  readonly payload: unknown
}

type RpcExitFrame = {
  readonly _tag: "Exit"
  readonly requestId: string
  readonly exit:
    | { readonly _tag: "Success"; readonly value: unknown }
    | { readonly _tag: "Failure"; readonly cause?: unknown }
}

const COMMAND_ALIASES: Record<
  Exclude<KorridQueryParams["command"], "rpc" | undefined>,
  CommandSpec
> = {
  status: { tag: "app.server.status", payload: {} },
  library: { tag: "app.library.list", payload: {} },
  sources: { tag: "app.source.list", payload: {} },
  "source-status": { tag: "app.source.status", payload: {} },
  "stream-config": { tag: "app.stream-control.config.get", payload: {} },
  "stream-state": { tag: "app.stream-control.state.get", payload: {} },
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "korrid_query",
    label: "Korrid Query",
    description:
      "Query a Korri daemon (korrid) on a given machine via its RPC API. Read-only by default; use for status, library, source, and stream-state inspection.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        host: {
          type: "string",
          description:
            "Host or IP for korrid, e.g. 'bandai' or '192.168.1.237'. Defaults to 127.0.0.1. Ignored when url is set.",
        },
        url: {
          type: "string",
          description:
            "Full korrid base URL or RPC URL. '/api/rpc' is appended when omitted.",
        },
        command: {
          enum: [
            "status",
            "library",
            "sources",
            "source-status",
            "stream-config",
            "stream-state",
            "rpc",
          ],
          description:
            "Read-only query to run. Use 'rpc' with tag/payload for another read-only RPC.",
        },
        tag: {
          type: "string",
          description: "RPC tag when command is 'rpc', e.g. app.library.list.",
        },
        payload: {
          description: "Payload object when command is 'rpc'. Defaults to {}.",
        },
        compact: {
          type: "boolean",
          description:
            "Return a compact summary for large list commands such as library/source listing.",
        },
      },
    },
    async execute(_toolCallId, params: KorridQueryParams, signal) {
      const rpcUrl = normalizeRpcUrl(
        params.url ??
          (params.host ? hostToUrl(params.host) : undefined) ??
          process.env.KORRI_RPC_URL ??
          process.env.KORRI_PUBLIC_API_BASE_URL ??
          "http://127.0.0.1:3001/api/rpc",
      )
      const command = params.command ?? "status"
      const spec = commandSpec(command, params)

      try {
        const rawResult = await callKorridRpc(rpcUrl, spec, signal)
        const result = params.compact
          ? compactResult(command, rawResult)
          : rawResult
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
    },
  })
}

async function callKorridRpc(
  rpcUrl: string,
  spec: CommandSpec,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const requestId = String(Date.now())
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
    signal,
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`)
  }

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

function commandSpec(
  command: NonNullable<KorridQueryParams["command"]>,
  params: KorridQueryParams,
): CommandSpec {
  if (command === "rpc") {
    if (!params.tag) throw new Error("command='rpc' requires tag")
    return { tag: params.tag, payload: params.payload ?? {} }
  }
  return COMMAND_ALIASES[command]
}

function normalizeRpcUrl(value: string): string {
  const trimmed = value.replace(/\/+$/, "")
  return trimmed.endsWith("/api/rpc") ? trimmed : `${trimmed}/api/rpc`
}

function hostToUrl(host: string): string {
  if (host.startsWith("http://") || host.startsWith("https://")) return host
  return `http://${host}:3001/api/rpc`
}

function compactResult(command: string, result: unknown): unknown {
  if ((command === "library" || command === "sources") && isRecord(result)) {
    const games = Array.isArray(result.games) ? result.games : []
    return {
      count: games.length,
      games: games.map(game => {
        const record = isRecord(game) ? game : {}
        return {
          id: record.id,
          title: record.title ?? record.name,
          source: record.source,
          releases: Array.isArray(record.releases)
            ? record.releases.map(release =>
                isRecord(release)
                  ? {
                      id: release.id,
                      system: release.system,
                      launchable: release.launchable,
                      apps: release.apps,
                    }
                  : release,
              )
            : undefined,
        }
      }),
    }
  }
  return result
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
