/**
 * The framework-agnostic mount adapter.
 *
 * A host that does not speak React calls `shiftSurface.mount(...)`, pushes new
 * models through the returned handle, and tears it down the same way. React is
 * an implementation detail confined to this file and everything it renders.
 */
import type {
  KorriSurface,
  SurfaceHost,
  SurfaceInstance,
  SurfaceModel,
} from "@contracts/surface/korri-surface"
import { createRoot } from "react-dom/client"
import { ShiftSurface } from "./ShiftSurface"

export const shiftSurface: KorriSurface = {
  id: "shift",
  title: "Shift",
  mount(
    container: HTMLElement,
    model: SurfaceModel,
    host: SurfaceHost,
  ): SurfaceInstance {
    const root = createRoot(container)
    root.render(<ShiftSurface model={model} host={host} />)
    return {
      update(next) {
        root.render(<ShiftSurface model={next} host={host} />)
      },
      unmount() {
        root.unmount()
      },
    }
  },
}
