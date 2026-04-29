import { Effect } from "effect"
import type { GetHelloPayload } from "./rpc"

export const handleGetHello = (payload: typeof GetHelloPayload.Type) =>
  Effect.succeed({
    message: `Hello, ${payload.name?.trim() || "template"}. Effect RPC is ready.`,
    timestamp: new Date().toISOString(),
  })
