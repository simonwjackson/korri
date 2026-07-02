import { shiftConfig } from "@product/surfaces/web/shift/config"
import { mountShift } from "@product/surfaces/web/shift/mount-shift"
import { ShiftPartSurface } from "@product/surfaces/web/shift/mount-shift-part"
import { SHIFT_COMPANION_PATH } from "@product/surfaces/web/shift/routes/paths"
import { SHIFT_DESIGN_PARTS } from "@product/surfaces/web/shift/shift-design-parts"
import type { RouterHistory } from "@tanstack/history"
import {
  makeSeedInitialValues,
  makeSeedInitialValuesForBinding,
  type SeedInitialValues,
  shiftLabSources,
} from "../seed/shift-seed"
import type { LabSurfaceAdapter } from "../surface-registry"
import { shiftAxesForScreen, shiftCaptureCoordinate } from "./shift-axes"
import { shiftSurfacePartEvents, shiftSurfacePartInputs } from "./shift-edges"
import {
  renderShiftSurfacePart,
  shiftSurfacePartMount,
} from "./shift-surface-part"

/**
 * Shift's lab adapter. Edges (inputs and events) belong to PARTS
 * (./shift-edges.ts, keyed by story); a live device inherits them from the
 * page part its screen composes (model/lab-part-edges.ts) and declares no
 * screen-scoped product edges of its own. Axes remain derived per screen from
 * the surface's real state machines (./shift-axes.tsx) — the live-surface
 * concern the device genuinely owns alongside its physical screens.
 */
export const shiftLabSurfaceAdapter: LabSurfaceAdapter = {
  id: "shift",
  devices: shiftConfig.devices,
  screens: [
    { label: "Home", path: "/", pagePartId: SHIFT_DESIGN_PARTS.home.id },
    { label: "Game Detail", path: "/game/hollow-knight" },
  ],
  knobs: shiftConfig.knobs,
  defaultPxPerMm: shiftConfig.defaultPxPerMm,
  secondaryScreenPath: SHIFT_COMPANION_PATH,
  axesForScreen: shiftAxesForScreen,
  captureCoordinate: shiftCaptureCoordinate,
  // Shift's Data + Foreground state machines are surfaced as Home screen axes
  // (see shift-axes.tsx). Launch is produced by pressing Play against the real
  // in-memory launcher, not injected as a lab axis/control.
  sources: shiftLabSources,
  // Placed parts mount through the same real registry path a live device uses
  // (Home, Battery, Status Bar); pure fixture parts fall back to the static
  // real-input render.
  partRegistryRoot: ShiftPartSurface,
  surfacePartMount: shiftSurfacePartMount,
  renderSurfacePart: renderShiftSurfacePart,
  surfacePartInputs: shiftSurfacePartInputs,
  surfacePartEvents: shiftSurfacePartEvents,
  makeSeedInitialValues,
  makeSeedInitialValuesForBinding,
  mountSurface: (host, { initialValues, history, dualScreen, onRegistry }) =>
    mountShift(host, {
      data: { initialValues: initialValues as SeedInitialValues },
      navigation: history ? { history: history as RouterHistory } : undefined,
      dualScreen,
      onRegistry,
    }),
}
