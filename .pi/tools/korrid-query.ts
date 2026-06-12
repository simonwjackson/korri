#!/usr/bin/env bun

import { rpcProtocolHttpLayer } from "@platform/api/rpc/client-layer"
import { serverRpcGroup } from "@product/apps/portal/api/server/rpc-group"
import { Cause, Effect } from "effect"
import { RpcClient } from "effect/unstable/rpc"

type RpcTag = keyof typeof serverRpcGroup.requests & string

type CommandSpec = {
  readonly tag: RpcTag
  readonly payload: unknown
  readonly readOnly: boolean
}

const READ_COMMANDS = new Set([
  "status",
  "library",
  "sources",
  "source-status",
  "stream-config",
  "stream-state",
])

const COMMAND_ALIASES: Record<string, CommandSpec> = {
  status: {
    tag: "app.server.status",
    payload: {},
    readOnly: true,
  },
  library: {
    tag: "app.library.list",
    payload: {},
    readOnly: true,
  },
  sources: {
    tag: "app.source.list",
    payload: {},
    readOnly: true,
  },
  "source-status": {
    tag: "app.source.status",
    payload: {},
    readOnly: true,
  },
  "stream-config": {
    tag: "app.stream-control.config.get",
    payload: {},
    readOnly: true,
  },
  "stream-state": {
    tag: "app.stream-control.state.get",
    payload: {},
    readOnly: true,
  },
}

const args = process.argv.slice(2)

if (args.includes("--help") || args.includes("-h")) {
  printHelp()
  process.exit(0)
}

const { options, positionals } = parseArgs(args)
const rpcUrl = normalizeRpcUrl(
  options.url ??
    options.rpcUrl ??
    (options.host ? hostToUrl(options.host, options.port) : undefined) ??
    process.env.KORRI_RPC_URL ??
    process.env.KORRI_PUBLIC_API_BASE_URL ??
    "http://127.0.0.1:3001/api/rpc",
)
const command = positionals[0] ?? "status"
const compact = options.compact === "true" || options.compact === "1"

const spec = commandSpec(command, positionals.slice(1), options)
if (!spec.readOnly && options.yes !== "true") {
  fail(
    `Refusing mutating command '${command}' without --yes. Use read-only commands by default.`,
  )
}

const program = Effect.scoped(
  RpcClient.make(serverRpcGroup).pipe(
    Effect.flatMap(client => {
      const callable = (client as Record<string, (payload: unknown) => Effect.Effect<unknown, unknown>>)[
        spec.tag
      ]
      if (!callable) {
        return Effect.fail(new Error(`RPC tag is not in serverRpcGroup: ${spec.tag}`))
      }
      return callable(spec.payload)
    }),
    Effect.provide(rpcProtocolHttpLayer(rpcUrl)),
  ),
)

try {
  const result = await Effect.runPromise(program)
  printResult({ command, rpcUrl, tag: spec.tag, result, compact })
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        rpcUrl,
        command,
        error: error instanceof Error ? error.message : String(error),
        cause: Cause.isCause(error) ? String(error) : undefined,
      },
      null,
      2,
    ),
  )
  process.exit(1)
}

function commandSpec(
  command: string,
  rest: readonly string[],
  options: Record<string, string>,
): CommandSpec {
  const aliased = COMMAND_ALIASES[command]
  if (aliased) return aliased

  if (command === "rpc") {
    const tag = rest[0]
    if (!tag) fail("rpc requires a tag, e.g. rpc app.library.list '{}'")
    return {
      tag: tag as RpcTag,
      payload: parseJson(rest[1] ?? options.payload ?? "{}"),
      readOnly: READ_COMMANDS.has(tag),
    }
  }

  if (command === "launch") {
    const id = rest[0] ?? options.id
    if (!id) fail("launch requires a playable id")
    return {
      tag: "app.library.launch",
      payload: options.source
        ? { id, source: parseJson(options.source) }
        : { id },
      readOnly: false,
    }
  }

  fail(`Unknown command: ${command}`)
}

function printResult(input: {
  readonly command: string
  readonly rpcUrl: string
  readonly tag: string
  readonly result: unknown
  readonly compact: boolean
}) {
  const result = input.compact ? compactResult(input.command, input.result) : input.result
  console.log(
    JSON.stringify(
      {
        ok: true,
        rpcUrl: input.rpcUrl,
        tag: input.tag,
        result,
      },
      null,
      2,
    ),
  )
}

function compactResult(command: string, result: unknown): unknown {
  if (command === "library" && isRecord(result) && Array.isArray(result.games)) {
    return {
      count: result.games.length,
      games: result.games.map(game => {
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

  if (command === "sources" && isRecord(result) && Array.isArray(result.games)) {
    return {
      count: result.games.length,
      games: result.games.map(game => {
        const record = isRecord(game) ? game : {}
        return {
          id: record.id,
          title: record.title ?? record.name,
          source: record.source,
        }
      }),
    }
  }

  return result
}

function parseArgs(argv: readonly string[]): {
  readonly options: Record<string, string>
  readonly positionals: readonly string[]
} {
  const options: Record<string, string> = {}
  const positionals: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string
    if (!arg.startsWith("--")) {
      positionals.push(arg)
      continue
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2)
    const key = rawKey.replace(/-([a-z])/g, (_match, letter: string) =>
      letter.toUpperCase(),
    )
    if (inlineValue !== undefined) {
      options[key] = inlineValue
      continue
    }

    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith("--")) {
      options[key] = next
      index += 1
      continue
    }

    options[key] = "true"
  }
  return { options, positionals }
}

function normalizeRpcUrl(value: string): string {
  const trimmed = value.replace(/\/+$/, "")
  if (trimmed.endsWith("/api/rpc")) return trimmed
  return `${trimmed}/api/rpc`
}

function hostToUrl(host: string, port?: string): string {
  if (host.startsWith("http://") || host.startsWith("https://")) {
    return host
  }
  return `http://${host}:${port ?? "3001"}/api/rpc`
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch (error) {
    fail(`Invalid JSON payload: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function fail(message: string): never {
  console.error(message)
  printHelp()
  process.exit(2)
}

function printHelp() {
  console.log(`korrid-query — tiny repo-local helper for querying a korrid RPC server

Usage:
  bun .pi/tools/korrid-query.ts [--host HOST|--url URL] <command> [args]

Targets:
  --host bandai              Uses http://bandai:3001/api/rpc
  --host 192.168.1.239       Uses http://192.168.1.239:3001/api/rpc
  --url http://host:3001     Appends /api/rpc if omitted
  KORRI_RPC_URL=...          Default target override

Read-only commands:
  status                     app.server.status
  library [--compact]        app.library.list
  sources [--compact]        app.source.list
  source-status              app.source.status
  stream-config              app.stream-control.config.get
  stream-state               app.stream-control.state.get
  rpc <tag> [payload-json]   Call a typed app RPC tag

Mutating command:
  launch <playable-id> --yes app.library.launch

Examples:
  bun .pi/tools/korrid-query.ts --host bandai status
  bun .pi/tools/korrid-query.ts --host 192.168.1.239 library --compact
  bun .pi/tools/korrid-query.ts --url http://bandai:3001 rpc app.source.status '{}'
  bun .pi/tools/korrid-query.ts --host bandai launch downwell --yes
`)
}
