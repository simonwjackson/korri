import { setBoxbusterArtMode } from "@product/surfaces/web/boxbuster/art-mode"
import { mountBoxbuster } from "@product/surfaces/web/boxbuster/mount-boxbuster"
import type { RouterHistory } from "@tanstack/history"
import type { DeviceConfig, ThemeKnob } from "@simonwjackson/caliper"
import {
  makeSeedInitialValues,
  type SeedInitialValues,
} from "../seed/shift-seed"
import type { LabSurfaceAdapter } from "@simonwjackson/caliper"

const BOXBUSTER_DEVICES: readonly DeviceConfig[] = [
  {
    id: "odin2portal",
    name: "ODIN 2 PORTAL",
    widthMm: 156,
    heightMm: 85,
  },
  {
    id: "tv65",
    name: '65" 4K TV',
    widthMm: 1439,
    heightMm: 809,
    bezel: false,
  },
]

const BOXBUSTER_KNOBS: readonly ThemeKnob[] = [
  {
    id: "base",
    label: "BASE",
    cssVar: "--bb-base-cqi",
    min: 0.5,
    max: 6,
    step: 0.1,
    default: 2.5,
  },
]

export const boxbusterLabSurfaceAdapter: LabSurfaceAdapter = {
  id: "boxbuster",
  devices: BOXBUSTER_DEVICES,
  knobs: BOXBUSTER_KNOBS,
  defaultPxPerMm: 6.78,
  screens: [
    { label: "Store", path: "/" },
    { label: "Now Playing", path: "/game/hollow-knight" },
  ],
  makeSeedInitialValues,
  mountSurface: (host, { initialValues, history }) => {
    const resetArtMode = setBoxbusterArtMode("offline")
    const mounted = mountBoxbuster(host, {
      data: { initialValues: initialValues as SeedInitialValues },
      navigation: history ? { history: history as RouterHistory } : undefined,
    })
    return {
      ...mounted,
      dispose: () => {
        mounted.dispose()
        resetArtMode()
      },
    }
  },
}
