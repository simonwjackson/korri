import type {
  ConfigGraphController,
  ConfigGraphEvent,
} from "@platform/library/config-graph-controller"
import type { Context } from "hono"

const encoder = new TextEncoder()

/**
 * Serialize a config-graph event as a Server-Sent Event. The event name is the
 * SSE `event:` field; the `data:` payload carries the lifecycle fields without
 * duplicating the name.
 */
function sseEvent(event: ConfigGraphEvent): Uint8Array {
  const { name, ...payload } = event
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`)
}

export function createConfigEventsStream(
  controller: ConfigGraphController,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  let unsubscribe: (() => void) | undefined
  let onAbort: (() => void) | undefined

  return new ReadableStream<Uint8Array>({
    start(controllerStream) {
      const close = () => {
        unsubscribe?.()
        unsubscribe = undefined
        if (onAbort) signal?.removeEventListener("abort", onAbort)
        try {
          controllerStream.close()
        } catch {
          // The stream may already be closed.
        }
      }

      if (signal?.aborted) {
        close()
        return
      }
      onAbort = close
      signal?.addEventListener("abort", onAbort, { once: true })

      // subscribe() immediately delivers the current `config.ready`, then
      // streams subsequent config.changed / config.invalid events.
      unsubscribe = controller.subscribe(event => {
        try {
          controllerStream.enqueue(sseEvent(event))
        } catch {
          close()
        }
      })
    },
    cancel() {
      unsubscribe?.()
      unsubscribe = undefined
      if (onAbort) signal?.removeEventListener("abort", onAbort)
    },
  })
}

export function handleConfigEvents(
  c: Context,
  controller: ConfigGraphController,
): Response {
  const stream = createConfigEventsStream(controller, c.req.raw.signal)
  return c.newResponse(stream, 200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  })
}
