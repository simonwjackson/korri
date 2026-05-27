import { Schema } from "effect"
import {
  MOONLIGHT_CONTROL_PROTOCOL,
  type MoonlightControlCommandMethod,
  type MoonlightControlEvent,
  type MoonlightControlEventsSubscribedResult,
  type MoonlightControlHelloResult,
  type MoonlightControlResponseResult,
  type MoonlightControlStateSnapshotResult,
} from "./moonlight-control-protocol"

export const MOONLIGHT_RUNTIME_WATCH_ARTIFACT_SCHEMA =
  "korri.moonlight-runtime-watch" as const
export const MOONLIGHT_RUNTIME_WATCH_ARTIFACT_VERSION = 1 as const

const AdditiveFields = Schema.Record(Schema.String, Schema.Unknown)

const RuntimeWatchTerminalResult = Schema.Literals([
  "applied",
  "probe-succeeded",
  "attach-failed",
  "local-rejected",
  "host-rejected",
  "sent-no-terminal-outcome",
  "inconclusive",
  "cancelled",
  "artifact-write-failed",
])
export type MoonlightRuntimeWatchTerminalResult = Schema.Schema.Type<
  typeof RuntimeWatchTerminalResult
>

const RuntimeWatchScenario = Schema.Union([
  Schema.StructWithRest(Schema.Struct({ _tag: Schema.Literal("probe") }), [
    AdditiveFields,
  ]),
  Schema.StructWithRest(
    Schema.Struct({
      _tag: Schema.Literal("set-bitrate"),
      bitrateKbps: Schema.Int,
    }),
    [AdditiveFields],
  ),
  Schema.StructWithRest(
    Schema.Struct({ _tag: Schema.Literal("set-fps"), fps: Schema.Int }),
    [AdditiveFields],
  ),
])
export type MoonlightRuntimeWatchScenario = Schema.Schema.Type<
  typeof RuntimeWatchScenario
>

const RuntimeWatchProof = Schema.StructWithRest(
  Schema.Struct({
    controlPlane: Schema.Literals(["not-collected", "observed", "resynced"]),
    hostApply: Schema.Literals(["not-collected", "reported", "rejected"]),
    deviceRender: Schema.Literals(["not-collected", "reported"]),
  }),
  [AdditiveFields],
)
export type MoonlightRuntimeWatchProof = Schema.Schema.Type<
  typeof RuntimeWatchProof
>

const ProtocolHelloArtifact = Schema.StructWithRest(
  Schema.Struct({
    _tag: Schema.Literal("protocol.hello"),
    protocol: Schema.StructWithRest(
      Schema.Struct({
        name: Schema.Literal(MOONLIGHT_CONTROL_PROTOCOL.name),
        major: Schema.Literal(MOONLIGHT_CONTROL_PROTOCOL.major),
        minor: Schema.Int,
      }),
      [AdditiveFields],
    ),
    session: Schema.StructWithRest(
      Schema.Struct({
        sessionId: Schema.String,
        processId: Schema.optional(Schema.Int),
      }),
      [AdditiveFields],
    ),
    authority: Schema.Literals(["observer", "controller"]),
    capabilities: Schema.StructWithRest(
      Schema.Struct({
        events: Schema.Array(Schema.String),
        commands: Schema.Array(Schema.String),
        experimental: Schema.Array(Schema.String),
      }),
      [AdditiveFields],
    ),
    limits: Schema.StructWithRest(
      Schema.Struct({
        maxFrameBytes: Schema.Int,
        maxClients: Schema.Int,
        eventHistory: Schema.Int,
        maxInFlightMutationsPerFamily: Schema.Int,
        minCommandIntervalMs: Schema.Int,
        bitrateKbps: Schema.Struct({ min: Schema.Int, max: Schema.Int }),
        fps: Schema.Struct({ min: Schema.Int, max: Schema.Int }),
        resolution: Schema.Struct({
          width: Schema.Struct({ min: Schema.Int, max: Schema.Int }),
          height: Schema.Struct({ min: Schema.Int, max: Schema.Int }),
        }),
      }),
      [AdditiveFields],
    ),
  }),
  [AdditiveFields],
)

const StateSnapshotArtifact = Schema.StructWithRest(
  Schema.Struct({
    _tag: Schema.Literal("state.snapshot"),
    seq: Schema.Int,
    session: Schema.StructWithRest(
      Schema.Struct({
        sessionId: Schema.String,
        state: Schema.String,
        appName: Schema.optional(Schema.String),
      }),
      [AdditiveFields],
    ),
    streamQuality: Schema.StructWithRest(
      Schema.Struct({
        connection: Schema.String,
        bitrateKbps: Schema.optional(Schema.Int),
        fps: Schema.optional(Schema.Int),
        width: Schema.optional(Schema.Int),
        height: Schema.optional(Schema.Int),
      }),
      [AdditiveFields],
    ),
    runtimeSettings: Schema.StructWithRest(
      Schema.Struct({
        appliedBitrateKbps: Schema.optional(Schema.Int),
        appliedFps: Schema.optional(Schema.Int),
        appliedResolution: Schema.optional(
          Schema.Struct({ width: Schema.Int, height: Schema.Int }),
        ),
        lastCommand: Schema.optional(
          Schema.StructWithRest(
            Schema.Struct({
              requestId: Schema.Union([Schema.String, Schema.Int]),
              command: Schema.String,
              status: Schema.String,
            }),
            [AdditiveFields],
          ),
        ),
      }),
      [AdditiveFields],
    ),
    input: Schema.StructWithRest(
      Schema.Struct({
        route: Schema.String,
        status: Schema.String,
        capabilities: Schema.Array(Schema.String),
      }),
      [AdditiveFields],
    ),
  }),
  [AdditiveFields],
)

const EventsSubscribedArtifact = Schema.StructWithRest(
  Schema.Struct({ _tag: Schema.Literal("events.subscribed"), seq: Schema.Int }),
  [AdditiveFields],
)

const CommandResultArtifact = Schema.StructWithRest(
  Schema.Struct({
    _tag: Schema.Literals(["command.accepted", "command.result"]),
    requestId: Schema.Union([Schema.String, Schema.Int]),
    command: Schema.String,
    status: Schema.optional(Schema.String),
  }),
  [AdditiveFields],
)

const RuntimeWatchEventRecord = Schema.StructWithRest(
  Schema.Struct({
    seq: Schema.Int,
    monotonicMs: Schema.optional(Schema.Int),
    event: Schema.StructWithRest(Schema.Struct({ name: Schema.String }), [
      AdditiveFields,
    ]),
  }),
  [AdditiveFields],
)

const RuntimeWatchSequenceGap = Schema.StructWithRest(
  Schema.Struct({ expectedSeq: Schema.Int, actualSeq: Schema.Int }),
  [AdditiveFields],
)

export const MoonlightRuntimeWatchArtifact = Schema.StructWithRest(
  Schema.Struct({
    schema: Schema.Literal(MOONLIGHT_RUNTIME_WATCH_ARTIFACT_SCHEMA),
    version: Schema.Literal(MOONLIGHT_RUNTIME_WATCH_ARTIFACT_VERSION),
    run: Schema.StructWithRest(
      Schema.Struct({
        id: Schema.String,
        startedAt: Schema.String,
        completedAt: Schema.optional(Schema.String),
        durationMs: Schema.optional(Schema.Int),
      }),
      [AdditiveFields],
    ),
    socket: Schema.StructWithRest(
      Schema.Struct({ path: Schema.String, attached: Schema.Boolean }),
      [AdditiveFields],
    ),
    scenario: RuntimeWatchScenario,
    hello: Schema.optional(ProtocolHelloArtifact),
    preSnapshot: Schema.optional(StateSnapshotArtifact),
    postSnapshot: Schema.optional(StateSnapshotArtifact),
    subscription: Schema.optional(EventsSubscribedArtifact),
    commandResponse: Schema.optional(CommandResultArtifact),
    observedEvents: Schema.Array(RuntimeWatchEventRecord),
    sequenceGaps: Schema.Array(RuntimeWatchSequenceGap),
    proof: RuntimeWatchProof,
    terminal: Schema.StructWithRest(
      Schema.Struct({
        result: RuntimeWatchTerminalResult,
        exitCode: Schema.Int,
        reason: Schema.optional(Schema.String),
      }),
      [AdditiveFields],
    ),
    error: Schema.optional(
      Schema.StructWithRest(
        Schema.Struct({ category: Schema.String, message: Schema.String }),
        [AdditiveFields],
      ),
    ),
  }),
  [AdditiveFields],
)

export interface MoonlightRuntimeWatchEventRecord {
  readonly seq: number
  readonly monotonicMs?: number
  readonly event: MoonlightControlEvent
}

export interface MoonlightRuntimeWatchSequenceGap {
  readonly expectedSeq: number
  readonly actualSeq: number
}

export interface MoonlightRuntimeWatchArtifact {
  readonly schema: typeof MOONLIGHT_RUNTIME_WATCH_ARTIFACT_SCHEMA
  readonly version: typeof MOONLIGHT_RUNTIME_WATCH_ARTIFACT_VERSION
  readonly run: Readonly<{
    readonly id: string
    readonly startedAt: string
    readonly completedAt?: string
    readonly durationMs?: number
  }>
  readonly socket: Readonly<{ readonly path: string; readonly attached: boolean }>
  readonly scenario: MoonlightRuntimeWatchScenario
  readonly hello?: MoonlightControlHelloResult
  readonly preSnapshot?: MoonlightControlStateSnapshotResult
  readonly postSnapshot?: MoonlightControlStateSnapshotResult
  readonly subscription?: MoonlightControlEventsSubscribedResult
  readonly commandResponse?: MoonlightControlResponseResult
  readonly observedEvents: readonly MoonlightRuntimeWatchEventRecord[]
  readonly sequenceGaps: readonly MoonlightRuntimeWatchSequenceGap[]
  readonly proof: MoonlightRuntimeWatchProof
  readonly terminal: Readonly<{
    readonly result: MoonlightRuntimeWatchTerminalResult
    readonly exitCode: number
    readonly reason?: string
  }>
  readonly error?: Readonly<{ readonly category: string; readonly message: string }>
}

export function decodeMoonlightRuntimeWatchArtifact(
  value: unknown,
): MoonlightRuntimeWatchArtifact {
  return Schema.decodeUnknownSync(MoonlightRuntimeWatchArtifact)(
    value,
  ) as unknown as MoonlightRuntimeWatchArtifact
}
