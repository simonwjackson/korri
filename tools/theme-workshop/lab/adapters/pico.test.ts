import { describe, expect, it } from "bun:test"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import {
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import {
  labSurfaceAdapters,
  resolveLabSurfaceAdapter,
} from "../surface-registry"

describe("pico lab surface adapter", () => {
  it("is registered alongside shift so the theme switcher has two surfaces", () => {
    const ids = labSurfaceAdapters().map(adapter => adapter.id)
    expect(ids).toContain("shift")
    expect(ids).toContain("pico")
  })

  it("resolves pico with devices and production-shaped atom initial values", async () => {
    const adapter = resolveLabSurfaceAdapter("pico")

    expect(adapter.id).toBe("pico")
    expect(adapter.devices.map(device => device.id)).toContain("rg353m")
    expect(adapter.screens?.map(screen => screen.path)).toEqual([
      "/",
      "/game/hollow-knight",
    ])
    expect(adapter.useControls).toBeDefined()

    const initialValues =
      (await adapter.makeSeedInitialValues()) as readonly (readonly [
        unknown,
        unknown,
      ])[]
    const atoms = initialValues.map(([atom]) => atom)
    expect(atoms).toContain(catalogFactsSourceLayerAtom)
    expect(atoms).toContain(librarySourceLayerAtom)
    expect(atoms).toContain(launcherLayerAtom)
  })
})
