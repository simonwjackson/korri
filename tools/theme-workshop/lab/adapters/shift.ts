import type { RouterHistory } from "@tanstack/history"
import { useShiftControls } from "@product/surfaces/web/shift/shift-controls"
import { mountShift } from "@product/surfaces/web/shift/mount-shift"
import { shiftConfig } from "@product/surfaces/web/shift/config"
import type { LabSurfaceAdapter } from "../surface-registry"
import {
  makeSeedInitialValues,
  type SeedInitialValues,
} from "../seed/shift-seed"

export const shiftLabSurfaceAdapter: LabSurfaceAdapter = {
  id: "shift",
  devices: shiftConfig.devices,
  screens: [
    { label: "Home", path: "/" },
    { label: "Game Detail", path: "/game/hollow-knight" },
  ],
  knobs: shiftConfig.knobs,
  defaultPxPerMm: shiftConfig.defaultPxPerMm,
  scaleVarPrefix: shiftConfig.scaleVarPrefix,
  useControls: useShiftControls,
  makeSeedInitialValues,
  mountSurface: (host, { initialValues, history }) =>
    mountShift(host, {
      data: { initialValues: initialValues as SeedInitialValues },
      navigation: history ? { history: history as RouterHistory } : undefined,
    }),
}
