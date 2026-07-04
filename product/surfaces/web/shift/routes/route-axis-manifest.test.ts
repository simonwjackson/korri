import { describe, expect, it } from "bun:test"
import { shiftRouteManifest } from "./route-axis-manifest"
import { shiftRouteManifests } from "./route-tree"

describe("shiftRouteManifest", () => {
  it("splits declared axes into search / param / data kinds", () => {
    const manifest = shiftRouteManifest("/library", {
      axes: [
        { name: "lens", kind: "search" },
        { name: "sort", kind: "search" },
        { name: "data", kind: "data" },
      ],
    })
    expect(manifest.searchAxes).toEqual(["lens", "sort"])
    expect(manifest.dataAxes).toEqual(["data"])
    expect(manifest.paramAxes).toEqual([])
  })

  it("returns empty axis lists when a route declares none", () => {
    const manifest = shiftRouteManifest("/", undefined)
    expect(manifest.searchAxes).toEqual([])
    expect(manifest.paramAxes).toEqual([])
    expect(manifest.dataAxes).toEqual([])
  })
})

describe("shiftRouteManifests (real route tree)", () => {
  const byPath = () =>
    new Map(shiftRouteManifests().map(manifest => [manifest.path, manifest]))

  it("declares the library's lens/sort as search axes plus a data axis", () => {
    const library = byPath().get("/library")
    expect(library?.searchAxes).toEqual(["lens", "sort"])
    expect(library?.dataAxes).toEqual(["data"])
  })

  it("declares the detail route's id as a param axis plus a data axis", () => {
    const detail = byPath().get("/game/$id")
    expect(detail?.paramAxes).toEqual(["id"])
    expect(detail?.dataAxes).toEqual(["data"])
  })

  it("declares the home route's data axis", () => {
    const home = byPath().get("/")
    expect(home?.dataAxes).toEqual(["data"])
    expect(home?.searchAxes).toEqual([])
  })
})
