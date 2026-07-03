import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import {
  connectMoonlightControl,
  type MoonlightControlClient,
} from "@platform/stream/moonlight-control-client"
import type {
  MoonlightControlStateSnapshotResult,
  MoonlightControlSuccessResponse,
} from "@platform/stream/moonlight-control-protocol"

/**
 * `korri stream` live quality controls. Connects to the active Moonlight
 * stream's local control connection point, changes bitrate / FPS / resolution,
 * and reads back the value the host reports as applied.
 *
 * The command targets a locally reachable control socket. To drive a remote
 * device, run it over SSH on that device (for example `ssh <device> korri
 * stream bitrate 20000`).
 */
export type StreamQualityChange =
  | { readonly kind: "bitrate"; readonly bitrateKbps: number }
  | { readonly kind: "fps"; readonly fps: number }
  | {
      readonly kind: "resolution"
      readonly width: number
      readonly height: number
    }

export interface StreamQualityIo {
  readonly socketPath?: string
  readonly discoverSocket?: () => Promise<string | undefined>
  readonly connect?: (socketPath: string) => Promise<MoonlightControlClient>
  readonly write?: (line: string) => void
  readonly writeError?: (line: string) => void
  readonly sleep?: (ms: number) => Promise<void>
}

const APPLY_SETTLE_MS = 1500

export async function runStreamShow(io: StreamQualityIo = {}): Promise<number> {
  return withStream(io, async (client, write) => {
    write(formatState(await readSnapshot(client)))
    return 0
  })
}

export async function runStreamSet(
  change: StreamQualityChange,
  io: StreamQualityIo = {},
): Promise<number> {
  const sleep =
    io.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  return withStream(io, async (client, write) => {
    const before = await readSnapshot(client).catch(() => undefined)
    await applyChange(client, change)
    await sleep(APPLY_SETTLE_MS)
    const after = await readSnapshot(client)
    write(formatSetOutcome(change, before, after))
    return 0
  })
}

async function withStream(
  io: StreamQualityIo,
  run: (
    client: MoonlightControlClient,
    write: (line: string) => void,
  ) => Promise<number>,
): Promise<number> {
  const write = io.write ?? (line => console.log(line))
  const writeError = io.writeError ?? (line => console.error(line))
  const discover = io.discoverSocket ?? (() => discoverMoonlightControlSocket())
  const connect =
    io.connect ?? (path => connectMoonlightControl({ socketPath: path }))

  const socketPath = io.socketPath ?? (await discover())
  if (!socketPath) {
    writeError(
      "no running stream found (start a stream first, or pass --socket <path>)",
    )
    return 1
  }

  let client: MoonlightControlClient | undefined
  try {
    client = await connect(socketPath)
    return await run(client, write)
  } catch (error) {
    writeError(describeControlError(error))
    return 1
  } finally {
    client?.close()
  }
}

function describeControlError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (error !== null && typeof error === "object") {
    const record = error as Record<string, unknown>
    const message =
      typeof record.message === "string" ? record.message : undefined
    const detail =
      typeof record.data === "string"
        ? record.data
        : typeof record.status === "string"
          ? record.status
          : undefined
    if (message) return detail ? `${message} (${detail})` : message
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error)
}

async function readSnapshot(
  client: MoonlightControlClient,
): Promise<MoonlightControlStateSnapshotResult> {
  const response = await client.state()
  const result = resultOf(response)
  if (result?._tag !== "state.snapshot") {
    throw new Error("device did not return a stream state snapshot")
  }
  return result as MoonlightControlStateSnapshotResult
}

function applyChange(
  client: MoonlightControlClient,
  change: StreamQualityChange,
): Promise<unknown> {
  switch (change.kind) {
    case "bitrate":
      return client.setBitrate({ bitrateKbps: change.bitrateKbps })
    case "fps":
      return client.setFps({ fps: change.fps })
    case "resolution":
      return client.setResolution({
        width: change.width,
        height: change.height,
      })
  }
}

function resultOf(
  response: MoonlightControlSuccessResponse,
): { readonly _tag: string } | undefined {
  const result = response.result as { readonly _tag?: string } | undefined
  return result && typeof result._tag === "string"
    ? (result as { readonly _tag: string })
    : undefined
}

export function parseResolution(
  raw: string,
): { readonly width: number; readonly height: number } | undefined {
  const match = /^(\d+)x(\d+)$/.exec(raw.trim())
  if (!match) return undefined
  const width = Number(match[1])
  const height = Number(match[2])
  return width > 0 && height > 0 ? { width, height } : undefined
}

export function formatState(
  snapshot: MoonlightControlStateSnapshotResult,
): string {
  const lines = [
    `session:      ${snapshot.session.state} (${snapshot.session.sessionId})`,
    `stream now:   ${quality(snapshot)}`,
    `applied:      ${applied(snapshot)}`,
  ]
  const last = snapshot.runtimeSettings.lastCommand
  if (last) lines.push(`last change:  ${last.command} -> ${last.status}`)
  return lines.join("\n")
}

export function formatSetOutcome(
  change: StreamQualityChange,
  before: MoonlightControlStateSnapshotResult | undefined,
  after: MoonlightControlStateSnapshotResult,
): string {
  const last = after.runtimeSettings.lastCommand
  const outcome = last
    ? `${last.command} -> ${last.status}`
    : "no terminal result yet"
  return [
    `requested:    ${describeChange(change)}`,
    `now applied:  ${applied(after)}`,
    `device says:  ${outcome}`,
    ...(before ? [`was applied:  ${applied(before)}`] : []),
  ].join("\n")
}

function quality(snapshot: MoonlightControlStateSnapshotResult): string {
  const q = snapshot.streamQuality
  return settingsLine(q.bitrateKbps, q.fps, q.width, q.height)
}

function applied(snapshot: MoonlightControlStateSnapshotResult): string {
  const r = snapshot.runtimeSettings
  return settingsLine(
    r.appliedBitrateKbps,
    r.appliedFps,
    r.appliedResolution?.width,
    r.appliedResolution?.height,
  )
}

function settingsLine(
  bitrateKbps: number | undefined,
  fps: number | undefined,
  width: number | undefined,
  height: number | undefined,
): string {
  const parts = [
    bitrateKbps === undefined ? undefined : `${bitrateKbps} kbps`,
    fps === undefined ? undefined : `${fps} fps`,
    width && height ? `${width}x${height}` : undefined,
  ].filter((part): part is string => part !== undefined)
  return parts.length > 0 ? parts.join(", ") : "unknown"
}

function describeChange(change: StreamQualityChange): string {
  switch (change.kind) {
    case "bitrate":
      return `${change.bitrateKbps} kbps`
    case "fps":
      return `${change.fps} fps`
    case "resolution":
      return `${change.width}x${change.height}`
  }
}

export function resolveMoonlightControlRoot(
  env: Record<string, string | undefined> = process.env,
  uid?: number,
): string | undefined {
  const base =
    env.XDG_RUNTIME_DIR?.trim() ||
    env.KORRI_GAME_STREAM_RUNTIME_DIR?.trim() ||
    (uid === undefined ? undefined : `/run/user/${uid}`)
  return base ? join(base, "korri-moonlight") : undefined
}

export function newestSocketPath(
  candidates: readonly { readonly path: string; readonly mtimeMs: number }[],
): string | undefined {
  return candidates.reduce<
    { readonly path: string; readonly mtimeMs: number } | undefined
  >(
    (newest, candidate) =>
      !newest || candidate.mtimeMs > newest.mtimeMs ? candidate : newest,
    undefined,
  )?.path
}

async function discoverMoonlightControlSocket(
  env: Record<string, string | undefined> = process.env,
): Promise<string | undefined> {
  const root = resolveMoonlightControlRoot(env, safeUid())
  if (!root) return undefined

  let entries: readonly string[]
  try {
    entries = await readdir(root)
  } catch {
    return undefined
  }

  const candidates: { path: string; mtimeMs: number }[] = []
  for (const entry of entries) {
    const path = join(root, entry, "control.sock")
    try {
      candidates.push({ path, mtimeMs: (await stat(path)).mtimeMs })
    } catch {
      // no control socket under this session dir; skip
    }
  }
  return newestSocketPath(candidates)
}

function safeUid(): number | undefined {
  try {
    return typeof process.getuid === "function" ? process.getuid() : undefined
  } catch {
    return undefined
  }
}
