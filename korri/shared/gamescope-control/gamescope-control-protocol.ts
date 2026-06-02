export const GAMESCOPE_CONTROL_PROTOCOL = {
  name: "gamescope.korri-control",
  major: 1,
  minor: 0,
} as const

export const GAMESCOPE_CONTROL_PROTOCOL_LIMITS = {
  maxFrameBytes: 64 * 1024,
  mode: {
    width: { min: 16, max: 7680 },
    height: { min: 16, max: 4320 },
  },
  sharpness: { min: 0, max: 20 },
} as const

export const GAMESCOPE_CONTROL_COMMANDS = [
  "protocol.hello",
  "state.get",
  "mode.set",
  "filter.set",
  "sharpness.set",
] as const

export type GamescopeControlMethod = (typeof GAMESCOPE_CONTROL_COMMANDS)[number]
export type GamescopeControlRequestId = string | number
export type GamescopeScalingFilter =
  | "linear"
  | "nearest"
  | "integer"
  | "fsr"
  | "nis"

export interface GamescopeMode {
  readonly width: number
  readonly height: number
}

export interface GamescopeModeRequest extends GamescopeMode {
  readonly allowSuperRes?: boolean
}

export interface ValidatedGamescopeModeRequest extends GamescopeMode {
  readonly allowSuperRes: boolean
}

export interface GamescopeControlState {
  readonly _tag?: "state.snapshot"
  readonly xwaylandMode?: GamescopeMode
  readonly filter?: GamescopeScalingFilter
  readonly sharpness?: number
  readonly fsrFeedback?: boolean
}

export interface GamescopeControlCommandResult {
  readonly _tag: "command.result"
  readonly command: Exclude<
    GamescopeControlMethod,
    "protocol.hello" | "state.get"
  >
  readonly status: "applied" | "accepted" | "failed" | "invalid" | "timed-out"
  readonly requested: unknown
  readonly applied: GamescopeControlState
  readonly reason?: string
}

export interface GamescopeControlHelloResult {
  readonly _tag: "protocol.hello"
  readonly protocol: typeof GAMESCOPE_CONTROL_PROTOCOL
  readonly capabilities: {
    readonly commands: readonly GamescopeControlMethod[]
  }
  readonly limits: typeof GAMESCOPE_CONTROL_PROTOCOL_LIMITS
}

export type GamescopeControlResponseResult =
  | GamescopeControlHelloResult
  | (GamescopeControlState & { readonly _tag: "state.snapshot" })
  | GamescopeControlCommandResult

export interface GamescopeControlSuccessResponse<
  Result extends
    GamescopeControlResponseResult = GamescopeControlResponseResult,
> {
  readonly jsonrpc: "2.0"
  readonly id: GamescopeControlRequestId
  readonly result: Result
}

export interface GamescopeControlErrorResponse {
  readonly jsonrpc: "2.0"
  readonly id?: GamescopeControlRequestId
  readonly error: {
    readonly code: number
    readonly message: string
    readonly data?: unknown
  }
}

export type GamescopeControlResponse =
  | GamescopeControlSuccessResponse
  | GamescopeControlErrorResponse

export interface GamescopeControlRequest {
  readonly jsonrpc: "2.0"
  readonly id: GamescopeControlRequestId
  readonly method: GamescopeControlMethod
  readonly params?: unknown
}

export interface GamescopeControlBackend {
  readonly getState: () => Promise<GamescopeControlState>
  readonly setMode: (
    request: GamescopeModeRequest,
  ) => Promise<GamescopeControlCommandResult>
  readonly setFilter: (
    filter: GamescopeScalingFilter,
  ) => Promise<GamescopeControlCommandResult>
  readonly setSharpness: (
    sharpness: number,
  ) => Promise<GamescopeControlCommandResult>
}

const filterValues: Record<GamescopeScalingFilter, number> = {
  linear: 0,
  nearest: 1,
  integer: 2,
  fsr: 3,
  nis: 4,
}

const filtersByValue = new Map<number, GamescopeScalingFilter>(
  Object.entries(filterValues).map(([filter, value]) => [
    value,
    filter as GamescopeScalingFilter,
  ]),
)

export function filterToGamescopeValue(filter: GamescopeScalingFilter): number {
  return filterValues[filter]
}

export function valueToGamescopeFilter(
  value: number | undefined,
): GamescopeScalingFilter | undefined {
  return typeof value === "number" ? filtersByValue.get(value) : undefined
}

export function validateGamescopeMode(
  value: unknown,
): ValidatedGamescopeModeRequest {
  if (!isRecord(value)) throw new Error("mode params must be an object")
  const width = validateInteger(
    value.width,
    "width",
    GAMESCOPE_CONTROL_PROTOCOL_LIMITS.mode.width.min,
    GAMESCOPE_CONTROL_PROTOCOL_LIMITS.mode.width.max,
  )
  const height = validateInteger(
    value.height,
    "height",
    GAMESCOPE_CONTROL_PROTOCOL_LIMITS.mode.height.min,
    GAMESCOPE_CONTROL_PROTOCOL_LIMITS.mode.height.max,
  )
  const allowSuperRes =
    typeof value.allowSuperRes === "boolean" ? value.allowSuperRes : false
  return { width, height, allowSuperRes }
}

export function validateGamescopeFilter(
  value: unknown,
): GamescopeScalingFilter {
  if (!isRecord(value) || typeof value.filter !== "string") {
    throw new Error("filter params must include a filter string")
  }
  if (!Object.hasOwn(filterValues, value.filter)) {
    throw new Error(`unsupported Gamescope scaling filter: ${value.filter}`)
  }
  return value.filter as GamescopeScalingFilter
}

export function validateGamescopeSharpness(value: unknown): number {
  if (!isRecord(value)) throw new Error("sharpness params must be an object")
  return validateInteger(
    value.sharpness,
    "sharpness",
    GAMESCOPE_CONTROL_PROTOCOL_LIMITS.sharpness.min,
    GAMESCOPE_CONTROL_PROTOCOL_LIMITS.sharpness.max,
  )
}

export function decodeGamescopeControlRequest(
  value: unknown,
): GamescopeControlRequest {
  if (!isRecord(value))
    throw new Error("gamescope-control frame must be an object")
  if (value.jsonrpc !== "2.0") throw new Error("jsonrpc must be 2.0")
  if (typeof value.id !== "string" && typeof value.id !== "number") {
    throw new Error("JSON-RPC id must be a string or number")
  }
  if (typeof value.method !== "string")
    throw new Error("method must be a string")
  if (!isGamescopeControlMethod(value.method)) {
    throw new Error(`Unsupported gamescope-control method: ${value.method}`)
  }

  let params = value.params
  if (value.method === "mode.set") params = validateGamescopeMode(params)
  if (value.method === "filter.set")
    params = { filter: validateGamescopeFilter(params) }
  if (value.method === "sharpness.set") {
    params = { sharpness: validateGamescopeSharpness(params) }
  }

  return {
    jsonrpc: "2.0",
    id: value.id,
    method: value.method,
    params,
  }
}

export function decodeGamescopeControlResponse(
  value: unknown,
): GamescopeControlResponse {
  if (!isRecord(value))
    throw new Error("gamescope-control response must be an object")
  if (value.jsonrpc !== "2.0") throw new Error("jsonrpc must be 2.0")
  if ("result" in value) {
    if (typeof value.id !== "string" && typeof value.id !== "number") {
      throw new Error("JSON-RPC response id must be a string or number")
    }
    return value as unknown as GamescopeControlSuccessResponse
  }
  if ("error" in value) return value as unknown as GamescopeControlErrorResponse
  throw new Error("gamescope-control response must include result or error")
}

export function createGamescopeHelloResult(): GamescopeControlHelloResult {
  return {
    _tag: "protocol.hello",
    protocol: GAMESCOPE_CONTROL_PROTOCOL,
    capabilities: { commands: GAMESCOPE_CONTROL_COMMANDS },
    limits: GAMESCOPE_CONTROL_PROTOCOL_LIMITS,
  }
}

export function parseGamescopeCardinalProperty(
  output: string,
  propertyName: string,
): number | undefined {
  const pattern = new RegExp(
    `${escapeRegExp(propertyName)}\\(CARDINAL\\)\\s*=\\s*([0-9]+)`,
  )
  const match = output.match(pattern)
  return match ? Number(match[1]) : undefined
}

export function parseXrandrCurrentMode(
  output: string,
): GamescopeMode | undefined {
  const match = output.match(/current\s+(\d+)\s+x\s+(\d+)/)
  if (!match) return undefined
  return { width: Number(match[1]), height: Number(match[2]) }
}

function isGamescopeControlMethod(
  method: string,
): method is GamescopeControlMethod {
  return (GAMESCOPE_CONTROL_COMMANDS as readonly string[]).includes(method)
}

function validateInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`)
  const intValue = value as number
  if (intValue < min || intValue > max) {
    throw new Error(`${label} must be between ${min} and ${max}`)
  }
  return intValue
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
