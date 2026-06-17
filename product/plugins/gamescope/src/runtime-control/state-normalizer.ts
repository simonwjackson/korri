import { GAMESCOPE_SCALING_FILTERS } from "../stream-control/control-surface"
import type { GamescopeScalingFilter } from "./protocol"

export type { GamescopeScalingFilter } from "./protocol"

export interface ResolutionReadback {
  readonly width: number
  readonly height: number
}

export interface GamescopeStateReadback {
  readonly fps: number | null
  readonly resolution: ResolutionReadback | null
  readonly sharpness: number | null
  readonly filter: GamescopeScalingFilter | null
}

export function normalizeGamescopeState(
  snapshot: unknown,
): GamescopeStateReadback {
  const result = rpcResult(snapshot)
  const mode = recordField(result, "xwaylandMode")
  const filter = result?.filter
  return {
    fps: firstNumber(result?.fps) ?? null,
    resolution: resolutionReadback(
      firstNumber(mode?.width),
      firstNumber(mode?.height),
    ),
    sharpness: firstNumber(result?.sharpness) ?? null,
    filter: readGamescopeScalingFilter(filter) ?? null,
  }
}

export function readGamescopeScalingFilter(
  value: unknown,
): GamescopeScalingFilter | undefined {
  return GAMESCOPE_SCALING_FILTERS.includes(value as GamescopeScalingFilter)
    ? (value as GamescopeScalingFilter)
    : undefined
}

function resolutionReadback(
  width: number | undefined,
  height: number | undefined,
): ResolutionReadback | null {
  return width === undefined || height === undefined ? null : { width, height }
}

function rpcResult(snapshot: unknown): Record<string, unknown> | undefined {
  if (!isRecord(snapshot)) return undefined
  const result = snapshot.result
  return isRecord(result) ? result : undefined
}

function recordField(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = record?.[key]
  return isRecord(value) ? value : undefined
}

function firstNumber(...values: readonly unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === "number")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
