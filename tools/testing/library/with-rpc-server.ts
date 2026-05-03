import type { AddressInfo } from "node:net"
import { createAdaptorServer } from "@hono/node-server"

import { honoApp } from "@shared/api/http/hono-app"

/**
 * Boots a real in-process Hono server (the same `honoApp` that production
 * mounts) on a random loopback port and returns its URL.
 *
 * Used by tests that need to exercise the renderer's RPC client over a real
 * HTTP roundtrip — no `fetch` mock, no stubbed handlers. The handlers wired
 * into `honoApp` are the ones the tests want to exercise; this helper just
 * gets them onto a port.
 *
 * Per-call isolation:
 *   - Each call binds to its own ephemeral port so concurrent tests don't
 *     collide.
 *   - `dispose()` closes the listener; further connections to the URL fail.
 *
 * See docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md.
 */

export type RpcServerHarness = {
  /** Base URL of the running server, e.g. `http://127.0.0.1:54321` (no trailing slash). */
  url: string
  /** Convenience: `${url}/api/rpc`, the endpoint the RpcClient POSTs to. */
  rpcUrl: string
  /** The OS-assigned port the server is bound to. */
  port: number
  dispose: () => Promise<void>
  [Symbol.asyncDispose]: () => Promise<void>
}

const LOOPBACK_HOST = "127.0.0.1"

export async function withRpcServer(): Promise<RpcServerHarness> {
  const server = createAdaptorServer({ fetch: honoApp.fetch })

  let port: number
  try {
    port = await new Promise<number>((resolveListen, rejectListen) => {
      const onError = (error: Error) => {
        server.removeListener("listening", onListening)
        rejectListen(error)
      }
      const onListening = () => {
        server.removeListener("error", onError)
        const address = server.address() as AddressInfo | string | null
        if (address === null || typeof address === "string") {
          rejectListen(
            new Error(
              `withRpcServer: unexpected listener address: ${String(address)}`,
            ),
          )
          return
        }
        resolveListen(address.port)
      }
      server.once("error", onError)
      server.once("listening", onListening)
      // Port 0 → OS assigns an unused ephemeral port.
      server.listen(0, LOOPBACK_HOST)
    })
  } catch (error) {
    // Listener never came up; nothing to dispose, but be defensive.
    try {
      await closeServer(server)
    } catch {
      // Swallow — the original error is what the caller cares about.
    }
    throw error
  }

  const url = `http://${LOOPBACK_HOST}:${port}`
  let disposed = false

  const dispose = async () => {
    if (disposed) return
    disposed = true
    await closeServer(server)
  }

  return {
    url,
    rpcUrl: `${url}/api/rpc`,
    port,
    dispose,
    [Symbol.asyncDispose]: dispose,
  }
}

function closeServer(
  server: ReturnType<typeof createAdaptorServer>,
): Promise<void> {
  return new Promise<void>((resolveClose, rejectClose) => {
    server.close(error => {
      if (error) {
        // ERR_SERVER_NOT_RUNNING means it was already closed (or never started)
        // — that's the desired post-condition, so treat it as success.
        const code = (error as NodeJS.ErrnoException).code
        if (code === "ERR_SERVER_NOT_RUNNING") {
          resolveClose()
          return
        }
        rejectClose(error)
        return
      }
      resolveClose()
    })
  })
}
