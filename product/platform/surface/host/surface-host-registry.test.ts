import { describe, expect, it } from "bun:test"
import { loadSurfaceEntrypoint } from "./surface-host-registry"

describe("surface host registry", () => {
  it("loads first-party surfaces through web entrypoint modules", async () => {
    await expect(loadSurfaceEntrypoint("shift")).resolves.toMatchObject({
      id: "shift",
      mount: expect.any(Function),
    })

    await expect(loadSurfaceEntrypoint("evier")).resolves.toMatchObject({
      id: "evier",
      mount: expect.any(Function),
    })

    await expect(loadSurfaceEntrypoint("vigie")).resolves.toMatchObject({
      id: "vigie",
      mount: expect.any(Function),
    })
  })
})
