import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import {
  parseStreamBoundaryArgs,
  serializeStreamBoundaries,
} from "@platform/stream/stream-adaptive-boundaries"
import type { StreamControlClient } from "@platform/stream-control/stream-control-client"
import {
  connectStreamControlSession,
  type StreamControlSession,
} from "@platform/stream-control/stream-control-session"
import { createFirstPartyPluginState } from "@product/plugin-host/state"

/**
 * Local structural view of the stream state snapshot this CLI reads back. The
 * streamer's wire snapshot is opaque at this layer (session.state() returns
 * unknown); this view types only the fields the quality display uses, so the
 * command needs no streamer-module import (keeps the plugin removable).
 */
interface StreamHealthSampleView {
  readonly seq: number
  readonly sampledAtMs: number
  readonly rttMs?: number
  readonly rttVarianceMs?: number
  readonly lossFraction?: number
  readonly deliveredBitrateKbps?: number
  readonly requestedBitrateKbps?: number
  readonly deliveredFps?: number
  readonly requestedFps?: number
  readonly framesDropped?: number
  readonly decodeTimeMs?: number
  readonly queueDepth?: number
  readonly firstFrameMs?: number
  readonly freshness?: "fresh" | "stale" | "no-data"
}

interface StreamStateSnapshotView {
  readonly _tag?: string
  readonly session: { readonly state: string; readonly sessionId: string }
  readonly streamQuality: {
    readonly bitrateKbps?: number
    readonly fps?: number
    readonly width?: number
    readonly height?: number
    readonly connection?: "unknown" | "poor" | "okay" | "good"
    readonly sample?: StreamHealthSampleView
  }
  readonly runtimeSettings: {
    readonly lastCommand?: { readonly command: string; readonly status: string }
    readonly appliedBitrateKbps?: number
    readonly appliedFps?: number
    readonly appliedResolution?: {
      readonly width?: number
      readonly height?: number
    }
  }
}

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

export interface StreamAdaptiveCliIo {
  readonly client?: StreamControlClient
  readonly dryRun?: boolean
  readonly json?: boolean
  readonly intervalMs?: number
  readonly iterations?: number
  readonly write?: (line: string) => void
  readonly writeError?: (line: string) => void
  readonly sleep?: (ms: number) => Promise<void>
}

export interface StreamQualityIo {
  readonly socketPath?: string
  readonly discoverSocket?: () => Promise<string | undefined>
  readonly connect?: (socketPath: string) => Promise<StreamControlSession>
  readonly write?: (line: string) => void
  readonly writeError?: (line: string) => void
  readonly sleep?: (ms: number) => Promise<void>
}

const APPLY_SETTLE_MS = 1500
const ADAPTIVE_SET_ACTION = "app.stream-control.adaptive.set"
const ADAPTIVE_DRY_RUN_ACTION = "app.stream-control.adaptive.dry-run"

export async function runStreamAdaptiveSet(
  args: readonly string[],
  io: StreamAdaptiveCliIo = {},
): Promise<number> {
  const write = io.write ?? (line => console.log(line))
  const writeError = io.writeError ?? (line => console.error(line))
  const client = io.client
  if (!client) {
    writeError("stream-control RPC client is not available")
    return 1
  }
  try {
    parseStreamBoundaryArgs(args)
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error))
    return 2
  }
  try {
    const action = io.dryRun ? ADAPTIVE_DRY_RUN_ACTION : ADAPTIVE_SET_ACTION
    const response = await client.applyAction({ action, payload: { args } })
    write(
      io.dryRun
        ? `adaptive stream dry-run: ${JSON.stringify(response)}`
        : "adaptive stream boundaries applied",
    )
    return 0
  } catch (error) {
    writeError(describeControlError(error))
    return 1
  }
}

export async function runStreamAdaptiveShow(
  io: StreamAdaptiveCliIo = {},
): Promise<number> {
  const write = io.write ?? (line => console.log(line))
  const writeError = io.writeError ?? (line => console.error(line))
  const client = io.client
  if (!client) {
    writeError("stream-control RPC client is not available")
    return 1
  }
  try {
    const state = await client.getState()
    write(io.json ? JSON.stringify(state) : formatAdaptiveState(state))
    return 0
  } catch (error) {
    writeError(describeControlError(error))
    return 1
  }
}

export async function runStreamAdaptiveWatch(
  io: StreamAdaptiveCliIo = {},
): Promise<number> {
  const write = io.write ?? (line => console.log(line))
  const writeError = io.writeError ?? (line => console.error(line))
  const sleep =
    io.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const client = io.client
  if (!client) {
    writeError("stream-control RPC client is not available")
    return 1
  }
  const iterations = io.iterations ?? Number.POSITIVE_INFINITY
  const intervalMs = io.intervalMs ?? 1_000
  try {
    for (let i = 0; i < iterations; i += 1) {
      const state = await client.getState()
      write(io.json ? JSON.stringify(state) : formatAdaptiveState(state))
      if (i + 1 < iterations) await sleep(intervalMs)
    }
    return 0
  } catch (error) {
    writeError(describeControlError(error))
    return 1
  }
}

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

function formatAdaptiveState(state: unknown): string {
  const adaptive = asRecord(state)?.adaptive
  const record = asRecord(adaptive)
  if (!record || record.status === "disabled") return "adaptive:    disabled"
  if (record.status === "error") {
    return `adaptive:    error (${String(record.error ?? "unknown")})`
  }
  const readback = asRecord(record.readback)
  const enabled = readback?.enabled === true ? "enabled" : "disabled"
  const boundaries = asRecord(readback?.boundaries)
  const boundaryLine = boundaries
    ? serializeStreamBoundaries(
        boundaries as unknown as Parameters<
          typeof serializeStreamBoundaries
        >[0],
      ).join(" ")
    : "auto"
  const lastEvent = readback?.lastEvent
    ? `\nlast event:  ${JSON.stringify(readback.lastEvent)}`
    : ""
  return (
    [`adaptive:    ${enabled}`, `boundaries:   ${boundaryLine}`].join("\n") +
    lastEvent
  )
}

function asRecord(input: unknown): Record<string, unknown> | undefined {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : undefined
}

async function withStream(
  io: StreamQualityIo,
  run: (
    client: StreamControlSession,
    write: (line: string) => void,
  ) => Promise<number>,
): Promise<number> {
  const write = io.write ?? (line => console.log(line))
  const writeError = io.writeError ?? (line => console.error(line))
  const discover = io.discoverSocket ?? (() => discoverMoonlightControlSocket())
  const connect =
    io.connect ??
    (path =>
      connectStreamControlSession(
        createFirstPartyPluginState({ mode: "interactive" }).registry,
        { socketPath: path },
      ))

  const socketPath = io.socketPath ?? (await discover())
  if (!socketPath) {
    writeError(
      "no running stream found (start a stream first, or pass --socket <path>)",
    )
    return 1
  }

  let client: StreamControlSession | undefined
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
  client: StreamControlSession,
): Promise<StreamStateSnapshotView> {
  const response = await client.state()
  const result = resultOf(response)
  if (result?._tag !== "state.snapshot") {
    throw new Error("device did not return a stream state snapshot")
  }
  return result as unknown as StreamStateSnapshotView
}

function applyChange(
  client: StreamControlSession,
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

function resultOf(response: unknown): { readonly _tag: string } | undefined {
  const result = (response as { readonly result?: unknown }).result as
    | { readonly _tag?: string }
    | undefined
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

export function formatState(snapshot: StreamStateSnapshotView): string {
  const lines = [
    `session:      ${snapshot.session.state} (${snapshot.session.sessionId})`,
    `stream now:   ${quality(snapshot)}`,
    `applied:      ${applied(snapshot)}`,
    ...formatConnection(snapshot.streamQuality.connection),
    ...formatHealth(snapshot.streamQuality.sample),
  ]
  const last = snapshot.runtimeSettings.lastCommand
  if (last) lines.push(`last change:  ${last.command} -> ${last.status}`)
  return lines.join("\n")
}

export function formatSetOutcome(
  change: StreamQualityChange,
  before: StreamStateSnapshotView | undefined,
  after: StreamStateSnapshotView,
): string {
  const last = after.runtimeSettings.lastCommand
  const outcome = last
    ? `${last.command} -> ${last.status}`
    : "no terminal result yet"
  const coercion = describeCoercion(change, after)
  return [
    `requested:    ${describeChange(change)}`,
    `now applied:  ${applied(after)}`,
    ...(coercion ? [`coerced to:   ${coercion}`] : []),
    `device says:  ${outcome}`,
    ...(before ? [`was applied:  ${applied(before)}`] : []),
  ].join("\n")
}

// When the mechanism coerces a request to the nearest value the hardware can
// deliver (clamp to encoder min/max, round to even, same-ratio rounding), name
// the applied value so accept-and-adapt is visible rather than a silent swap.
function describeCoercion(
  change: StreamQualityChange,
  after: StreamStateSnapshotView,
): string | undefined {
  const suffix = "(nearest the hardware allows)"
  const r = after.runtimeSettings
  switch (change.kind) {
    case "bitrate": {
      const value = r.appliedBitrateKbps
      return value !== undefined && value !== change.bitrateKbps
        ? `${value} kbps ${suffix}`
        : undefined
    }
    case "fps": {
      const value = r.appliedFps
      return value !== undefined && value !== change.fps
        ? `${value} fps ${suffix}`
        : undefined
    }
    case "resolution": {
      const value = r.appliedResolution
      return value &&
        (value.width !== change.width || value.height !== change.height)
        ? `${value.width}x${value.height} ${suffix}`
        : undefined
    }
  }
}

function quality(snapshot: StreamStateSnapshotView): string {
  const q = snapshot.streamQuality
  return settingsLine(q.bitrateKbps, q.fps, q.width, q.height)
}

function formatConnection(
  connection: StreamStateSnapshotView["streamQuality"]["connection"],
): string[] {
  return connection === undefined ? [] : [`connection:   ${connection}`]
}

function formatHealth(sample: StreamHealthSampleView | undefined): string[] {
  if (!sample) return ["health:       not yet reported"]

  const rtt =
    sample.rttMs === undefined
      ? undefined
      : `rtt ${sample.rttMs} ms${
          sample.rttVarianceMs === undefined
            ? ""
            : ` ±${sample.rttVarianceMs} ms`
        }`
  const healthParts = [
    rtt,
    sample.lossFraction === undefined
      ? undefined
      : `loss ${percent(sample.lossFraction, 1)}`,
  ].filter(isString)
  const lines = [
    `health:       ${healthParts.length > 0 ? healthParts.join(", ") : "not yet reported"}`,
  ]

  const deliveryParts = [
    deliveryRatio(
      "bitrate",
      sample.deliveredBitrateKbps,
      sample.requestedBitrateKbps,
      formatMbpsValue,
      " Mbps",
    ),
    deliveryRatio("fps", sample.deliveredFps, sample.requestedFps, formatPlain),
  ].filter(isString)
  if (deliveryParts.length > 0) {
    lines.push(`delivery:     ${deliveryParts.join(", ")}`)
  }

  const decodeParts = [
    sample.framesDropped === undefined
      ? undefined
      : `dropped ${sample.framesDropped} frames/sample`,
    sample.decodeTimeMs === undefined
      ? undefined
      : `decode ${sample.decodeTimeMs} ms`,
    sample.queueDepth === undefined ? undefined : `queue ${sample.queueDepth}`,
    sample.firstFrameMs === undefined
      ? undefined
      : `first frame ${sample.firstFrameMs} ms`,
  ].filter(isString)
  if (decodeParts.length > 0) {
    lines.push(`decode:       ${decodeParts.join(", ")}`)
  }

  if (sample.freshness === "stale") {
    lines[0] = `${lines[0]} (stale)`
  }
  return lines
}

function deliveryRatio(
  label: string,
  delivered: number | undefined,
  requested: number | undefined,
  formatValue: (value: number) => string,
  suffix = "",
): string | undefined {
  if (delivered === undefined || requested === undefined || requested <= 0) {
    return undefined
  }
  return `${label} ${formatValue(delivered)}/${formatValue(requested)}${suffix} (${percent(delivered / requested, 0)})`
}

function formatMbpsValue(kbps: number): string {
  return (kbps / 1000).toFixed(1)
}

function formatPlain(value: number): string {
  return String(value)
}

function percent(value: number, digits: number): string {
  return `${(value * 100).toFixed(digits)}%`
}

function isString(value: string | undefined): value is string {
  return value !== undefined
}

function applied(snapshot: StreamStateSnapshotView): string {
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
