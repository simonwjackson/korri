import { shiftConfig } from "@product/surfaces/web/shift/config"
import { mountShift } from "@product/surfaces/web/shift/mount-shift"
import { SHIFT_COMPANION_PATH } from "@product/surfaces/web/shift/routes/paths"
import { FOREGROUND_SESSION_GATE_STATE_TAGS } from "@product/surfaces/web/shift/shift-foreground-preview"
import type { RouterHistory } from "@tanstack/history"
import {
  makeSeedInitialValues,
  makeSeedInitialValuesForBinding,
  type SeedInitialValues,
  shiftLabSources,
} from "../seed/shift-seed"
import type { LabSurfaceAdapter } from "../surface-registry"
import { shiftAxesForScreen, shiftCaptureCoordinate } from "./shift-axes"
import { renderShiftSurfacePart } from "./shift-surface-part"

export const shiftLabSurfaceAdapter: LabSurfaceAdapter = {
  id: "shift",
  devices: shiftConfig.devices,
  screens: [
    { label: "Home", path: "/" },
    { label: "Game Detail", path: "/game/hollow-knight" },
  ],
  knobs: shiftConfig.knobs,
  defaultPxPerMm: shiftConfig.defaultPxPerMm,
  secondaryScreenPath: SHIFT_COMPANION_PATH,
  axesForScreen: shiftAxesForScreen,
  captureCoordinate: shiftCaptureCoordinate,
  // Shift's Data + Launch state machines are surfaced as the Home screen's axes
  // (see shift-axes.tsx) — not duplicated here as a control.
  sources: shiftLabSources,
  renderSurfacePart: renderShiftSurfacePart,
  // The Home surface part carries a second dial — Foreground — alongside its Data
  // state, so a placed object can show any Data×Foreground combination.
  surfacePartAxes: () => [
    {
      id: "foreground",
      label: "Foreground",
      states: FOREGROUND_SESSION_GATE_STATE_TAGS.map(tag => ({
        id: tag,
        label: tag,
      })),
    },
  ],
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
