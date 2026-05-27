import { Schema } from "effect"

const isoDateTime = Schema.makeFilter<string>(value => {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return "must be an ISO timestamp"
  return new Date(time).toISOString() === value
    ? undefined
    : "must be an ISO timestamp"
})

export const ForegroundSessionStatusStateTagSchema = Schema.Literals([
  "IdleReady",
  "Preparing",
  "Spawning",
  "Foregrounding",
  "Running",
  "ExitObserved",
  "TearingDown",
  "VerifyingReady",
  "Failed",
  "Recovering",
])
export type ForegroundSessionStatusStateTag = Schema.Schema.Type<
  typeof ForegroundSessionStatusStateTagSchema
>

export const ForegroundSessionStatusTerminalSchema = Schema.Union([
  Schema.Struct({
    tag: Schema.Literal("Exited"),
    exitCode: Schema.NullOr(Schema.Number),
  }),
  Schema.Struct({ tag: Schema.Literal("Signaled"), signal: Schema.String }),
  Schema.Struct({ tag: Schema.Literal("Terminated") }),
  Schema.Struct({ tag: Schema.Literal("Failed"), message: Schema.String }),
])
export type ForegroundSessionStatusTerminal = Schema.Schema.Type<
  typeof ForegroundSessionStatusTerminalSchema
>

export const ForegroundSessionStatusActiveSchema = Schema.Struct({
  requestId: Schema.String,
  gameId: Schema.String,
  hostId: Schema.optional(Schema.String),
  sessionId: Schema.optional(Schema.String),
  child: Schema.optional(
    Schema.Struct({
      id: Schema.String,
      processId: Schema.optional(Schema.Number),
    }),
  ),
})
export type ForegroundSessionStatusActive = Schema.Schema.Type<
  typeof ForegroundSessionStatusActiveSchema
>

const ForegroundSessionStatusEventBaseSchema = Schema.Struct({
  tag: Schema.String,
  requestId: Schema.optional(Schema.String),
  gameId: Schema.optional(Schema.String),
  state: Schema.optional(ForegroundSessionStatusStateTagSchema),
  previousState: Schema.optional(ForegroundSessionStatusStateTagSchema),
  nextState: Schema.optional(ForegroundSessionStatusStateTagSchema),
  stage: Schema.optional(Schema.String),
  status: Schema.optional(Schema.Literals(["ok", "warning", "failed"])),
  category: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  terminal: Schema.optional(ForegroundSessionStatusTerminalSchema),
  gate: Schema.optional(Schema.String),
})

export const ForegroundSessionStatusEventSchema =
  ForegroundSessionStatusEventBaseSchema
export type ForegroundSessionStatusEvent = Schema.Schema.Type<
  typeof ForegroundSessionStatusEventSchema
>

export const ForegroundSessionStatusFailureSchema = Schema.Struct({
  requestId: Schema.optional(Schema.String),
  gameId: Schema.optional(Schema.String),
  stage: Schema.String,
  message: Schema.String,
})
export type ForegroundSessionStatusFailure = Schema.Schema.Type<
  typeof ForegroundSessionStatusFailureSchema
>

export const ForegroundSessionStatusReadinessSchema = Schema.Struct({
  requestId: Schema.optional(Schema.String),
  status: Schema.Literals(["ok", "failed"]),
  stage: Schema.String,
  gate: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
})
export type ForegroundSessionStatusReadiness = Schema.Schema.Type<
  typeof ForegroundSessionStatusReadinessSchema
>

export const ForegroundSessionStatusTerminalSummarySchema = Schema.Struct({
  requestId: Schema.optional(Schema.String),
  gameId: Schema.optional(Schema.String),
  terminal: ForegroundSessionStatusTerminalSchema,
})
export type ForegroundSessionStatusTerminalSummary = Schema.Schema.Type<
  typeof ForegroundSessionStatusTerminalSummarySchema
>

export const ForegroundSessionStatusSnapshotSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  serverTimestamp: Schema.String.check(isoDateTime),
  state: ForegroundSessionStatusStateTagSchema,
  active: Schema.optional(ForegroundSessionStatusActiveSchema),
  lastTerminal: Schema.optional(ForegroundSessionStatusTerminalSummarySchema),
  lastFailure: Schema.optional(ForegroundSessionStatusFailureSchema),
  lastReadiness: Schema.optional(ForegroundSessionStatusReadinessSchema),
  recentEvents: Schema.Array(ForegroundSessionStatusEventSchema),
})
export type ForegroundSessionStatusSnapshot = Schema.Schema.Type<
  typeof ForegroundSessionStatusSnapshotSchema
>

const STRICT_DECODE = { onExcessProperty: "error" } as const

export const decodeForegroundSessionStatusSnapshot = (
  input: unknown,
): ForegroundSessionStatusSnapshot =>
  Schema.decodeUnknownSync(ForegroundSessionStatusSnapshotSchema)(
    input,
    STRICT_DECODE,
  )

export type ForegroundSessionGateStatusTagState =
  | { readonly _tag: "Known"; readonly state: ForegroundSessionStatusStateTag }
  | { readonly _tag: "Unknown"; readonly state: string }

const knownStatusTags = new Set<string>([
  "IdleReady",
  "Preparing",
  "Spawning",
  "Foregrounding",
  "Running",
  "ExitObserved",
  "TearingDown",
  "VerifyingReady",
  "Failed",
  "Recovering",
])

export function foregroundSessionGateStateFromStatusTag(
  state: string,
): ForegroundSessionGateStatusTagState {
  return knownStatusTags.has(state)
    ? {
        _tag: "Known",
        state: state as ForegroundSessionStatusStateTag,
      }
    : { _tag: "Unknown", state }
}
