import { describe, expect, it } from "bun:test"
import { defineSurface, type SurfaceManifestInput } from "./surface-manifest"

describe("surface manifest", () => {
  it("keeps a well-formed manifest unchanged", () => {
    const manifest = defineSurface({
      id: "@korri:shift",
      kind: "surface",
      medium: "web",
      consumes: ["catalog.read", "library.launch", "input.subscribe"],
      requires: ["@korri:retroarch"],
      recommends: ["@korri:steam"],
    })

    expect(manifest).toEqual({
      id: "@korri:shift",
      kind: "surface",
      medium: "web",
      consumes: ["catalog.read", "library.launch", "input.subscribe"],
      requires: ["@korri:retroarch"],
      recommends: ["@korri:steam"],
    })
  })

  it("defaults optional plugin refs to empty arrays", () => {
    const manifest = defineSurface({
      id: "@korri:cli",
      kind: "surface",
      medium: "terminal",
      consumes: ["catalog.read"],
    })

    expect(manifest.requires).toEqual([])
    expect(manifest.recommends).toEqual([])
  })

  it("rejects unknown media at the type level", () => {
    const valid: SurfaceManifestInput = {
      id: "@korri:ssh-admin",
      kind: "surface",
      medium: "ssh",
      consumes: ["session.read"],
    }

    // @ts-expect-error television is not part of SurfaceMedium.
    const invalid: SurfaceManifestInput = { ...valid, medium: "television" }

    expect(valid.medium).toBe("ssh")
    expect(invalid.medium).toBe("television")
  })
})
