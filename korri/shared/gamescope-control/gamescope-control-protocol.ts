export const GAMESCOPE_CONTROL_PROTOCOL = {
  name: "gamescope.korri-control",
  major: 1,
  minor: 1,
} as const

export const GAMESCOPE_CONTROL_PROTOCOL_LIMITS = {
  maxFrameBytes: 64 * 1024,
  mode: {
    width: { min: 1, max: Number.MAX_SAFE_INTEGER },
    height: { min: 1, max: Number.MAX_SAFE_INTEGER },
  },
  sharpness: { min: 0, max: 20 },
} as const

export const GAMESCOPE_CONTROL_COMMANDS = [
  "mode.set",
  "filter.set",
  "sharpness.set",
  "scaler.set",
  "fps.set",
  "refresh-cycle.set",
  "display.sleep",
  "display.wake",
  "screenshot.capture",
  "hdr.set",
  "vrr.set",
  "tearing.set",
  "low-latency.set",
  "repaint.request",
  "debug.set",
] as const

export const GAMESCOPE_CONTROL_PROTOCOL_METHODS = [
  "protocol.hello",
  "state.get",
  "events.subscribe",
  "events.unsubscribe",
  ...GAMESCOPE_CONTROL_COMMANDS,
] as const

export const GAMESCOPE_CONTROL_EVENTS = [
  "subscription.ready",
  "state.changed",
  "command.result",
  "backend.status",
  "error",
] as const

export type GamescopeControlCommandMethod =
  (typeof GAMESCOPE_CONTROL_COMMANDS)[number]
export type GamescopeControlMethod =
  (typeof GAMESCOPE_CONTROL_PROTOCOL_METHODS)[number]
export type GamescopeControlEventType =
  (typeof GAMESCOPE_CONTROL_EVENTS)[number]
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

export interface GamescopeBackendStatus {
  readonly kind?: "x11" | "native" | "composite" | "unknown"
  readonly available: boolean
  readonly reason?: string
}

export interface GamescopeControlState {
  readonly _tag?: "state.snapshot"
  readonly backend?: GamescopeBackendStatus
  readonly xwaylandMode?: GamescopeMode
  readonly filter?: GamescopeScalingFilter
  readonly sharpness?: number
  readonly fsrFeedback?: boolean
  readonly scaler?: string
  readonly fps?: number
  readonly refreshCycle?: number
  readonly hdr?: boolean
  readonly vrr?: boolean
  readonly tearing?: boolean
  readonly lowLatency?: boolean
  readonly displayPower?: "awake" | "sleeping" | "unknown"
}

export type GamescopeControlCommandStatus =
  | "applied"
  /** @deprecated v1.1 reports readback divergence as readback-mismatch/readback-failed. */
  | "accepted"
  | "unsupported"
  | "failed"
  | "invalid"
  | "timed-out"
  | "readback-mismatch"
  | "readback-failed"
  | "aborted"

export interface GamescopeControlCommandResult {
  readonly _tag: "command.result"
  readonly requestId?: GamescopeControlRequestId
  readonly command: GamescopeControlCommandMethod
  readonly status: GamescopeControlCommandStatus
  readonly requested: unknown
  readonly applied: GamescopeControlState
  readonly reason?: string
}

export interface GamescopeControlEventsSubscribedResult {
  readonly _tag: "events.subscribed"
  readonly seq: number
}

export interface GamescopeControlEventsUnsubscribedResult {
  readonly _tag: "events.unsubscribed"
  readonly seq: number
}

export interface GamescopeControlHelloResult {
  readonly _tag: "protocol.hello"
  readonly protocol: typeof GAMESCOPE_CONTROL_PROTOCOL
  readonly capabilities: {
    readonly methods: readonly GamescopeControlMethod[]
    readonly commands: readonly GamescopeControlCommandMethod[]
    readonly events: readonly GamescopeControlEventType[]
    readonly unsupported?: readonly GamescopeControlCommandMethod[]
    readonly backend?: GamescopeBackendStatus
  }
  readonly limits: typeof GAMESCOPE_CONTROL_PROTOCOL_LIMITS
}

export type GamescopeControlResponseResult =
  | GamescopeControlHelloResult
  | GamescopeControlEventsSubscribedResult
  | GamescopeControlEventsUnsubscribedResult
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

export interface GamescopeControlEvent {
  readonly type: GamescopeControlEventType
  readonly requestId?: GamescopeControlRequestId
  readonly result?: GamescopeControlCommandResult
  readonly state?: GamescopeControlState
  readonly backend?: GamescopeBackendStatus
  readonly reason?: string
}

export interface GamescopeControlEventEnvelope {
  readonly jsonrpc: "2.0"
  readonly method: "gamescope.event"
  readonly params: {
    readonly seq: number
    readonly event: GamescopeControlEvent
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

export function decodeGamescopeControlEventEnvelope(
  value: unknown,
): GamescopeControlEventEnvelope {
  if (!isRecord(value))
    throw new Error("gamescope-control event must be an object")
  if (value.jsonrpc !== "2.0") throw new Error("jsonrpc must be 2.0")
  if (value.method !== "gamescope.event")
    throw new Error("gamescope-control event method must be gamescope.event")
  if (!isRecord(value.params)) throw new Error("event params must be an object")
  if (!Number.isInteger(value.params.seq) || (value.params.seq as number) < 1) {
    throw new Error("event seq must be a positive integer")
  }
  if (!isRecord(value.params.event))
    throw new Error("event payload must be an object")
  if (typeof value.params.event.type !== "string")
    throw new Error("event type must be a string")
  if (!isGamescopeControlEventType(value.params.event.type)) {
    throw new Error(
      `Unsupported gamescope-control event: ${value.params.event.type}`,
    )
  }
  return value as unknown as GamescopeControlEventEnvelope
}

export function createGamescopeHelloResult(): GamescopeControlHelloResult {
  return {
    _tag: "protocol.hello",
    protocol: GAMESCOPE_CONTROL_PROTOCOL,
    capabilities: {
      methods: GAMESCOPE_CONTROL_PROTOCOL_METHODS,
      commands: GAMESCOPE_CONTROL_COMMANDS,
      events: GAMESCOPE_CONTROL_EVENTS,
      unsupported: unsupportedDefaultCommands(),
    },
    limits: GAMESCOPE_CONTROL_PROTOCOL_LIMITS,
  }
}

export function createUnsupportedGamescopeCommandResult(
  command: GamescopeControlCommandMethod,
  requested: unknown = null,
): GamescopeControlCommandResult {
  return {
    _tag: "command.result",
    command,
    status: "unsupported",
    requested,
    applied: {},
    reason: `${command} is not supported by the selected Gamescope backend`,
  }
}

export function isGamescopeControlCommandMethod(
  method: string,
): method is GamescopeControlCommandMethod {
  return (GAMESCOPE_CONTROL_COMMANDS as readonly string[]).includes(method)
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

function unsupportedDefaultCommands(): readonly GamescopeControlCommandMethod[] {
  return GAMESCOPE_CONTROL_COMMANDS.filter(
    command =>
      command !== "mode.set" &&
      command !== "filter.set" &&
      command !== "sharpness.set",
  )
}

function isGamescopeControlMethod(
  method: string,
): method is GamescopeControlMethod {
  return (GAMESCOPE_CONTROL_PROTOCOL_METHODS as readonly string[]).includes(
    method,
  )
}

function isGamescopeControlEventType(
  type: string,
): type is GamescopeControlEventType {
  return (GAMESCOPE_CONTROL_EVENTS as readonly string[]).includes(type)
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
