import {
  createSurfaceRegistry,
  type LabSurfaceRegistry,
} from "@simonwjackson/caliper"
import { boxbusterLabSurfaceAdapter } from "./boxbuster"
import { picoLabSurfaceAdapter } from "./pico"
import { shiftLabSurfaceAdapter } from "./shift"

/**
 * A registry over korri's live lab surfaces, for adapter tests that resolve a
 * surface by id. The app entry (tools/lab/main.tsx) builds its own registry
 * inside createCaliperApp; this mirrors that adapter set for test isolation.
 */
export function labTestRegistry(): LabSurfaceRegistry {
  return createSurfaceRegistry([
    shiftLabSurfaceAdapter,
    picoLabSurfaceAdapter,
    boxbusterLabSurfaceAdapter,
  ])
}
