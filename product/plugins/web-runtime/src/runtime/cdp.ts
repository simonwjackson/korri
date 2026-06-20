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
    const id = ++nextId
    return new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }

  const evaluate = async <T>(expression: string): Promise<T> => {
    const result = (await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as { result?: { value?: T } }
    return result.result?.value as T
  }

  await send("Page.enable")
  await send("Runtime.enable")

  return { send, evaluate, close: () => ws.close() }
}
