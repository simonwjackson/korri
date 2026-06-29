import { describe, expect, it } from "bun:test"
import { advanceDeck, deckFlickFromDirection } from "./shift-library-deck"

describe("deckFlickFromDirection", () => {
  it("maps flicks to intents (up=play, down=favorite, riffle L/R)", () => {
    expect(deckFlickFromDirection("up")).toBe("play")
    expect(deckFlickFromDirection("down")).toBe("favorite")
    expect(deckFlickFromDirection("left")).toBe("prev")
    expect(deckFlickFromDirection("right")).toBe("next")
  })
})

describe("advanceDeck", () => {
  it("wraps forward and backward", () => {
    expect(advanceDeck(0, 3, "next")).toBe(1)
    expect(advanceDeck(2, 3, "next")).toBe(0)
    expect(advanceDeck(0, 3, "prev")).toBe(2)
  })

  it("is safe on an empty deck", () => {
    expect(advanceDeck(0, 0, "next")).toBe(0)
  })
})
