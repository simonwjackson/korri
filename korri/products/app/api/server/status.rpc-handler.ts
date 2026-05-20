import { stat, readFile } from "node:fs/promises"
import { hostname } from "node:os"
import { join } from "node:path"
import { DataError } from "@shared/api/rpc/errors"
import { Effect } from "effect"
import { isStreamControlEnabled } from "../stream/control-mode"
import {
  ServerRunnerStatus,
  type ServerStatusPayload,
  ServerStatusResponse,
} from "./status.rpc"

type RunnerMode =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "exited"
  | "failed"

const RUNNER_STATUS_STALE_MS = 10 * 60 * 1000
const RUNNER_MODES = new Set<RunnerMode>([
  "idle",
  "starting",
  "running",
  "stopping",
  "exited",
  "failed",
])

export const handleServerStatus = (_payload: typeof ServerStatusPayload.Type) =>
  Effect.gen(function* () {
    const runner = yield* readRunnerStatus(
      defaultGameStreamStatusPath(process.env),
    )
    const enabled = isStreamControlEnabled(process.env)
    const serverId = process.env.KORRI_SERVER_ID ?? hostname()
    const displayName =
      process.env.KORRI_SERVER_NAME ?? `Korri Server on ${serverId}`

    return new ServerStatusResponse({
      serverId,
      displayName,
      protocolVersion: "1",
      capabilities: ["source", "stream"],
      status: enabled ? "available" : "stream-unavailable",
      streamControl: enabled ? "enabled" : "disabled",
      catalog: enabled ? "available" : "unavailable",
      ...(runner ? { runner } : {}),
      ...(enabled ? {} : { message: "Korri stream control is not enabled" }),
    })
  })

function defaultGameStreamStatusPath(
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (env.KORRI_GAME_STREAM_STATUS_PATH)
    return env.KORRI_GAME_STREAM_STATUS_PATH
  if (env.XDG_RUNTIME_DIR) {
    return join(env.XDG_RUNTIME_DIR, "korri-game-stream", "status.json")
  }
  return undefined
}

function readRunnerStatus(statusPath: string | undefined) {
  if (!statusPath) return Effect.succeed(undefined)
  return Effect.tryPromise({
    try: async () => {
      let raw: string
      let modifiedAt: Date
      try {
        const stats = await stat(statusPath)
        modifiedAt = stats.mtime
        raw = await readFile(statusPath, "utf8")
      } catch (error) {
        if (isFileNotFoundError(error)) return undefined
        throw error
      }
      const parsed = JSON.parse(raw) as unknown
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("mode" in parsed)
      ) {
        return undefined
      }
      const mode = (parsed as { readonly mode?: unknown }).mode
      if (typeof mode !== "string") return undefined
      const runnerMode = mode as RunnerMode
      if (!RUNNER_MODES.has(runnerMode)) return undefined
      return new ServerRunnerStatus({
        mode: runnerMode,
        observedAt: modifiedAt.toISOString(),
        stale: Date.now() - modifiedAt.getTime() > RUNNER_STATUS_STALE_MS,
      })
    },
    catch: error =>
      new DataError({
        reason: "ReadFailed",
        message:
          error instanceof Error ? error.message : "stream status read failed",
      }),
  })
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "ENOENT"
  )
}
