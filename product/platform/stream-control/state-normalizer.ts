export interface ResolutionReadback {
  readonly width: number
  readonly height: number
}

export interface MoonlightStateReadback {
  readonly bitrateKbps: number | null
  readonly fps: number | null
  readonly resolution: ResolutionReadback | null
}

export function normalizeMoonlightState(
  snapshot: unknown,
): MoonlightStateReadback {
  const result = rpcResult(snapshot)
  const runtimeSettings = recordField(result, "runtimeSettings")
  const streamQuality = recordField(result, "streamQuality")
  return {
    bitrateKbps: moonlightNumber(
      runtimeSettings,
      streamQuality,
      "appliedBitrateKbps",
      "bitrateKbps",
    ),
    fps: moonlightNumber(runtimeSettings, streamQuality, "appliedFps", "fps"),
    resolution: moonlightResolutionReadback(runtimeSettings, streamQuality),
  }
}

function moonlightNumber(
  runtimeSettings: Record<string, unknown> | undefined,
  streamQuality: Record<string, unknown> | undefined,
  runtimeKey: string,
  streamKey: string,
): number | null {
  return (
    firstNumber(runtimeSettings?.[runtimeKey], streamQuality?.[streamKey]) ??
    null
  )
}

function moonlightResolutionReadback(
  runtimeSettings: Record<string, unknown> | undefined,
  streamQuality: Record<string, unknown> | undefined,
) {
  const runtimeResolution = recordField(runtimeSettings, "appliedResolution")
  return resolutionReadback(
    firstNumber(runtimeResolution?.width, streamQuality?.width),
    firstNumber(runtimeResolution?.height, streamQuality?.height),
  )
}

function resolutionReadback(
  width: number | undefined,
  height: number | undefined,
): ResolutionReadback | null {
  return width === undefined || height === undefined ? null : { width, height }
}

export function rpcResult(
  response: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(response)) return undefined
  const result = response.result
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
