import { afterEach, describe, expect, it } from "bun:test"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import {
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import {
  getPicoDataPreview,
  PICO_DATA_TAGS,
  setPicoDataPreview,
} from "@product/surfaces/web/pico/pico-data-preview"
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
    expect("loadAtomicCatalog" in adapter).toBe(false)

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

describe("pico home data axis", () => {
  afterEach(() => setPicoDataPreview(null))

  const home = () => resolveLabSurfaceAdapter("pico").axesForScreen?.("/") ?? []

  it("exposes a single Data axis derived from the pico data tags", () => {
    const axes = home()
    expect(axes.map(axis => axis.id)).toEqual(["data"])
    expect(axes[0]?.kind).toBe("single")
    expect(axes[0]?.parent).toBeUndefined()
    expect(axes[0]?.states.map(state => state.id)).toEqual([...PICO_DATA_TAGS])
  })

  it("drives the pico data preview singleton on pin and clears on release", () => {
    const data = home()[0]
    expect(data).toBeDefined()
    if (!data) throw new Error("Expected Pico data axis")
    data.pin("Empty")
    expect(getPicoDataPreview()).not.toBeNull()

    data.release()
    expect(getPicoDataPreview()).toBeNull()
  })

  it("exposes no axes for the game detail screen", () => {
    expect(
      resolveLabSurfaceAdapter("pico").axesForScreen?.("/game/hollow-knight"),
    ).toEqual([])
  })
})
