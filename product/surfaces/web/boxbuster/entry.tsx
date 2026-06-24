import type { KorriSurfaceEntrypoint } from "@platform/surface/bridge"
import { createRoot } from "react-dom/client"
import { App } from "./app"

export const boxbusterEntry: KorriSurfaceEntrypoint = {
  id: "boxbuster",
  mount(host) {
    const root = createRoot(host)
    root.render(<App />)
    return () => root.unmount()
  },
}

export default boxbusterEntry
