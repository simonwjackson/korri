// Minimal Chrome DevTools Protocol client over Bun's native WebSocket.
//
// Enough surface for the web runtime: connect to the page target, evaluate
// expressions, install scripts that run on every new document, override the
// default background color, and dispatch TRUSTED input (CDP Input.* events grant
// user activation, which is what clears engines like GameMaker's focus gate).

interface PendingResolver {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

export interface CdpClient {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>
  evaluate<T = unknown>(expression: string): Promise<T>
  close(): void
}

interface RuntimeEvaluateResponse<T> {
  result?: { value?: T; description?: string }
  exceptionDetails?: {
    text?: string
    exception?: { description?: string; value?: unknown }
  }
}

export function runtimeEvaluateValue<T>(
  response: RuntimeEvaluateResponse<T>,
): T {
  if (response.exceptionDetails) {
    const details = response.exceptionDetails
    throw new Error(
      details.exception?.description ??
        String(
          details.exception?.value ?? details.text ?? "CDP evaluation failed",
        ),
    )
  }
  return response.result?.value as T
}

async function fetchPageWsUrl(port: number): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/json`)
  const targets = (await res.json()) as Array<{
    type: string
    webSocketDebuggerUrl: string
  }>
  const page = targets.find(t => t.type === "page") ?? targets[0]
  if (!page?.webSocketDebuggerUrl) throw new Error("no CDP page target found")
  return page.webSocketDebuggerUrl
}

export async function connectCdp(
  port: number,
  timeoutMs = 20000,
): Promise<CdpClient> {
  const deadline = Date.now() + timeoutMs
  let wsUrl: string | undefined
  while (Date.now() < deadline) {
    try {
      wsUrl = await fetchPageWsUrl(port)
      break
    } catch {
      await Bun.sleep(250)
    }
  }
  if (!wsUrl) throw new Error(`CDP endpoint not reachable on :${port}`)

  const ws = new WebSocket(wsUrl)
  const pending = new Map<number, PendingResolver>()
  let nextId = 0
  let closedError: Error | undefined

  const rejectPending = (error: Error) => {
    closedError = error
    for (const waiter of pending.values()) waiter.reject(error)
    pending.clear()
  }

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true })
    ws.addEventListener(
      "error",
      () => reject(new Error("CDP websocket error")),
      {
        once: true,
      },
    )
  })

  ws.addEventListener("close", () => {
    rejectPending(new Error("CDP websocket closed"))
  })
  ws.addEventListener("error", () => {
    rejectPending(new Error("CDP websocket error"))
  })

  ws.addEventListener("message", event => {
    const msg = JSON.parse(String(event.data)) as {
      id?: number
      result?: unknown
      error?: { message: string }
    }
    if (msg.id === undefined) return
    const waiter = pending.get(msg.id)
    if (!waiter) return
    pending.delete(msg.id)
    if (msg.error) waiter.reject(new Error(msg.error.message))
    else waiter.resolve(msg.result)
  })

  const send = (method: string, params: Record<string, unknown> = {}) => {
    if (closedError) return Promise.reject(closedError)
    if (ws.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error("CDP websocket is not open"))
    const id = ++nextId
    return new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      try {
        ws.send(JSON.stringify({ id, method, params }))
      } catch (error) {
        pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  const evaluate = async <T>(expression: string): Promise<T> => {
    const result = (await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as RuntimeEvaluateResponse<T>
    return runtimeEvaluateValue(result)
  }

  await send("Page.enable")
  await send("Runtime.enable")

  return { send, evaluate, close: () => ws.close() }
}
