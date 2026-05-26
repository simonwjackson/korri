import { Schema } from "effect"

export const MOONLIGHT_CONTROL_PROTOCOL = {
  name: "moonlight.local-control",
  major: 1,
  minor: 0,
} as const

export const MOONLIGHT_CONTROL_PROTOCOL_LIMITS = {
  maxFrameBytes: 64 * 1024,
  maxClients: 4,
  eventHistory: 256,
  maxInFlightMutationsPerFamily: 1,
  minCommandIntervalMs: 250,
  bitrateKbps: { min: 500, max: 150_000 },
  fps: { min: 15, max: 240 },
  resolution: {
    width: { min: 320, max: 7680 },
    height: { min: 240, max: 4320 },
  },
} as const

const AdditiveFields = Schema.Record(Schema.String, Schema.Unknown)
const JsonRpcId = Schema.Union([Schema.String, Schema.Int])
export type MoonlightControlRequestId = Schema.Schema.Type<typeof JsonRpcId>

const Authority = Schema.Literals(["observer", "controller"])
export type MoonlightControlAuthority = Schema.Schema.Type<typeof Authority>

const CommandMethod = Schema.Literals([
  "runtime.requestIdr",
  "runtime.setBitrate",
  "runtime.setFps",
  "runtime.setResolution",
])
export type MoonlightControlCommandMethod = Schema.Schema.Type<
  typeof CommandMethod
>

const RuntimeSettingsStatus = Schema.Literals([
  "accepted",
  "applied",
  "failed",
  "invalid",
  "disabled",
  "unsupported",
  "timed-out",
  "not-streaming",
  "unauthorized",
  "conflict",
])
export type MoonlightControlRuntimeSettingsStatus = Schema.Schema.Type<
  typeof RuntimeSettingsStatus
>

const LifecycleState = Schema.Literals([
  "starting",
  "connecting",
  "connected",
  "control-ready",
  "streaming",
  "disconnecting",
  "exited",
  "failed",
])
export type MoonlightControlLifecycleState = Schema.Schema.Type<
  typeof LifecycleState
>

const ConnectionQuality = Schema.Literals(["unknown", "poor", "okay", "good"])
export type MoonlightControlConnectionQuality = Schema.Schema.Type<
  typeof ConnectionQuality
>

const InputRouteStatus = Schema.Literals([
  "unknown",
  "available",
  "unavailable",
  "disabled",
])
export type MoonlightControlInputRouteStatus = Schema.Schema.Type<
  typeof InputRouteStatus
>

const CapabilitySet = Schema.StructWithRest(
  Schema.Struct({
    events: Schema.Array(Schema.String),
    commands: Schema.Array(CommandMethod),
    experimental: Schema.Array(Schema.String),
  }),
  [AdditiveFields],
)

const ProtocolMetadata = Schema.StructWithRest(
  Schema.Struct({
    name: Schema.Literal(MOONLIGHT_CONTROL_PROTOCOL.name),
    major: Schema.Literal(MOONLIGHT_CONTROL_PROTOCOL.major),
    minor: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 99 })),
  }),
  [AdditiveFields],
)

const ProtocolLimits = Schema.StructWithRest(
  Schema.Struct({
    maxFrameBytes: boundedInt("maxFrameBytes", 1, 1024 * 1024),
    maxClients: boundedInt("maxClients", 1, 64),
    eventHistory: boundedInt("eventHistory", 0, 100_000),
    maxInFlightMutationsPerFamily: boundedInt(
      "maxInFlightMutationsPerFamily",
      1,
      32,
    ),
    minCommandIntervalMs: boundedInt("minCommandIntervalMs", 0, 60_000),
    bitrateKbps: Schema.Struct({
      min: boundedInt("bitrateKbps.min", 1, 1_000_000),
      max: boundedInt("bitrateKbps.max", 1, 1_000_000),
    }),
    fps: Schema.Struct({
      min: boundedInt("fps.min", 1, 1000),
      max: boundedInt("fps.max", 1, 1000),
    }),
    resolution: Schema.Struct({
      width: Schema.Struct({
        min: boundedInt("resolution.width.min", 1, 100_000),
        max: boundedInt("resolution.width.max", 1, 100_000),
      }),
      height: Schema.Struct({
        min: boundedInt("resolution.height.min", 1, 100_000),
        max: boundedInt("resolution.height.max", 1, 100_000),
      }),
    }),
  }),
  [AdditiveFields],
)

const SessionIdentity = Schema.StructWithRest(
  Schema.Struct({
    sessionId: Schema.String,
    processId: Schema.optional(Schema.Int),
  }),
  [AdditiveFields],
)

const HelloResult = Schema.StructWithRest(
  Schema.Struct({
    _tag: Schema.Literal("protocol.hello"),
    protocol: ProtocolMetadata,
    session: SessionIdentity,
    authority: Authority,
    capabilities: CapabilitySet,
    limits: ProtocolLimits,
  }),
  [AdditiveFields],
)

const RuntimeSettingsSnapshot = Schema.StructWithRest(
  Schema.Struct({
    appliedBitrateKbps: Schema.optional(bitrateKbpsSchema()),
    appliedFps: Schema.optional(fpsSchema()),
    appliedResolution: Schema.optional(
      Schema.Struct({
        width: resolutionWidthSchema(),
        height: resolutionHeightSchema(),
      }),
    ),
    lastCommand: Schema.optional(
      Schema.StructWithRest(
        Schema.Struct({
          requestId: JsonRpcId,
          command: CommandMethod,
          status: RuntimeSettingsStatus,
        }),
        [AdditiveFields],
      ),
    ),
  }),
  [AdditiveFields],
)

const StreamQualitySnapshot = Schema.StructWithRest(
  Schema.Struct({
    connection: ConnectionQuality,
    bitrateKbps: Schema.optional(bitrateKbpsSchema()),
    fps: Schema.optional(fpsSchema()),
    width: Schema.optional(resolutionWidthSchema()),
    height: Schema.optional(resolutionHeightSchema()),
  }),
  [AdditiveFields],
)

const InputRouteSnapshot = Schema.StructWithRest(
  Schema.Struct({
    route: Schema.String,
    status: InputRouteStatus,
    capabilities: Schema.Array(Schema.String),
  }),
  [AdditiveFields],
)

const StateSnapshotResult = Schema.StructWithRest(
  Schema.Struct({
    _tag: Schema.Literal("state.snapshot"),
    seq: sequenceSchema(),
    session: Schema.StructWithRest(
      Schema.Struct({
        sessionId: Schema.String,
        state: LifecycleState,
        appName: Schema.optional(Schema.String),
      }),
      [AdditiveFields],
    ),
    streamQuality: StreamQualitySnapshot,
    runtimeSettings: RuntimeSettingsSnapshot,
    input: InputRouteSnapshot,
  }),
  [AdditiveFields],
)

const EventsSubscribedResult = Schema.StructWithRest(
  Schema.Struct({
    _tag: Schema.Literal("events.subscribed"),
    seq: sequenceSchema(),
  }),
  [AdditiveFields],
)

const CommandAcceptedResult = Schema.StructWithRest(
  Schema.Struct({
    _tag: Schema.Literal("command.accepted"),
    requestId: JsonRpcId,
    command: CommandMethod,
  }),
  [AdditiveFields],
)

const CommandResult = Schema.StructWithRest(
  Schema.Struct({
    _tag: Schema.Literal("command.result"),
    requestId: JsonRpcId,
    command: CommandMethod,
    status: RuntimeSettingsStatus,
  }),
  [AdditiveFields],
)

const ResponseResult = Schema.Union([
  HelloResult,
  StateSnapshotResult,
  EventsSubscribedResult,
  CommandAcceptedResult,
  CommandResult,
])

type AdditiveObject = Readonly<Record<string, unknown>>

export interface MoonlightControlHelloResult extends AdditiveObject {
  readonly _tag: "protocol.hello"
  readonly protocol: AdditiveObject & {
    readonly name: typeof MOONLIGHT_CONTROL_PROTOCOL.name
    readonly major: typeof MOONLIGHT_CONTROL_PROTOCOL.major
    readonly minor: number
  }
  readonly session: AdditiveObject & {
    readonly sessionId: string
    readonly processId?: number
  }
  readonly authority: MoonlightControlAuthority
  readonly capabilities: AdditiveObject & {
    readonly events: readonly string[]
    readonly commands: readonly MoonlightControlCommandMethod[]
    readonly experimental: readonly string[]
  }
  readonly limits: typeof MOONLIGHT_CONTROL_PROTOCOL_LIMITS
}

export interface MoonlightControlStateSnapshotResult extends AdditiveObject {
  readonly _tag: "state.snapshot"
  readonly seq: number
  readonly session: AdditiveObject & {
    readonly sessionId: string
    readonly state: MoonlightControlLifecycleState
    readonly appName?: string
  }
  readonly streamQuality: AdditiveObject & {
    readonly connection: MoonlightControlConnectionQuality
    readonly bitrateKbps?: number
    readonly fps?: number
    readonly width?: number
    readonly height?: number
  }
  readonly runtimeSettings: AdditiveObject & {
    readonly appliedBitrateKbps?: number
    readonly appliedFps?: number
    readonly appliedResolution?: {
      readonly width: number
      readonly height: number
    }
    readonly lastCommand?: AdditiveObject & {
      readonly requestId: MoonlightControlRequestId
      readonly command: MoonlightControlCommandMethod
      readonly status: MoonlightControlRuntimeSettingsStatus
    }
  }
  readonly input: AdditiveObject & {
    readonly route: string
    readonly status: MoonlightControlInputRouteStatus
    readonly capabilities: readonly string[]
  }
}

export interface MoonlightControlEventsSubscribedResult extends AdditiveObject {
  readonly _tag: "events.subscribed"
  readonly seq: number
}

export interface MoonlightControlCommandAcceptedResult extends AdditiveObject {
  readonly _tag: "command.accepted"
  readonly requestId: MoonlightControlRequestId
  readonly command: MoonlightControlCommandMethod
}

export interface MoonlightControlCommandResult extends AdditiveObject {
  readonly _tag: "command.result"
  readonly requestId: MoonlightControlRequestId
  readonly command: MoonlightControlCommandMethod
  readonly status: MoonlightControlRuntimeSettingsStatus
}

export type MoonlightControlResponseResult =
  | MoonlightControlHelloResult
  | MoonlightControlStateSnapshotResult
  | MoonlightControlEventsSubscribedResult
  | MoonlightControlCommandAcceptedResult
  | MoonlightControlCommandResult

const ProtocolError = Schema.StructWithRest(
  Schema.Struct({
    code: Schema.Int,
    message: Schema.String,
    data: Schema.optional(
      Schema.StructWithRest(
        Schema.Struct({
          _tag: Schema.String,
        }),
        [AdditiveFields],
      ),
    ),
  }),
  [AdditiveFields],
)
export interface MoonlightControlProtocolError extends AdditiveObject {
  readonly code: number
  readonly message: string
  readonly data?: AdditiveObject & { readonly _tag: string }
}

const SuccessResponse = Schema.StructWithRest(
  Schema.Struct({
    jsonrpc: Schema.Literal("2.0"),
    id: JsonRpcId,
    result: ResponseResult,
  }),
  [AdditiveFields],
)

const ErrorResponse = Schema.StructWithRest(
  Schema.Struct({
    jsonrpc: Schema.Literal("2.0"),
    id: JsonRpcId,
    error: ProtocolError,
  }),
  [AdditiveFields],
)

export const MoonlightControlResponse = Schema.Union([
  SuccessResponse,
  ErrorResponse,
])

export interface MoonlightControlSuccessResponse {
  readonly jsonrpc: "2.0"
  readonly id: MoonlightControlRequestId
  readonly result: MoonlightControlResponseResult
}

export interface MoonlightControlErrorResponse {
  readonly jsonrpc: "2.0"
  readonly id: MoonlightControlRequestId
  readonly error: MoonlightControlProtocolError
}

export type MoonlightControlResponse =
  | MoonlightControlSuccessResponse
  | MoonlightControlErrorResponse

const RuntimeSetBitrateRequest = Schema.StructWithRest(
  Schema.Struct({
    jsonrpc: Schema.Literal("2.0"),
    id: JsonRpcId,
    method: Schema.Literal("runtime.setBitrate"),
    params: Schema.Struct({ bitrateKbps: bitrateKbpsSchema() }),
  }),
  [AdditiveFields],
)

const RuntimeSetFpsRequest = Schema.StructWithRest(
  Schema.Struct({
    jsonrpc: Schema.Literal("2.0"),
    id: JsonRpcId,
    method: Schema.Literal("runtime.setFps"),
    params: Schema.Struct({ fps: fpsSchema() }),
  }),
  [AdditiveFields],
)

const RuntimeSetResolutionRequest = Schema.StructWithRest(
  Schema.Struct({
    jsonrpc: Schema.Literal("2.0"),
    id: JsonRpcId,
    method: Schema.Literal("runtime.setResolution"),
    params: Schema.Struct({
      width: resolutionWidthSchema(),
      height: resolutionHeightSchema(),
    }),
  }),
  [AdditiveFields],
)

const RuntimeRequestIdrRequest = Schema.StructWithRest(
  Schema.Struct({
    jsonrpc: Schema.Literal("2.0"),
    id: JsonRpcId,
    method: Schema.Literal("runtime.requestIdr"),
    params: Schema.optional(Schema.Struct({})),
  }),
  [AdditiveFields],
)

export const MoonlightControlCommandRequest = Schema.Union([
  RuntimeSetBitrateRequest,
  RuntimeSetFpsRequest,
  RuntimeSetResolutionRequest,
  RuntimeRequestIdrRequest,
])
export type MoonlightControlCommandRequest =
  | (AdditiveObject & {
      readonly jsonrpc: "2.0"
      readonly id: MoonlightControlRequestId
      readonly method: "runtime.setBitrate"
      readonly params: { readonly bitrateKbps: number }
    })
  | (AdditiveObject & {
      readonly jsonrpc: "2.0"
      readonly id: MoonlightControlRequestId
      readonly method: "runtime.setFps"
      readonly params: { readonly fps: number }
    })
  | (AdditiveObject & {
      readonly jsonrpc: "2.0"
      readonly id: MoonlightControlRequestId
      readonly method: "runtime.setResolution"
      readonly params: { readonly width: number; readonly height: number }
    })
  | (AdditiveObject & {
      readonly jsonrpc: "2.0"
      readonly id: MoonlightControlRequestId
      readonly method: "runtime.requestIdr"
      readonly params?: Record<string, never>
    })

const KnownEvent = Schema.Union([
  Schema.StructWithRest(
    Schema.Struct({
      name: Schema.Literals([
        "lifecycle.starting",
        "lifecycle.connecting",
        "lifecycle.connected",
        "lifecycle.controlReady",
        "lifecycle.streaming",
        "lifecycle.disconnecting",
        "lifecycle.exited",
        "lifecycle.failed",
      ]),
      state: LifecycleState,
    }),
    [AdditiveFields],
  ),
  Schema.StructWithRest(
    Schema.Struct({
      name: Schema.Literal("quality.connection"),
      connection: ConnectionQuality,
    }),
    [AdditiveFields],
  ),
  Schema.StructWithRest(
    Schema.Struct({
      name: Schema.Literal("runtime.commandResult"),
      requestId: JsonRpcId,
      command: CommandMethod,
      status: RuntimeSettingsStatus,
    }),
    [AdditiveFields],
  ),
  Schema.StructWithRest(
    Schema.Struct({
      name: Schema.Literal("input.route"),
      route: Schema.String,
      status: InputRouteStatus,
      capabilities: Schema.Array(Schema.String),
    }),
    [AdditiveFields],
  ),
])
export type MoonlightControlKnownEvent =
  | (AdditiveObject & {
      readonly name:
        | "lifecycle.starting"
        | "lifecycle.connecting"
        | "lifecycle.connected"
        | "lifecycle.controlReady"
        | "lifecycle.streaming"
        | "lifecycle.disconnecting"
        | "lifecycle.exited"
        | "lifecycle.failed"
      readonly state: MoonlightControlLifecycleState
    })
  | (AdditiveObject & {
      readonly name: "quality.connection"
      readonly connection: MoonlightControlConnectionQuality
    })
  | (AdditiveObject & {
      readonly name: "runtime.commandResult"
      readonly requestId: MoonlightControlRequestId
      readonly command: MoonlightControlCommandMethod
      readonly status: MoonlightControlRuntimeSettingsStatus
    })
  | (AdditiveObject & {
      readonly name: "input.route"
      readonly route: string
      readonly status: MoonlightControlInputRouteStatus
      readonly capabilities: readonly string[]
    })

export interface MoonlightControlUnknownEvent {
  readonly _tag: "unknown.event"
  readonly name: string
  readonly payload: Readonly<Record<string, unknown>>
}

export type MoonlightControlEvent =
  | MoonlightControlKnownEvent
  | MoonlightControlUnknownEvent

const EventEnvelopeBase = Schema.StructWithRest(
  Schema.Struct({
    jsonrpc: Schema.Literal("2.0"),
    method: Schema.Literal("moonlight.event"),
    params: Schema.StructWithRest(
      Schema.Struct({
        seq: sequenceSchema(),
        monotonicMs: boundedInt("monotonicMs", 0, Number.MAX_SAFE_INTEGER),
        event: Schema.StructWithRest(Schema.Struct({ name: Schema.String }), [
          AdditiveFields,
        ]),
      }),
      [AdditiveFields],
    ),
  }),
  [AdditiveFields],
)

export interface MoonlightControlEventEnvelope extends AdditiveObject {
  readonly jsonrpc: "2.0"
  readonly method: "moonlight.event"
  readonly params: AdditiveObject & {
    readonly seq: number
    readonly monotonicMs: number
    readonly event: MoonlightControlEvent
  }
}

export type MoonlightControlMessage =
  | MoonlightControlResponse
  | MoonlightControlCommandRequest
  | MoonlightControlEventEnvelope

export function decodeMoonlightControlResponse(
  value: unknown,
): MoonlightControlResponse {
  return Schema.decodeUnknownSync(MoonlightControlResponse)(
    value,
  ) as MoonlightControlResponse
}

export function decodeMoonlightControlCommandRequest(
  value: unknown,
): MoonlightControlCommandRequest {
  return Schema.decodeUnknownSync(MoonlightControlCommandRequest)(
    value,
  ) as MoonlightControlCommandRequest
}

export function decodeMoonlightControlEventEnvelope(
  value: unknown,
): MoonlightControlEventEnvelope {
  const decoded = Schema.decodeUnknownSync(EventEnvelopeBase)(value)
  return {
    ...decoded,
    params: {
      ...decoded.params,
      event: decodeMoonlightControlEvent(decoded.params.event),
    },
  }
}

export function decodeMoonlightControlMessage(
  value: unknown,
): MoonlightControlMessage {
  if (isRecord(value) && value.method === "moonlight.event") {
    return decodeMoonlightControlEventEnvelope(value)
  }
  if (
    (isRecord(value) && "result" in value) ||
    (isRecord(value) && "error" in value)
  ) {
    return decodeMoonlightControlResponse(value)
  }
  return decodeMoonlightControlCommandRequest(value)
}

export function decodeMoonlightControlEvent(
  value: unknown,
): MoonlightControlEvent {
  const event = Schema.decodeUnknownSync(
    Schema.StructWithRest(Schema.Struct({ name: Schema.String }), [
      AdditiveFields,
    ]),
  )(value)

  try {
    return Schema.decodeUnknownSync(KnownEvent)(
      event,
    ) as MoonlightControlKnownEvent
  } catch {
    const { name, ...payload } = event
    return { _tag: "unknown.event", name, payload }
  }
}

function bitrateKbpsSchema() {
  return boundedInt(
    "bitrateKbps",
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.bitrateKbps.min,
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.bitrateKbps.max,
  )
}

function fpsSchema() {
  return boundedInt(
    "fps",
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.fps.min,
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.fps.max,
  )
}

function resolutionWidthSchema() {
  return boundedInt(
    "width",
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.resolution.width.min,
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.resolution.width.max,
  )
}

function resolutionHeightSchema() {
  return boundedInt(
    "height",
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.resolution.height.min,
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.resolution.height.max,
  )
}

function sequenceSchema() {
  return boundedInt("seq", 0, Number.MAX_SAFE_INTEGER)
}

function boundedInt(name: string, minimum: number, maximum: number) {
  return Schema.Int.check(
    Schema.isBetween({ minimum, maximum }).annotate({ identifier: name }),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
