/**
 * boxbuster — theme-workshop config. Exposes the 3D PS1 store as a single
 * full-surface "screen" so the DeviceLab can frame it across the device roster
 * (handheld → TV). Unlike a 2D theme, the scene is an opaque WebGL leaf: the
 * workshop *frames* it and the 2D HUD adapts via container queries
 * (boxbuster.css); the scene interior adapts via the camera, not CSS. The
 * workshop reaches the surface as a screen, never as atoms/molecules — the 3D
 * meshes are an R3F-native tree, not DOM atoms, so they stay out of the catalog.
 *
 * Data-only; tools/theme-workshop imports `boxbusterConfig` and mounts it.
 */
import type {
  DeviceConfig,
  Screen,
  ThemeWorkshopConfig,
} from "@tools/theme-workshop"
import { App } from "./app"
import { DENSITY } from "./layout"

const DEVICES: readonly DeviceConfig[] = [
  {
    id: "rg353m",
    name: "RG353M",
    widthMm: 72,
    heightMm: 52,
    textPct: 100,
    padPct: 100,
  },
  {
    id: "odin2portal",
    name: "ODIN 2 PORTAL",
    widthMm: 156,
    heightMm: 85,
    textPct: 100,
    padPct: 100,
  },
  {
    // 65" 16:9 panel — far larger than the viewport, so the lab scales it down
    // to fit (display only); the layout resolves as a true 4K 10-foot screen.
    id: "tv65",
    name: '65" 4K TV',
    widthMm: 1439,
    heightMm: 809,
    textPct: 100,
    padPct: 100,
    bezel: false,
  },
]

// The surface fills its box via `position: absolute` (see boxbuster.css). The
// DeviceLab frame is a positioned/scaled box, so App just needs a full-size
// relative parent to anchor against.
function StoreScreen({ density }: { density: number }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* embedded: drag-to-look, no global pointer-lock — keeps the workshop
          chrome (tabs, knobs, navigator) clickable. */}
      <App embedded density={density} />
    </div>
  )
}

// Three feels to walk through and compare — each sizes the whole store to the
// library at a different target fill (see layout.ts). Switch with the bottom bar.
const SCREENS: readonly Screen[] = [
  {
    id: "lived-in",
    group: "Store",
    name: "Lived-in (~45%)",
    note: "stocked, but you see the rented gaps",
    render: () => <StoreScreen density={DENSITY.livedIn} />,
  },
  {
    id: "cozy",
    group: "Store",
    name: "Cozy (~60%)",
    note: "smaller, fuller, fewest gaps",
    render: () => <StoreScreen density={DENSITY.cozy} />,
  },
  {
    id: "atmospheric",
    group: "Store",
    name: "Atmospheric (~30%)",
    note: "more open space, most rented-out feel",
    render: () => <StoreScreen density={DENSITY.atmospheric} />,
  },
]

export const boxbusterConfig: ThemeWorkshopConfig = {
  id: "boxbuster",
  devices: DEVICES,
  defaultPxPerMm: 6.78,
  screens: SCREENS,
  groups: ["Store"],
}
