export interface StreamAdaptiveResolution {
  readonly width: number
  readonly height: number
}

export interface NumericLeverBoundary {
  readonly floor?: number
  readonly startup?: number
  readonly ceiling?: number
  readonly pinned?: number
  readonly free?: boolean
}

export interface ResolutionLeverBoundary {
  readonly floor?: StreamAdaptiveResolution
  readonly ceiling?: StreamAdaptiveResolution
  readonly pinned?: StreamAdaptiveResolution
  readonly free?: boolean
}

export interface StreamAdaptiveLeverBoundaries {
  readonly bitrate?: NumericLeverBoundary
  readonly fps?: NumericLeverBoundary
  readonly resolution?: ResolutionLeverBoundary
}

export interface StreamAdaptiveOutcomeBoundaries {
  readonly maxLatencyMs?: number
  readonly minDeliveredFps?: number
}

export interface StreamBoundaries {
  readonly levers: StreamAdaptiveLeverBoundaries
  readonly outcomes: StreamAdaptiveOutcomeBoundaries
  /** 0 = responsiveness, 1 = picture. */
  readonly lean?: number
  readonly auto?: "on" | "off"
}

export type StreamBoundaryKey =
  | "bitrate"
  | "fps"
  | "resolution"
  | "lean"
  | "auto"
  | "max-latency"
  | "min-fps"

export function defaultStreamBoundaries(): StreamBoundaries {
  return { levers: {}, outcomes: {} }
}

export function parseStreamBoundaryArgs(
  args: readonly string[],
): StreamBoundaries {
  let boundaries = defaultStreamBoundaries()
  for (const expression of args) {
    const equals = expression.indexOf("=")
    if (equals <= 0)
      throw new Error(`invalid boundary expression: ${expression}`)
    const rawKey = expression.slice(0, equals)
    const key = rawKey.startsWith("--")
      ? (rawKey.slice(2) as StreamBoundaryKey)
      : (rawKey as StreamBoundaryKey)
    const value = expression.slice(equals + 1)
    boundaries = applyBoundaryExpression(boundaries, key, value)
  }
  return boundaries
}

export function mergeStreamBoundaries(
  ...layers: readonly (StreamBoundaries | undefined)[]
): StreamBoundaries {
  return layers.reduce<StreamBoundaries>((merged, layer) => {
    if (!layer) return merged
    return {
      levers: {
        ...merged.levers,
        ...definedLeverEntries(layer.levers),
      },
      outcomes: {
        ...merged.outcomes,
        ...definedOutcomeEntries(layer.outcomes),
      },
      lean: layer.lean ?? merged.lean,
      auto: layer.auto ?? merged.auto,
    }
  }, defaultStreamBoundaries())
}

export function serializeStreamBoundaries(
  boundaries: StreamBoundaries,
): string[] {
  const out: string[] = []
  if (boundaries.levers.bitrate) {
    out.push(`bitrate=${serializeNumericLever(boundaries.levers.bitrate)}`)
  }
  if (boundaries.levers.fps) {
    out.push(`fps=${serializeNumericLever(boundaries.levers.fps)}`)
  }
  if (boundaries.levers.resolution) {
    out.push(
      `resolution=${serializeResolutionLever(boundaries.levers.resolution)}`,
    )
  }
  if (boundaries.lean !== undefined)
    out.push(`lean=${formatNumber(boundaries.lean)}`)
  if (boundaries.auto !== undefined) out.push(`auto=${boundaries.auto}`)
  if (boundaries.outcomes.maxLatencyMs !== undefined) {
    out.push(`max-latency=${formatNumber(boundaries.outcomes.maxLatencyMs)}ms`)
  }
  if (boundaries.outcomes.minDeliveredFps !== undefined) {
    out.push(`min-fps=${formatNumber(boundaries.outcomes.minDeliveredFps)}`)
  }
  return out
}

function applyBoundaryExpression(
  boundaries: StreamBoundaries,
  key: StreamBoundaryKey,
  value: string,
): StreamBoundaries {
  switch (key) {
    case "bitrate":
      return {
        ...boundaries,
        levers: {
          ...boundaries.levers,
          bitrate: parseNumericLever(value, "bitrate"),
        },
      }
    case "fps":
      return {
        ...boundaries,
        levers: { ...boundaries.levers, fps: parseNumericLever(value, "fps") },
      }
    case "resolution":
      return {
        ...boundaries,
        levers: {
          ...boundaries.levers,
          resolution: parseResolutionLever(value),
        },
      }
    case "lean":
      return { ...boundaries, lean: parseLean(value) }
    case "auto":
      if (value !== "on" && value !== "off")
        throw new Error("auto must be on or off")
      return { ...boundaries, auto: value }
    case "max-latency":
      return {
        ...boundaries,
        outcomes: { ...boundaries.outcomes, maxLatencyMs: parseMs(value) },
      }
    case "min-fps":
      return {
        ...boundaries,
        outcomes: {
          ...boundaries.outcomes,
          minDeliveredFps: parsePositiveNumber(value, "min-fps"),
        },
      }
    default:
      throw new Error(`unknown stream boundary key: ${key}`)
  }
}

function parseNumericLever(
  value: string,
  key: "bitrate" | "fps",
): NumericLeverBoundary {
  if (value === "auto" || value === "..") return { free: true }
  const parts = value.split("..")
  if (parts.length > 3) throw new Error(`invalid range for ${key}: ${value}`)
  if (parts.length === 3) {
    if (key !== "bitrate") {
      throw new Error(
        `${key} startup is not supported; launch fps/resolution define the current envelope`,
      )
    }
    const floor = parts[0] === "" ? undefined : parseLeverNumber(parts[0], key)
    const startup = parts[1] === "" ? undefined : parseLeverNumber(parts[1], key)
    const ceiling =
      parts[2] === "" ? undefined : parseLeverNumber(parts[2], key)
    if (startup === undefined) {
      throw new Error("bitrate startup must be provided in floor..startup..ceiling")
    }
    if (floor !== undefined && floor > startup) {
      throw new Error("bitrate startup must be >= floor")
    }
    if (ceiling !== undefined && startup > ceiling) {
      throw new Error("bitrate startup must be <= ceiling")
    }
    if (floor === undefined && ceiling === undefined) {
      return definedNumericLever({ startup })
    }
    return definedNumericLever({ floor, startup, ceiling })
  }
  if (parts.length === 2) {
    const floor = parts[0] === "" ? undefined : parseLeverNumber(parts[0], key)
    const ceiling =
      parts[1] === "" ? undefined : parseLeverNumber(parts[1], key)
    if (floor !== undefined && ceiling !== undefined && floor > ceiling) {
      throw new Error(`${key} floor must be <= ceiling`)
    }
    if (floor === undefined && ceiling === undefined) return { free: true }
    return definedNumericLever({ floor, ceiling })
  }
  const pinned = parseLeverNumber(value, key)
  return { floor: pinned, ceiling: pinned, pinned }
}

function parseResolutionLever(value: string): ResolutionLeverBoundary {
  if (value === "auto" || value === "..") return { free: true }
  const parts = value.split("..")
  if (parts.length > 2)
    throw new Error(
      "resolution startup is not supported; launch resolution defines the current envelope",
    )
  if (parts.length === 2) {
    const floor = parts[0] === "" ? undefined : parseResolution(parts[0])
    const ceiling = parts[1] === "" ? undefined : parseResolution(parts[1])
    if (
      floor &&
      ceiling &&
      (floor.width > ceiling.width || floor.height > ceiling.height)
    ) {
      throw new Error("resolution floor must be <= ceiling")
    }
    if (!floor && !ceiling) return { free: true }
    return definedResolutionLever({ floor, ceiling })
  }
  const pinned = parseResolution(value)
  return { floor: pinned, ceiling: pinned, pinned }
}

function parseLeverNumber(value: string, key: "bitrate" | "fps"): number {
  if (key === "bitrate") return parseBitrateKbps(value)
  return parsePositiveNumber(value, key)
}

function parseBitrateKbps(value: string): number {
  const normalized = value.trim().toLowerCase()
  if (normalized.endsWith("mbps"))
    return parsePositiveNumber(normalized.slice(0, -4), "bitrate") * 1000
  if (normalized.endsWith("m"))
    return parsePositiveNumber(normalized.slice(0, -1), "bitrate") * 1000
  if (normalized.endsWith("kbps"))
    return parsePositiveNumber(normalized.slice(0, -4), "bitrate")
  if (normalized.endsWith("k"))
    return parsePositiveNumber(normalized.slice(0, -1), "bitrate")
  return parsePositiveNumber(normalized, "bitrate")
}

function parseMs(value: string): number {
  const normalized = value.trim().toLowerCase()
  return parsePositiveNumber(
    normalized.endsWith("ms") ? normalized.slice(0, -2) : normalized,
    "max-latency",
  )
}

function parsePositiveNumber(value: string, key: string): number {
  const parsed = parsePlainNumber(value, key)
  if (parsed <= 0) throw new Error(`${key} must be positive`)
  return parsed
}

function parsePlainNumber(value: string, key: string): number {
  if (value.trim() === "") throw new Error(`invalid ${key} value: ${value}`)
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new Error(`invalid ${key} value: ${value}`)
  return parsed
}

function parseResolution(value: string): StreamAdaptiveResolution {
  const match = /^(\d+)x(\d+)$/i.exec(value.trim())
  if (!match) throw new Error(`invalid resolution value: ${value}`)
  const width = Number(match[1])
  const height = Number(match[2])
  if (width <= 0 || height <= 0)
    throw new Error(`invalid resolution value: ${value}`)
  return { width, height }
}

function parseLean(value: string): number {
  if (value.trim() === "") throw new Error("invalid lean value")
  if (value === "responsive") return 0
  if (value === "balanced") return 0.5
  if (value === "cinematic") return 1
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error("lean must be responsive, balanced, cinematic, or 0..1")
  }
  return parsed
}

function serializeNumericLever(lever: NumericLeverBoundary): string {
  if (lever.free) return "auto"
  if (lever.pinned !== undefined) return formatNumber(lever.pinned)
  if (lever.startup !== undefined) {
    return `${lever.floor === undefined ? "" : formatNumber(lever.floor)}..${formatNumber(lever.startup)}..${
      lever.ceiling === undefined ? "" : formatNumber(lever.ceiling)
    }`
  }
  return `${lever.floor === undefined ? "" : formatNumber(lever.floor)}..${
    lever.ceiling === undefined ? "" : formatNumber(lever.ceiling)
  }`
}

function serializeResolutionLever(lever: ResolutionLeverBoundary): string {
  if (lever.free) return "auto"
  if (lever.pinned !== undefined) return formatResolution(lever.pinned)
  return `${lever.floor === undefined ? "" : formatResolution(lever.floor)}..${
    lever.ceiling === undefined ? "" : formatResolution(lever.ceiling)
  }`
}

function formatResolution(resolution: StreamAdaptiveResolution): string {
  return `${resolution.width}x${resolution.height}`
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value)
}

function definedNumericLever(
  lever: NumericLeverBoundary,
): NumericLeverBoundary {
  return Object.fromEntries(
    Object.entries(lever).filter(([, value]) => value !== undefined),
  ) as NumericLeverBoundary
}

function definedResolutionLever(
  lever: ResolutionLeverBoundary,
): ResolutionLeverBoundary {
  return Object.fromEntries(
    Object.entries(lever).filter(([, value]) => value !== undefined),
  ) as ResolutionLeverBoundary
}

function definedLeverEntries(
  levers: StreamAdaptiveLeverBoundaries,
): StreamAdaptiveLeverBoundaries {
  const entries = Object.entries(levers)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [
      key,
      key === "resolution"
        ? definedResolutionLever(value as ResolutionLeverBoundary)
        : definedNumericLever(value as NumericLeverBoundary),
    ])
  return Object.fromEntries(entries) as StreamAdaptiveLeverBoundaries
}

function definedOutcomeEntries(
  outcomes: StreamAdaptiveOutcomeBoundaries,
): StreamAdaptiveOutcomeBoundaries {
  return Object.fromEntries(
    Object.entries(outcomes).filter(([, value]) => value !== undefined),
  ) as StreamAdaptiveOutcomeBoundaries
}
