import { Schema } from "effect"

const AcquisitionErrorReason = Schema.Literals([
  "caller",
  "configuration",
  "infrastructure",
  "unsafe-url",
  "unsafe-path",
  "defective-provider",
])

export class AcquisitionError extends Schema.TaggedErrorClass<AcquisitionError>()(
  "AcquisitionError",
  {
    reason: AcquisitionErrorReason,
    message: Schema.String,
    providerId: Schema.optional(Schema.String),
  },
) {}

export const SafeRpcAcquisitionError = Schema.Struct({
  reason: AcquisitionErrorReason,
  message: Schema.String,
})
export type SafeRpcAcquisitionError = Schema.Schema.Type<
  typeof SafeRpcAcquisitionError
>
