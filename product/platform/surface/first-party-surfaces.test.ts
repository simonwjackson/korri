import { describe, expect, it } from "bun:test"
import {
  firstPartySurfaceManifests,
  firstPartySurfaceRegistry,
} from "./first-party-surfaces"

describe("first-party surfaces", () => {
  it("registers shipped web surfaces", () => {
    expect(firstPartySurfaceRegistry.list()).toEqual(firstPartySurfaceManifests)
    expect(firstPartySurfaceRegistry.list().map(surface => surface.id)).toEqual(
      [
        "@korri:shift",
        "@korri:evier",
        "@korri:vigie",
        "@korri:cli",
        "@korri:pico",
      ],
    )
    expect(
      firstPartySurfaceRegistry.list().map(surface => surface.medium),
    ).toEqual(["web", "web", "web", "terminal", "web"])
  })

  it("does not carry the deleted plain demo surface", () => {
    expect(firstPartySurfaceRegistry.get("@korri:plain-demo")).toBeUndefined()
  })
})
