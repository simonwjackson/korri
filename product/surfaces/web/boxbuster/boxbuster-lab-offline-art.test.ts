import { afterEach, describe, expect, it, mock } from "bun:test"
import { setBoxbusterArtMode } from "./art-mode"
import { fetchSteamScreenshots } from "./steam"
import { fetchCoverImage, loadCoverImage } from "./steamgriddb"

let resetArtMode: (() => void) | undefined

afterEach(() => {
  resetArtMode?.()
  resetArtMode = undefined
  mock.restore()
})

describe("Boxbuster lab offline art", () => {
  it("does not call external art endpoints when dev-lab offline art is enabled", async () => {
    resetArtMode = setBoxbusterArtMode("offline")
    const fetchMock = mock(() => Promise.reject(new Error("should not fetch")))
    globalThis.fetch = fetchMock as never

    await expect(fetchCoverImage("Half-Life 2")).resolves.toBeNull()
    await expect(loadCoverImage("/sgdb/cdn/cover.png")).resolves.toBeNull()
    await expect(fetchSteamScreenshots(220)).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
