import { Effect } from "effect"
import { type GetHelloPayload, HelloResponse } from "./rpc"

export const handleGetHello = (payload: typeof GetHelloPayload.Type) =>
  Effect.succeed(
    new HelloResponse({
      message: `Hello, ${payload.name?.trim() || "template"}. Effect RPC is ready.`,
      timestamp: new Date().toISOString(),
    }),
  )
