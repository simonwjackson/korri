import { describe, expect, it } from "bun:test"
import { loadThemeEntrypoint } from "./theme-registry"

describe("portal theme registry", () => {
  it("loads first-party themes through web entrypoint modules", async () => {
    await expect(loadThemeEntrypoint("shift")).resolves.toMatchObject({
      id: "shift",
      mount: expect.any(Function),
    })

    await expect(loadThemeEntrypoint("evier")).resolves.toMatchObject({
      id: "evier",
      mount: expect.any(Function),
    })
  })

  it("loads a non-React demo theme through the same entrypoint contract", async () => {
    await expect(loadThemeEntrypoint("plain-demo")).resolves.toMatchObject({
      id: "plain-demo",
      mount: expect.any(Function),
    })
  })
})
