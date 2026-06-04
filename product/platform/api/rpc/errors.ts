import { Schema } from "effect"

export class DataError extends Schema.TaggedErrorClass<DataError>()(
  "DataError",
  {
    reason: Schema.Literals(["ReadFailed", "WriteFailed", "Unavailable"]),
    message: Schema.String,
    code: Schema.optional(Schema.String),
  },
) {}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()(
  "NotFoundError",
  {
    message: Schema.String,
  },
) {}

export class ValidationError extends Schema.TaggedErrorClass<ValidationError>()(
  "ValidationError",
  {
    message: Schema.String,
    issues: Schema.optional(Schema.Unknown),
  },
) {}

export const ApiError = Schema.Union([
  DataError,
  NotFoundError,
  ValidationError,
])

export type ApiError = DataError | NotFoundError | ValidationError

const apiErrorTags = new Set(["DataError", "NotFoundError", "ValidationError"])

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    typeof (error as { _tag: unknown })._tag === "string" &&
    apiErrorTags.has((error as { _tag: string })._tag)
  )
}
