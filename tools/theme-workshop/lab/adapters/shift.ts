import type { RouterHistory } from "@tanstack/history"
import { mountShift } from "@product/surfaces/web/shift/mount-shift"
import { shiftConfig } from "@product/surfaces/web/shift/config"
import type { LabSurfaceAdapter } from "../surface-registry"
import {
  makeSeedInitialValues,
  type SeedInitialValues,
} from "../seed/shift-seed"

export const shiftLabSurfaceAdapter: LabSurfaceAdapter<SeedInitialValues> = {
  id: "shift",
  devices: shiftConfig.devices,
  makeSeedInitialValues,
  mountSurface: (host, { initialValues, history }) =>
    mountShift(host, {
      data: { initialValues },
      navigation: history ? { history: history as RouterHistory } : undefined,
    }),
}
