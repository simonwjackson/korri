import { mountPico } from "@product/surfaces/web/pico/mount-pico"
import { PicoPartSurface } from "@product/surfaces/web/pico/mount-pico-part"
import { usePicoControls } from "@product/surfaces/web/pico/pico-controls"
import { PICO_DESIGN_PARTS } from "@product/surfaces/web/pico/pico-design-parts"
import type { RouterHistory } from "@tanstack/history"
import { createElement, type ReactNode } from "react"
import type { DeviceConfig, ThemeKnob } from "@simonwjackson/caliper"
import {
  makeSeedInitialValues,
  type SeedInitialValues,
} from "../seed/shift-seed"
import type { LabSurfaceAdapter } from "@simonwjackson/caliper"
import { picoAxesForScreen } from "./pico-axes"
import { picoSurfacePartEvents, picoSurfacePartInputs } from "./pico-edges"
import {
  picoSurfacePartMount,
  renderPicoSurfacePart,
} from "./pico-surface-part"

// Inlined from product/surfaces/web/pico/config.tsx so the lab does not import
// the throwaway 100-screen pico gallery; mountPico pulls only the two real
// screens (cartridge shelf + game detail).
const PICO_DEVICES: readonly DeviceConfig[] = [
  {
    id: "rg353m",
    name: "RG353M",
    widthMm: 72,
    heightMm: 52,
  },
  {
    id: "thor",
    name: "THOR",
    widthMm: 132,
    heightMm: 76,
  },
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

const PICO_KNOBS: readonly ThemeKnob[] = [
  {
    id: "base",
    label: "BASE",
    cssVar: "--pico-base-cqi",
    min: 0.5,
    max: 6,
    step: 0.1,
    default: 2.5,
  },
  {
    id: "min",
    label: "MIN",
    cssVar: "--pico-base-min",
    min: 4,
    max: 24,
    step: 1,
    default: 8,
    unit: "px",
  },
  {
    id: "max",
    label: "MAX",
    cssVar: "--pico-base-max",
    min: 12,
    max: 320,
    step: 1,
    default: 200,
    unit: "px",
  },
  {
    id: "ratio",
    label: "RATIO",
    cssVar: "--pico-type-ratio",
    min: 1.1,
    max: 1.6,
    step: 0.01,
    default: 1.25,
  },
  {
    id: "space",
    label: "SPACE",
    cssVar: "--pico-space-unit",
    min: 0.2,
    max: 1.2,
    step: 0.05,
    default: 0.5,
    unit: "em",
  },
]

export const picoLabSurfaceAdapter: LabSurfaceAdapter = {
  id: "pico",
  devices: PICO_DEVICES,
  knobs: PICO_KNOBS,
  defaultPxPerMm: 6.78,
  screens: [
    { label: "Home", path: "/", pagePartId: PICO_DESIGN_PARTS.home.id },
    {
      label: "Game Detail",
      path: "/game/hollow-knight",
      pagePartId: PICO_DESIGN_PARTS.gameDetail.id,
    },
  ],
  axesForScreen: picoAxesForScreen,
  useControls: usePicoControls,
  // Placed parts that read device facts (Status Bar, Home, Game Detail) mount
  // through the same real registry path a live device uses; every other part
  // falls back to the static baked render.
  partRegistryRoot: PicoPartSurface,
  surfacePartMount: picoSurfacePartMount,
  renderSurfacePart: renderPicoSurfacePart,
  surfacePartInputs: picoSurfacePartInputs,
  surfacePartEvents: picoSurfacePartEvents,
  // Pico sizes everything with container queries against a sized
  // [data-pico].pico-screen.intrinsic (640px design width = 100cqw) and derives
  // its --pico-text-*/space tokens there. An isolated preview therefore needs a
  // concretely-sized pico-screen, not just the token scope — otherwise content
  // collapses to 0. 640x480 is Pico's canonical 4:3 design screen.
  previewScope: (children: ReactNode) =>
    createElement(
      "div",
      {
        "data-pico": true,
        className: "pico-screen intrinsic",
        style: { position: "relative", width: 640, height: 480 },
      },
      children,
    ),
  makeSeedInitialValues,
  mountSurface: (host, { initialValues, history, onRegistry }) =>
    mountPico(host, {
      data: { initialValues: initialValues as SeedInitialValues },
      navigation: history ? { history: history as RouterHistory } : undefined,
      onRegistry,
    }),
}
