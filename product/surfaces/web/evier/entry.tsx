import type { StreamControlClient } from "@platform/stream-control/stream-control-client"
import type {
  KorriPlatformBridge,
  KorriSurfaceEntrypoint,
} from "@platform/surface/bridge"
import { createRoot } from "react-dom/client"
import { EvierStreamControlPage } from "./pages/EvierStreamControlPage"

export const evierTheme: KorriSurfaceEntrypoint = {
  id: "evier",
  mount(host, { bridge }) {
    const root = createRoot(host)
    root.render(
      <EvierStreamControlPage
        controller={createBridgeStreamControlClient(bridge)}
      />,
    )
    return () => root.unmount()
  },
}

export default evierTheme

function createBridgeStreamControlClient({
  api,
}: KorriPlatformBridge): StreamControlClient {
  return {
    getControls: () => rpc(api, "app.stream-control.controls.get", {}),
    getState: () => rpc(api, "app.stream-control.state.get", {}),
    setBrightness: payload =>
      rpc(api, "app.stream-control.brightness.set", {
        percent: payload.percent,
        ...(payload.device ? { device: payload.device } : {}),
      }),
    applyAction: payload =>
      rpc(api, "app.stream-control.action.set", {
        action: payload.action,
        payload: payload.payload,
      }),
  }
}

async function rpc<T>(
  api: { readonly rpc: (method: string, payload: unknown) => Promise<unknown> },
  method: string,
  payload: unknown,
): Promise<T> {
  return (await api.rpc(method, payload)) as T
}
