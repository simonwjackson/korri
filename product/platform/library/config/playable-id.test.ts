import { describe, expect, it } from "bun:test"

import {
  decodePlayableId,
  isContainerOnly,
  listPlayableEntries,
  playableIdFor,
  selectLaunchableRelease,
  splitPlayableId,
} from "./playable-id"
import type { LibraryItemRecord } from "./records/library-item"

const downwell: LibraryItemRecord = {
  id: "downwell",
  title: "Downwell",
  releases: [
    {
      id: "windows",
      system: "windows",
      target: "steam://rungameid/360740",
    },
  ],
}

const sonic: LibraryItemRecord = {
  id: "sonic-the-hedgehog",
  title: "Sonic the Hedgehog",
  releases: [
    {
      id: "genesis",
      system: "genesis",
      target: "genesis/Sonic The Hedgehog.md",
    },
    { id: "windows-known", system: "windows" },
    {
      id: "steam",
      system: "windows",
      target: "steam://rungameid/71113",
    },
  ],
}

const superMarioAdvance2: LibraryItemRecord = {
  id: "super-mario-advance-2",
  title: "Super Mario Advance 2",
  contains: {
    "super-mario-world": {
      title: "Super Mario World",
      "version-of": "super-mario-world",
      relation: "gba-port",
    },
    "mario-bros": {
      title: "Mario Bros.",
      relation: "bundled-extra",
    },
  },
  releases: [
    {
      id: "gba",
      system: "gba",
      target: "gba/Super Mario Advance 2.gba",
    },
  ],
}

describe("playable id syntax", () => {
  it("round-trips top-level and contained playable ids", () => {
    expect(playableIdFor("downwell")).toBe("downwell")
    expect(playableIdFor("super-mario-advance-2", "super-mario-world")).toBe(
      "super-mario-advance-2/super-mario-world",
    )

    expect(splitPlayableId("downwell")).toEqual({ itemId: "downwell" })
    expect(splitPlayableId("super-mario-advance-2/super-mario-world")).toEqual({
      itemId: "super-mario-advance-2",
      containedId: "super-mario-world",
    })
  })

  it("rejects ids that escape the one-package/one-contained path shape", () => {
    for (const id of [
      "",
      "/super-mario-world",
      "super-mario-advance-2/",
      "super-mario-advance-2/super-mario-world/bonus",
      "super-mario-advance-2//super-mario-world",
      "super mario world",
      "../super-mario-world",
      "super-mario-advance-2/..",
    ]) {
      expect(() => decodePlayableId(id), id).toThrow()
    }
  })
})

describe("playable entry derivation", () => {
  it("lists normal top-level library items as playable by default", () => {
    expect(isContainerOnly(downwell)).toBe(false)
    expect(listPlayableEntries([downwell])).toEqual([
      {
        id: "downwell",
        itemId: "downwell",
        item: downwell,
        releases: downwell.releases,
        title: "Downwell",
      },
    ])
  })

  it("treats packages with contains as container-only by default", () => {
    expect(isContainerOnly(superMarioAdvance2)).toBe(true)
    expect(
      listPlayableEntries([superMarioAdvance2]).map(entry => entry.id),
    ).toEqual([
      "super-mario-advance-2/super-mario-world",
      "super-mario-advance-2/mario-bros",
    ])
  })

  it("applies package releases to contained playables", () => {
    const [entry] = listPlayableEntries([superMarioAdvance2])
    expect(entry?.itemId).toBe("super-mario-advance-2")
    expect(entry?.containedId).toBe("super-mario-world")
    expect(entry?.contained?.title).toBe("Super Mario World")
    expect(entry?.releases).toBe(superMarioAdvance2.releases)
  })
})

describe("release selection", () => {
  it("selects the only launchable release when release id is omitted", () => {
    expect(selectLaunchableRelease(downwell.releases)).toEqual({
      _tag: "SelectedRelease",
      release: downwell.releases[0],
    })
  })

  it("selects the only launchable release even when known-only releases exist", () => {
    const result = selectLaunchableRelease([
      { id: "known", system: "windows" },
      { id: "genesis", system: "genesis", target: "genesis/Sonic.md" },
    ])
    expect(result._tag).toBe("SelectedRelease")
    if (result._tag === "SelectedRelease") {
      expect(result.release.id).toBe("genesis")
    }
  })

  it("rejects omitted release id when multiple launchable releases exist", () => {
    expect(selectLaunchableRelease(sonic.releases)).toEqual({
      _tag: "AmbiguousRelease",
      launchableReleaseIds: ["genesis", "steam"],
    })
  })

  it("rejects explicit known-only and missing releases clearly", () => {
    expect(selectLaunchableRelease(sonic.releases, "windows-known")).toEqual({
      _tag: "ReleaseNotLaunchable",
      releaseId: "windows-known",
    })
    expect(selectLaunchableRelease(sonic.releases, "missing")).toEqual({
      _tag: "ReleaseNotFound",
      releaseId: "missing",
    })
  })
})
