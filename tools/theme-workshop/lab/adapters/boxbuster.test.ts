import { describe, expect, it } from "bun:test"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import {
  labSurfaceAdapters,
  resolveLabSurfaceAdapter,
} from "../surface-registry"

describe("boxbuster lab surface adapter", () => {
  it("is registered as a lab surface peer", () => {
    const ids = labSurfaceAdapters().map(adapter => adapter.id)

    expect(ids).toContain("shift")
    expect(ids).toContain("pico")
    expect(ids).toContain("boxbuster")
  })

  it("resolves boxbuster with screens and catalog seed atoms", async () => {
    const adapter = resolveLabSurfaceAdapter("boxbuster")

    expect(adapter.id).toBe("boxbuster")
    expect(adapter.devices.map(device => device.id)).toContain("odin2portal")
    expect(adapter.screens?.map(screen => screen.path)).toEqual([
      "/",
      "/game/hollow-knight",
    ])
    expect(adapter.mountSurface).toBeFunction()

    const initialValues =
      (await adapter.makeSeedInitialValues()) as readonly (readonly [
        unknown,
        unknown,
      ])[]
    const atoms = initialValues.map(([atom]) => atom)
    expect(atoms).toContain(catalogFactsSourceLayerAtom)
  })
})
