import type { StreamControlSession } from "@platform/stream-control/stream-control-session"
import {
  connectMoonlightControl,
  type MoonlightControlClient,
} from "../moonlight-control-client"

/**
 * Adapt Moonlight's local-control client to the platform-owned
 * `StreamControlSession` contract. The plugin owns this mapping so the wire
 * protocol never leaks into the engine; the event payload is passed through
 * opaquely as the platform contract expects.
 */
export function moonlightSessionFromClient(
  client: MoonlightControlClient,
): StreamControlSession {
  return {
    hello: () => client.hello(),
    state: () => client.state(),
    subscribe: () => client.subscribe(),
    setBitrate: params => client.setBitrate(params),
    setFps: params => client.setFps(params),
    setResolution: params => client.setResolution(params),
    setTouchBounds: params => client.setTouchBounds(params),
    onEvent: listener =>
      client.onEvent(delivery =>
        listener({ seq: delivery.seq, event: delivery.event }),
      ),
    close: () => client.close(),
  }
}

export async function connectMoonlightStreamControlSession(input: {
  readonly socketPath: string
}): Promise<StreamControlSession> {
  const client = await connectMoonlightControl({ socketPath: input.socketPath })
  return moonlightSessionFromClient(client)
}
