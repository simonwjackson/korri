import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { DataError } from "@shared/api/rpc/errors"
import { Effect } from "effect"
import { isStreamControlEnabled } from "../stream/control-mode"
import { type SourceStatusPayload, SourceStatusResponse } from "./status.rpc"

type RunnerMode =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "exited"
  | "failed"

const RUNNER_MODES = new Set<RunnerMode>([
  "idle",
  "starting",
  "running",
  "stopping",
  "exited",
  "failed",
])

export const handleSourceStatus = (_payload: typeof SourceStatusPayload.Type) =>
  Effect.gen(function* () {
    const runnerMode = yield* readRunnerMode(
      defaultGameStreamStatusPath(process.env),
    )
    const enabled = isStreamControlEnabled(process.env)
    return new SourceStatusResponse({
      status: enabled ? "available" : "stream-unavailable",
      streamControl: enabled ? "enabled" : "disabled",
      catalog: enabled ? "available" : "unavailable",
      ...(runnerMode ? { runnerMode } : {}),
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

function readRunnerMode(statusPath: string | undefined) {
  if (!statusPath) return Effect.succeed(undefined)
  return Effect.tryPromise({
    try: async () => {
      let raw: string
      try {
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
      return typeof mode === "string" && RUNNER_MODES.has(mode as RunnerMode)
        ? (mode as RunnerMode)
        : undefined
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
