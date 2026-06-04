import { Schema } from "effect"

export class AcquisitionError extends Schema.TaggedErrorClass<AcquisitionError>()(
  "AcquisitionError",
  {
    reason: Schema.Literals([
      "caller",
      "configuration",
      "infrastructure",
      "unsafe-url",
      "unsafe-path",
      "defective-source",
    ]),
    message: Schema.String,
    sourceName: Schema.optional(Schema.String),
  },
) {}

export const SafeRpcAcquisitionError = Schema.Struct({
  reason: Schema.Literals([
    "caller",
    "configuration",
    "infrastructure",
    "unsafe-url",
    "unsafe-path",
    "defective-source",
  ]),
  message: Schema.String,
})
export type SafeRpcAcquisitionError = Schema.Schema.Type<
  typeof SafeRpcAcquisitionError
>
