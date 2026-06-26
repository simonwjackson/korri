import { describe, expect, it } from "bun:test"
import type { LabPartsCatalog } from "../parts-discovery"
import { buildStoryIndex } from "./lab-part-model"
import { screenStories, withScreenStories } from "./lab-screen-parts"

const catalog: LabPartsCatalog = {
  stories: [{ id: "pill", layer: "atom", name: "Pill", render: () => "pill" }],
}

const screens = [
  { label: "Home", path: "/" },
  { label: "Game Detail", path: "/game/hollow-knight" },
]

describe("screenStories", () => {
  it("turns each screen into a page part carrying its route", () => {
    const stories = screenStories(screens)
    expect(stories.map(story => story.name)).toEqual(["Home", "Game Detail"])
    expect(stories.map(story => story.screenPath)).toEqual([
      "/",
      "/game/hollow-knight",
    ])
    expect(stories.every(story => story.layer === "page")).toBe(true)
  })

  it("derives stable, unique ids per route", () => {
    const ids = screenStories(screens).map(story => story.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).not.toBe(ids[1])
  })
})

describe("withScreenStories", () => {
  it("prepends screen page parts to the page group and indexes them", () => {
    const index = withScreenStories(buildStoryIndex(catalog), screens)

    const pageGroup = index.groups.find(group => group.layer === "page")
    expect(pageGroup?.stories.map(story => story.name)).toEqual([
      "Home",
      "Game Detail",
    ])
    // Discovered atom is still present and indexed.
    expect(index.byId.get("pill")?.name).toBe("Pill")
    expect(index.byId.get(screenStories(screens)[0]!.id)?.screenPath).toBe("/")
  })

  it("keeps discovered page parts alongside the screen parts (additive)", () => {
    const withPage: LabPartsCatalog = {
      stories: [
        {
          id: "home-data",
          layer: "page",
          name: "Home · Data states",
          render: () => "data",
        },
      ],
    }
    const index = withScreenStories(buildStoryIndex(withPage), screens)
    const pageGroup = index.groups.find(group => group.layer === "page")
    expect(pageGroup?.stories.map(story => story.name)).toEqual([
      "Home",
      "Game Detail",
      "Home · Data states",
    ])
  })

  it("leaves the index untouched when the surface has no screens", () => {
    const base = buildStoryIndex(catalog)
    expect(withScreenStories(base, [])).toBe(base)
  })
})
