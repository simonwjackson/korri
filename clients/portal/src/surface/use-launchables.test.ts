import { describe, expect, test } from "bun:test"
import { createInMemoryLauncherBridge } from "../bridge/launcher-bridge"
import { resolveLocalGameCoverUrls } from "./use-launchables"

describe("resolveLocalGameCoverUrls", () => {
  test("converts opaque local cover asset ids through the bridge seam", async () => {
    const assetId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png"
    const bridge = createInMemoryLauncherBridge({
      localGameAssetUrls: { [assetId]: "data:image/png;base64,fixture" },
    })

    const outcome = await resolveLocalGameCoverUrls(bridge, {
      _tag: "Ok",
      payload: {
        games: [{ id: "wl4", title: "Wario Land 4", system: "GBA", coverAssetId: assetId }],
      },
    })

    expect(outcome).toEqual({
      _tag: "Ok",
      payload: {
        games: [
          {
            id: "wl4",
            title: "Wario Land 4",
            system: "GBA",
            coverAssetId: assetId,
            coverArtUrl: "data:image/png;base64,fixture",
          },
        ],
      },
    })
  })

  test("leaves missing or unresolved assets absent", async () => {
    const outcome = await resolveLocalGameCoverUrls(createInMemoryLauncherBridge(), {
      _tag: "Ok",
      payload: {
        games: [
          {
            id: "wl4",
            title: "Wario Land 4",
            system: "GBA",
            coverAssetId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png",
          },
          { id: "tmnt", title: "TMNT", system: "Android" },
        ],
      },
    })

    expect(outcome._tag).toBe("Ok")
    if (outcome._tag !== "Ok") return
    expect(outcome.payload.games[0]).not.toHaveProperty("coverArtUrl")
    expect(outcome.payload.games[1]).not.toHaveProperty("coverArtUrl")
  })
})
