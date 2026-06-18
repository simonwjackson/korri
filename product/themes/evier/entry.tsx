import type { StreamControlClient } from "@platform/stream-control/stream-control-client"
import type {
  KorriPlatformBridge,
  KorriThemeEntrypoint,
} from "@platform/theme/bridge"
import { createRoot } from "react-dom/client"
import { EvierStreamControlPage } from "./pages/EvierStreamControlPage"

export const evierTheme: KorriThemeEntrypoint = {
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
    setMoonlightBitrate: payload =>
      rpc(api, "app.stream-control.moonlight-bitrate.set", {
        bitrateKbps: payload.bitrateKbps,
      }),
    setMoonlightFps: payload =>
      rpc(api, "app.stream-control.moonlight-fps.set", { fps: payload.fps }),
    setMoonlightResolution: payload =>
      rpc(api, "app.stream-control.moonlight-resolution.set", {
        width: payload.width,
        height: payload.height,
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
