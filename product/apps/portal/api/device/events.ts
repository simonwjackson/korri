import type { DeviceStateService } from "@product/apps/portal/api/device/device-state"
import { getLiveDeviceStateService } from "@product/apps/portal/api/device/device-state"
import type { Context } from "hono"
import { Effect, Fiber, Stream } from "effect"
import { deviceEventForState } from "./events.rpc"

const encoder = new TextEncoder()

function sseData(value: unknown): Uint8Array {
  return encoder.encode(`event: device.state\ndata: ${JSON.stringify(value)}\n\n`)
}

export function createDeviceEventsStream(
  service: DeviceStateService,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  let fiber: ReturnType<typeof Effect.runFork<void, unknown>> | undefined

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (fiber) {
          Effect.runFork(Fiber.interrupt(fiber))
          fiber = undefined
        }
        try {
          controller.close()
        } catch {
          // Stream may already be closed by the consumer.
        }
      }
      if (signal?.aborted) {
        close()
        return
      }
      signal?.addEventListener("abort", close, { once: true })

      fiber = Effect.runFork(
        Stream.runForEach(service.changes, state =>
          Effect.sync(() => controller.enqueue(sseData(deviceEventForState(state)))),
        ).pipe(
          Effect.ensuring(
            Effect.sync(() => signal?.removeEventListener("abort", close)),
          ),
        ),
      )
    },
    cancel() {
      if (fiber) {
        Effect.runFork(Fiber.interrupt(fiber))
        fiber = undefined
      }
    },
  })
}

export async function handleDeviceEvents(c: Context): Promise<Response> {
  const service = await getLiveDeviceStateService()
  return c.newResponse(createDeviceEventsStream(service, c.req.raw.signal), 200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  })
}
