import { describe, expect, it } from "bun:test"
import { act } from "@testing-library/react"
import { boxbusterArtMode } from "@product/surfaces/web/boxbuster/art-mode"
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

  it("enables offline art before mounting and resets it on dispose", async () => {
    const adapter = resolveLabSurfaceAdapter("boxbuster")
    const host = document.createElement("div")
    const initialValues = await adapter.makeSeedInitialValues()

    expect(boxbusterArtMode()).toBe("external")
    let mounted: ReturnType<typeof adapter.mountSurface> | undefined
    act(() => {
      mounted = adapter.mountSurface(host, { initialValues })
    })
    expect(boxbusterArtMode()).toBe("offline")
    act(() => mounted?.dispose())
    expect(boxbusterArtMode()).toBe("external")
  })
})
