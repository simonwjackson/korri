/**
 * Generic helpers for reading streamer control-plane RPC responses. Streamer-
 * specific readback normalization lives in the owning plugin (e.g. the Moonlight
 * plugin's stream-control handlers), keeping this platform layer streamer-free.
 */
export function rpcResult(
  response: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(response)) return undefined
  const result = response.result
  return isRecord(result) ? result : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
