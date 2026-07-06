import { Schema } from "effect"

export const MOONLIGHT_CONTROL_PROTOCOL = {
  name: "moonlight.local-control",
  major: 1,
  minor: 1,
} as const

export const MOONLIGHT_CONTROL_PROTOCOL_LIMITS = {
  maxFrameBytes: 64 * 1024,
  maxClients: 4,
  eventHistory: 256,
  maxInFlightMutationsPerFamily: 1,
  minCommandIntervalMs: 250,
  bitrateKbps: { min: 1, max: Number.MAX_SAFE_INTEGER },
  fps: { min: 1, max: Number.MAX_SAFE_INTEGER },
  resolution: {
    width: { min: 1, max: Number.MAX_SAFE_INTEGER },
    height: { min: 1, max: Number.MAX_SAFE_INTEGER },
  },
  touchBounds: {
    x: { min: 0, max: 65_535 },
    y: { min: 0, max: 65_535 },
    w: { min: 1, max: 65_536 },
    h: { min: 1, max: 65_536 },
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

const InputCommandMethod = Schema.Literal("input.setTouchBounds")
export type MoonlightControlInputCommandMethod = Schema.Schema.Type<
  typeof InputCommandMethod
>

const AnyCommandMethod = Schema.Union([CommandMethod, InputCommandMethod])
export type MoonlightControlAnyCommandMethod = Schema.Schema.Type<
  typeof AnyCommandMethod
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

const InputCommandStatus = Schema.Literals([
  "accepted",
  "applied",
  "failed",
  "invalid",
  "disabled",
  "unsupported",
  "unauthorized",
  "conflict",
])
export type MoonlightControlInputCommandStatus = Schema.Schema.Type<
  typeof InputCommandStatus
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
    commands: Schema.Array(AnyCommandMethod),
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
      min: boundedInt("bitrateKbps.min", 1, Number.MAX_SAFE_INTEGER),
      max: boundedInt("bitrateKbps.max", 1, Number.MAX_SAFE_INTEGER),
    }),
    fps: Schema.Struct({
      min: boundedInt("fps.min", 1, Number.MAX_SAFE_INTEGER),
      max: boundedInt("fps.max", 1, Number.MAX_SAFE_INTEGER),
    }),
    resolution: Schema.Struct({
      width: Schema.Struct({
        min: boundedInt("resolution.width.min", 1, Number.MAX_SAFE_INTEGER),
        max: boundedInt("resolution.width.max", 1, Number.MAX_SAFE_INTEGER),
      }),
      height: Schema.Struct({
        min: boundedInt("resolution.height.min", 1, Number.MAX_SAFE_INTEGER),
        max: boundedInt("resolution.height.max", 1, Number.MAX_SAFE_INTEGER),
      }),
    }),
    touchBounds: Schema.Struct({
      x: Schema.Struct({
        min: boundedInt("touchBounds.x.min", 0, 100_000),
        max: boundedInt("touchBounds.x.max", 0, 100_000),
      }),
      y: Schema.Struct({
        min: boundedInt("touchBounds.y.min", 0, 100_000),
        max: boundedInt("touchBounds.y.max", 0, 100_000),
      }),
      w: Schema.Struct({
        min: boundedInt("touchBounds.w.min", 1, 100_000),
        max: boundedInt("touchBounds.w.max", 1, 100_000),
      }),
      h: Schema.Struct({
        min: boundedInt("touchBounds.h.min", 1, 100_000),
        max: boundedInt("touchBounds.h.max", 1, 100_000),
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

const StreamHealthSample = Schema.StructWithRest(
  Schema.Struct({
    seq: sequenceSchema(),
    sampledAtMs: nonNegativeInt("sampledAtMs"),
    rttMs: Schema.optional(nonNegativeInt("rttMs")),
    rttVarianceMs: Schema.optional(nonNegativeInt("rttVarianceMs")),
    lossFraction: Schema.optional(fractionSchema("lossFraction")),
    deliveredBitrateKbps: Schema.optional(
      nonNegativeInt("deliveredBitrateKbps"),
    ),
    requestedBitrateKbps: Schema.optional(bitrateKbpsSchema()),
    deliveredFps: Schema.optional(nonNegativeInt("deliveredFps")),
    requestedFps: Schema.optional(fpsSchema()),
    framesDropped: Schema.optional(nonNegativeInt("framesDropped")),
    decodeTimeMs: Schema.optional(nonNegativeNumber("decodeTimeMs")),
    queueDepth: Schema.optional(nonNegativeInt("queueDepth")),
    firstFrameMs: Schema.optional(nonNegativeInt("firstFrameMs")),
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
    sample: Schema.optional(StreamHealthSample),
  }),
  [AdditiveFields],
)

const TouchBounds = Schema.Struct({
  x: touchBoundsXSchema(),
  y: touchBoundsYSchema(),
  w: touchBoundsWidthSchema(),
  h: touchBoundsHeightSchema(),
})

const TouchAbsRange = Schema.Struct({
  minX: boundedInt("minX", 0, 65_535),
  maxX: boundedInt("maxX", 0, 65_535),
  minY: boundedInt("minY", 0, 65_535),
  maxY: boundedInt("maxY", 0, 65_535),
})

const InputCommandSnapshot = Schema.StructWithRest(
  Schema.Struct({
    requestId: JsonRpcId,
    command: InputCommandMethod,
    status: InputCommandStatus,
  }),
  [AdditiveFields],
)

const AbsoluteTouchSnapshot = Schema.StructWithRest(
  Schema.Struct({
    enabled: Schema.Boolean,
    boundsRequired: Schema.optional(Schema.Boolean),
    activeBounds: Schema.optional(TouchBounds),
    absRange: Schema.optional(TouchAbsRange),
    lastCommand: Schema.optional(InputCommandSnapshot),
  }),
  [AdditiveFields],
)

const InputRouteSnapshot = Schema.StructWithRest(
  Schema.Struct({
    route: Schema.String,
    status: InputRouteStatus,
    capabilities: Schema.Array(Schema.String),
    absoluteTouch: Schema.optional(AbsoluteTouchSnapshot),
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

const InputCommandAcceptedResult = Schema.StructWithRest(
  Schema.Struct({
    _tag: Schema.Literal("input.command.accepted"),
    requestId: JsonRpcId,
    command: InputCommandMethod,
  }),
  [AdditiveFields],
)

const InputCommandResult = Schema.StructWithRest(
  Schema.Struct({
    _tag: Schema.Literal("input.command.result"),
    requestId: JsonRpcId,
    command: InputCommandMethod,
    status: InputCommandStatus,
  }),
  [AdditiveFields],
)

const ResponseResult = Schema.Union([
  HelloResult,
  StateSnapshotResult,
  EventsSubscribedResult,
  CommandAcceptedResult,
  CommandResult,
  InputCommandAcceptedResult,
  InputCommandResult,
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
    readonly commands: readonly MoonlightControlAnyCommandMethod[]
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
    readonly sample?: MoonlightControlStreamHealthSample
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
    readonly absoluteTouch?: AdditiveObject & {
      readonly enabled: boolean
      readonly boundsRequired?: boolean
      readonly activeBounds?: MoonlightControlTouchBounds
      readonly absRange?: MoonlightControlTouchAbsRange
      readonly lastCommand?: AdditiveObject & {
        readonly requestId: MoonlightControlRequestId
        readonly command: MoonlightControlInputCommandMethod
        readonly status: MoonlightControlInputCommandStatus
      }
    }
  }
}

export interface MoonlightControlStreamHealthSample extends AdditiveObject {
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
}

export interface MoonlightControlTouchBounds {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface MoonlightControlTouchAbsRange {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
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

export interface MoonlightControlInputCommandAcceptedResult
  extends AdditiveObject {
  readonly _tag: "input.command.accepted"
  readonly requestId: MoonlightControlRequestId
  readonly command: MoonlightControlInputCommandMethod
}

export interface MoonlightControlInputCommandResult extends AdditiveObject {
  readonly _tag: "input.command.result"
  readonly requestId: MoonlightControlRequestId
  readonly command: MoonlightControlInputCommandMethod
  readonly status: MoonlightControlInputCommandStatus
}

export type MoonlightControlResponseResult =
  | MoonlightControlHelloResult
  | MoonlightControlStateSnapshotResult
  | MoonlightControlEventsSubscribedResult
  | MoonlightControlCommandAcceptedResult
  | MoonlightControlCommandResult
  | MoonlightControlInputCommandAcceptedResult
  | MoonlightControlInputCommandResult

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

const MoonlightControlResponse = Schema.Union([SuccessResponse, ErrorResponse])

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

const InputSetTouchBoundsRequest = Schema.StructWithRest(
  Schema.Struct({
    jsonrpc: Schema.Literal("2.0"),
    id: JsonRpcId,
    method: InputCommandMethod,
    params: TouchBounds,
  }),
  [AdditiveFields],
)

const MoonlightControlCommandRequest = Schema.Union([
  RuntimeSetBitrateRequest,
  RuntimeSetFpsRequest,
  RuntimeSetResolutionRequest,
  RuntimeRequestIdrRequest,
  InputSetTouchBoundsRequest,
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
  | (AdditiveObject & {
      readonly jsonrpc: "2.0"
      readonly id: MoonlightControlRequestId
      readonly method: "input.setTouchBounds"
      readonly params: MoonlightControlTouchBounds
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
      name: Schema.Literal("quality.sample"),
      sample: StreamHealthSample,
    }),
    [AdditiveFields],
  ),
  Schema.StructWithRest(
    Schema.Struct({
      name: Schema.Literal("runtime.commandResult"),
      requestId: JsonRpcId,
      command: CommandMethod,
      status: RuntimeSettingsStatus,
      reason: Schema.optional(Schema.String),
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
  Schema.StructWithRest(
    Schema.Struct({
      name: Schema.Literal("input.commandResult"),
      requestId: JsonRpcId,
      command: InputCommandMethod,
      status: InputCommandStatus,
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
      readonly name: "quality.sample"
      readonly sample: MoonlightControlStreamHealthSample
    })
  | (AdditiveObject & {
      readonly name: "runtime.commandResult"
      readonly requestId: MoonlightControlRequestId
      readonly command: MoonlightControlCommandMethod
      readonly status: MoonlightControlRuntimeSettingsStatus
      readonly reason?: string
    })
  | (AdditiveObject & {
      readonly name: "input.route"
      readonly route: string
      readonly status: MoonlightControlInputRouteStatus
      readonly capabilities: readonly string[]
    })
  | (AdditiveObject & {
      readonly name: "input.commandResult"
      readonly requestId: MoonlightControlRequestId
      readonly command: MoonlightControlInputCommandMethod
      readonly status: MoonlightControlInputCommandStatus
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

function decodeMoonlightControlEvent(value: unknown): MoonlightControlEvent {
  const event = Schema.decodeUnknownSync(
    Schema.StructWithRest(Schema.Struct({ name: Schema.String }), [
      AdditiveFields,
    ]),
  )(value)

  try {
    return Schema.decodeUnknownSync(KnownEvent)(
      event,
    ) as MoonlightControlKnownEvent
  } catch (error) {
    if (isKnownEventName(event.name)) throw error
    const { name, ...payload } = event
    return { _tag: "unknown.event", name, payload }
  }
}

function isKnownEventName(name: string): boolean {
  return KNOWN_EVENT_NAMES.has(name)
}

const KNOWN_EVENT_NAMES = new Set([
  "lifecycle.starting",
  "lifecycle.connecting",
  "lifecycle.connected",
  "lifecycle.controlReady",
  "lifecycle.streaming",
  "lifecycle.disconnecting",
  "lifecycle.exited",
  "lifecycle.failed",
  "quality.connection",
  "quality.sample",
  "runtime.commandResult",
  "input.route",
  "input.commandResult",
])

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

function touchBoundsXSchema() {
  return boundedInt(
    "x",
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.touchBounds.x.min,
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.touchBounds.x.max,
  )
}

function touchBoundsYSchema() {
  return boundedInt(
    "y",
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.touchBounds.y.min,
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.touchBounds.y.max,
  )
}

function touchBoundsWidthSchema() {
  return boundedInt(
    "w",
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.touchBounds.w.min,
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.touchBounds.w.max,
  )
}

function touchBoundsHeightSchema() {
  return boundedInt(
    "h",
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.touchBounds.h.min,
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.touchBounds.h.max,
  )
}

function sequenceSchema() {
  return boundedInt("seq", 0, Number.MAX_SAFE_INTEGER)
}

function nonNegativeInt(name: string) {
  return boundedInt(name, 0, Number.MAX_SAFE_INTEGER)
}

function nonNegativeNumber(name: string) {
  return Schema.Number.check(
    Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }).annotate(
      {
        identifier: name,
      },
    ),
  )
}

function fractionSchema(name: string) {
  return Schema.Number.check(
    Schema.isBetween({ minimum: 0, maximum: 1 }).annotate({
      identifier: name,
    }),
  )
}

function boundedInt(name: string, minimum: number, maximum: number) {
  return Schema.Int.check(
    Schema.isBetween({ minimum, maximum }).annotate({ identifier: name }),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
