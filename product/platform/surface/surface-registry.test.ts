import { describe, expect, it } from "bun:test"
import { defineSurface } from "./surface-manifest"
import {
  createSurfaceRegistry,
  DuplicateSurfaceIdError,
  SurfaceDependencyError,
} from "./surface-registry"

const shift = defineSurface({
  id: "@korri:shift",
  kind: "surface",
  medium: "web",
  consumes: ["catalog.read", "library.launch"],
  requires: ["@korri:retroarch"],
})

const cli = defineSurface({
  id: "@korri:cli",
  kind: "surface",
  medium: "terminal",
  consumes: ["catalog.read", "session.stop"],
})

describe("surface registry", () => {
  it("lists and gets registered surfaces", () => {
    const registry = createSurfaceRegistry([shift, cli])

    expect(registry.list()).toEqual([shift, cli])
    expect(registry.get("@korri:shift")).toBe(shift)
    expect(registry.get("@korri:missing")).toBeUndefined()
  })

  it("allows plugin refs in requires and recommends", () => {
    const registry = createSurfaceRegistry([
      defineSurface({
        id: "@korri:pico",
        kind: "surface",
        medium: "web",
        consumes: ["input.subscribe"],
        requires: ["@korri:pico8"],
        recommends: ["@korri:retroarch"],
      }),
    ])

    expect(registry.list()).toHaveLength(1)
  })

  it("rejects duplicate surface ids", () => {
    expect(() => createSurfaceRegistry([shift, shift])).toThrow(
      DuplicateSurfaceIdError,
    )
  })

  it("rejects surface-to-surface references", () => {
    const cabinet = defineSurface({
      id: "@korri:cabinet",
      kind: "surface",
      medium: "web",
      consumes: ["library.launch"],
      requires: ["@korri:shift"],
    })

    expect(() => createSurfaceRegistry([shift, cabinet])).toThrow(
      SurfaceDependencyError,
    )
  })
})
