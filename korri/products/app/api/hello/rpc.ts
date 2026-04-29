import { Rpc } from "@effect/rpc"
import { ApiError } from "@shared/api/rpc/errors"
import { Schema } from "effect"

export class GetHelloPayload extends Schema.Class<GetHelloPayload>(
  "GetHelloPayload",
)({
  name: Schema.optional(Schema.String),
}) {}

export class HelloResponse extends Schema.Class<HelloResponse>("HelloResponse")(
  {
    message: Schema.String,
    timestamp: Schema.String,
  },
) {}

export const GetHelloRpc = Rpc.make("app.hello.get", {
  payload: GetHelloPayload,
  success: HelloResponse,
  error: ApiError,
})
