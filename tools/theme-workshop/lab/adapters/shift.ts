import { shiftConfig } from "@product/surfaces/web/shift/config"
import { mountShift } from "@product/surfaces/web/shift/mount-shift"
import type { RouterHistory } from "@tanstack/history"
import {
  makeSeedInitialValues,
  type SeedInitialValues,
} from "../seed/shift-seed"
import type { LabSurfaceAdapter } from "../surface-registry"
import { shiftAxesForScreen, shiftCaptureCoordinate } from "./shift-axes"

export const shiftLabSurfaceAdapter: LabSurfaceAdapter = {
  id: "shift",
  devices: shiftConfig.devices,
  screens: [
    { label: "Home", path: "/" },
    { label: "Game Detail", path: "/game/hollow-knight" },
  ],
  knobs: shiftConfig.knobs,
  defaultPxPerMm: shiftConfig.defaultPxPerMm,
  axesForScreen: shiftAxesForScreen,
  captureCoordinate: shiftCaptureCoordinate,
  // Shift's Data + Launch state machines are surfaced as the Home screen's axes
  // (see shift-axes.tsx) — not duplicated here as a control.
  makeSeedInitialValues,
  mountSurface: (host, { initialValues, history, dualScreen }) =>
    mountShift(host, {
      data: { initialValues: initialValues as SeedInitialValues },
      navigation: history ? { history: history as RouterHistory } : undefined,
      dualScreen,
    }),
}
