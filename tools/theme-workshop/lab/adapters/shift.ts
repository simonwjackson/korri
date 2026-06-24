import type { RouterHistory } from "@tanstack/history"
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
  knobs: shiftConfig.knobs,
  defaultPxPerMm: shiftConfig.defaultPxPerMm,
  scaleVarPrefix: shiftConfig.scaleVarPrefix,
  makeSeedInitialValues,
  mountSurface: (host, { initialValues, history }) =>
    mountShift(host, {
      data: { initialValues: initialValues as SeedInitialValues },
      navigation: history ? { history: history as RouterHistory } : undefined,
    }),
}
