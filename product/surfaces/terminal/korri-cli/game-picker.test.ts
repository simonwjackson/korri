import { describe, expect, it } from "bun:test"
import type { GameRecord } from "@platform/fixtures/games/game"
import { createStaticGamePicker, gameChoiceFor } from "./game-picker"

const namedGame: GameRecord = {
  id: "snes/f-zero.smc",
  system: "fixture",
  contentPath: "/storage/fixtures/snes/f-zero.smc.rom",
  metadata: { name: "F-Zero" },
}
const unnamedGame: GameRecord = {
  id: "snes/unnamed.smc",
  system: "fixture",
  contentPath: "/storage/fixtures/snes/unnamed.smc.rom",
}

describe("game picker helpers", () => {
  it("uses the display name as the choice title and id as secondary identity", () => {
    expect(gameChoiceFor(namedGame)).toEqual({
      title: "F-Zero",
      description: "snes/f-zero.smc",
      value: namedGame,
    })
  })

  it("falls back to id when a game has no display name", () => {
    expect(gameChoiceFor(unnamedGame)).toEqual({
      title: "snes/unnamed.smc",
      value: unnamedGame,
    })
  })

  it("selects a game by id for non-interactive tests", async () => {
    await expect(
      createStaticGamePicker(unnamedGame.id)([namedGame, unnamedGame]),
    ).resolves.toBe(unnamedGame)
  })
})
