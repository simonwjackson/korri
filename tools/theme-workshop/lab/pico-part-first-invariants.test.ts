import { describe, expect, it } from "bun:test"
import type { DeviceState } from "@platform/device/device-facts"
import { deviceStateAtom } from "@platform/react/device/device-atoms"
import { PICO_DESIGN_PARTS } from "@product/surfaces/web/pico/pico-design-parts"
import { picoPowerDisplayForDeviceState } from "@product/surfaces/web/pico/pico-power-state"
import type { Story } from "../types"
import { picoLabSurfaceAdapter } from "./adapters/pico"
import {
  deviceEventsForScreen,
  deviceInputsForScreen,
} from "./model/lab-part-edges"

/**
 * Pico part-first architecture invariants (see
 * docs/solutions/architecture-patterns/pico-parts-are-the-app-2026-07-02.md):
 * parts are the app, devices are mounts. These fail if someone reintroduces a
 * device-anchored edge declaration, drops a live mount for a part that
 * declares events, or breaks the device-as-composition edge inheritance.
 */

function story(
  layer: Story["layer"],
  name: string,
  designPartId?: string,
): Story {
  return {
    id: `pico-invariant-${layer}-${name}`,
    layer,
    name,
    ...(designPartId ? { designPartId } : {}),
    surface: layer === "page",
    render: () => null,
  }
}

const HOME = story("page", "Home", PICO_DESIGN_PARTS.home.id)
const GAME_DETAIL = story(
  "page",
  "Game Detail",
  PICO_DESIGN_PARTS.gameDetail.id,
)
const STATUS_BAR = story(
  "molecule",
  "Status Bar",
  PICO_DESIGN_PARTS.statusBar.id,
)
const PICO_DEVICE_FACT_PARTS: readonly Story[] = [HOME, GAME_DETAIL, STATUS_BAR]

describe("pico part-first invariants", () => {
  it("live-mounts every part that declares device events", () => {
    for (const part of PICO_DEVICE_FACT_PARTS) {
      const events = picoLabSurfaceAdapter.surfacePartEvents?.(part) ?? []
      expect(events.length).toBeGreaterThan(0)
      const spec = picoLabSurfaceAdapter.surfacePartMount?.(part, {
        sourceId: "dev",
        inputValues: {},
      })
      expect(spec).toBeTruthy()
      expect((spec?.initialValues.length ?? 0) > 0).toBe(true)
    }
  })

  it("declares no screen-scoped product edges on the pico adapter", () => {
    expect(picoLabSurfaceAdapter.inputsForScreen).toBeUndefined()
    expect(picoLabSurfaceAdapter.eventsForScreen).toBeUndefined()
  })

  it("provides the shared mount + registry path for placed parts", () => {
    expect(picoLabSurfaceAdapter.partRegistryRoot).toBeTruthy()
    expect(picoLabSurfaceAdapter.surfacePartMount).toBeTruthy()
  })

  it("routes its device screens to page parts by stable id", () => {
    const home = picoLabSurfaceAdapter.screens?.find(s => s.path === "/")
    expect(home?.pagePartId).toBe(PICO_DESIGN_PARTS.home.id)
    const detail = picoLabSurfaceAdapter.screens?.find(s =>
      s.path.startsWith("/game/"),
    )
    expect(detail?.pagePartId).toBe(PICO_DESIGN_PARTS.gameDetail.id)
  })

  it("a device inherits battery+network+clock edges from its page part", () => {
    const stories = [HOME, GAME_DETAIL, STATUS_BAR]
    const events = deviceEventsForScreen(picoLabSurfaceAdapter, "/", stories)
    expect(events.map(e => e.id).sort()).toEqual(["battery", "network"])
    const inputs = deviceInputsForScreen(
      picoLabSurfaceAdapter,
      "/",
      stories,
      [],
    )
    expect(inputs.map(i => i.id)).toEqual(["clock"])
  })

  it("seeds device facts through the production derivation, not raw props", () => {
    // The status bar shows a battery only via
    // picoPowerDisplayForDeviceState(deviceStateAtom); the mount seeds
    // deviceStateAtom from the power reading rather than a hand-set percent.
    const home = picoLabSurfaceAdapter.surfacePartMount?.(HOME, {
      sourceId: "dev",
      inputValues: { power: { percent: 41, charging: true } },
    })
    const pair = home?.initialValues.find(([atom]) => atom === deviceStateAtom)
    expect(pair).toBeTruthy()
    const display = picoPowerDisplayForDeviceState(pair?.[1] as DeviceState)
    expect(display).toEqual({ _tag: "Ready", percent: 41, charging: true })
  })
})
