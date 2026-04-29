import { expect, it } from "bun:test"
import { Effect } from "effect"
import { handleGetHello } from "./rpc-handler"

it("returns a starter greeting", async () => {
  const response = await Effect.runPromise(handleGetHello({ name: "Simon" }))

  expect(response.message).toBe("Hello, Simon. Effect RPC is ready.")
  expect(new Date(response.timestamp).toString()).not.toBe("Invalid Date")
})
