import type { StreamHostCandidate } from "@platform/stream/lan-stream-discovery"
import {
  createRemoteStreamControlClient,
  type RemoteStreamControlClient,
} from "./remote-stream-control-client"

/**
 * Normalize an unknown thrown value into a human-readable message.
 * Shared by every korri-cli command so error formatting stays consistent.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return String(error)
}

/**
 * Resolve the remote stream-control client for a host, preferring an injected
 * override (tests, alternate transports) and falling back to the real client.
 */
export function remoteClientFor(
  host: StreamHostCandidate,
  override?: (host: StreamHostCandidate) => RemoteStreamControlClient,
): RemoteStreamControlClient {
  return override?.(host) ?? createRemoteStreamControlClient(host.controlUrl)
}
