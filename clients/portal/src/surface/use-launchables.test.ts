import { describe, expect, test } from "bun:test"
import { createInMemoryLauncherBridge } from "../bridge/launcher-bridge"
import {
  completeFolderReceiptRegistration,
  initialFolderReceiptState,
  releaseUnknownFolderReceipt,
  selectFolderReceipt,
} from "./folder-receipt-state"
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

describe("folder receipt state", () => {
  test("keeps an unreachable receipt actionable until a new picker generation proceeds", () => {
    let state = initialFolderReceiptState()

    const selected = selectFolderReceipt(state, "picker-1")
    expect(selected._tag).toBe("Submit")
    state = selected.state

    const unreachable = completeFolderReceiptRegistration(
      state,
      "picker-1",
      "BrainUnreachable",
      "brain offline",
    )
    expect(unreachable).toMatchObject({
      _tag: "ReportProblem",
      message: "brain offline",
    })
    state = unreachable.state

    const resumed = selectFolderReceipt(state, "picker-1")
    expect(resumed._tag).toBe("Submit")
    state = resumed.state

    const unknown = completeFolderReceiptRegistration(
      state,
      "picker-1",
      "ReceiptUnknown",
      "receipt expired",
    )
    expect(unknown).toMatchObject({
      _tag: "ReportUnknown",
      message:
        "Korri could not confirm that folder after reconnecting. Choose it again.",
    })
    expect(unknown._tag).not.toBe("Acknowledge")
    state = unknown.state

    const repeated = selectFolderReceipt(state, "picker-1")
    expect(repeated._tag).toBe("Ignore")
    state = releaseUnknownFolderReceipt(state, "picker-1")

    const nextPicker = selectFolderReceipt(state, "picker-2")
    expect(nextPicker._tag).toBe("Submit")
  })
})
