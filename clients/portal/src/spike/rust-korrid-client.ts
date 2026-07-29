/** THROWAWAY PROTOTYPE: compile-time and runtime proof of Rust RPC types. */
import type {
  RpcRequest,
  RpcResponse,
} from "@contracts/generated/korrid-spike"

/**
 * The shared operation tag correlates each request with its response without
 * a hand-maintained request/response map.
 */
export type RpcResponseFor<Request extends RpcRequest> = Extract<
  RpcResponse,
  { readonly _tag: Request["_tag"] }
>

export async function callKorrid<Request extends RpcRequest>(
  baseUrl: string,
  request: Request,
): Promise<RpcResponseFor<Request>> {
  const response = await fetch(`${baseUrl}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw new Error(`korrid returned HTTP ${response.status}`)
  return (await response.json()) as RpcResponseFor<Request>
}

export async function smokeKorrid(baseUrl: string) {
  const catalog = await callKorrid(baseUrl, {
    _tag: "app.catalog.snapshot",
    payload: {},
  })
  if (catalog.outcome._tag !== "Ok") {
    throw new Error(catalog.outcome.payload.message)
  }

  const health = await callKorrid(baseUrl, {
    _tag: "system.health",
    payload: {},
  })
  if (health.outcome._tag !== "Ok") {
    throw new Error(health.outcome.payload.message)
  }

  return {
    title: catalog.outcome.payload.games[0]?.title,
    version: health.outcome.payload.version,
  }
}

if (import.meta.main) {
  const result = await smokeKorrid(
    process.env.KORRID_SPIKE_URL ?? "http://127.0.0.1:43117",
  )
  console.log(JSON.stringify(result))
}
