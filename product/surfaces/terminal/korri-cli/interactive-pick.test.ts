import { describe, expect, it } from "bun:test"
import type { GameRecord } from "@platform/fixtures/games/game"
import { createStaticGamePicker } from "./game-picker"
import { pickGameChoice } from "./interactive-pick"

const gameA: GameRecord = {
  id: "snes/a.smc",
  system: "fixture",
  contentPath: "/storage/fixtures/snes/a.smc.rom",
  metadata: { name: "Game A" },
}
const gameB: GameRecord = {
  id: "snes/b.smc",
  system: "fixture",
  contentPath: "/storage/fixtures/snes/b.smc.rom",
  metadata: { name: "Game B" },
}

describe("pickGameChoice", () => {
  it("returns Picked with the selected choice", async () => {
    const result = await pickGameChoice({
      choices: [gameA, gameB],
      stdinIsTty: true,
      gamePicker: createStaticGamePicker(gameB.id),
    })
    expect(result).toEqual({ _tag: "Picked", choice: gameB })
  })

  it("proceeds to pick when stdinIsTty is unset (not explicitly false)", async () => {
    const result = await pickGameChoice({
      choices: [gameA],
      gamePicker: createStaticGamePicker(gameA.id),
    })
    expect(result).toEqual({ _tag: "Picked", choice: gameA })
  })

  it("returns NoTty when stdin is not a terminal", async () => {
    const result = await pickGameChoice({
      choices: [gameA],
      stdinIsTty: false,
      gamePicker: createStaticGamePicker(gameA.id),
    })
    expect(result).toEqual({ _tag: "NoTty" })
  })

  it("returns NoPicker when no picker is available", async () => {
    const result = await pickGameChoice({
      choices: [gameA],
      stdinIsTty: true,
    })
    expect(result).toEqual({ _tag: "NoPicker" })
  })

  it("returns Cancelled when the picker resolves to nothing", async () => {
    const result = await pickGameChoice({
      choices: [gameA],
      stdinIsTty: true,
      gamePicker: async () => undefined,
    })
    expect(result).toEqual({ _tag: "Cancelled" })
  })
})
