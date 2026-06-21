import { afterEach, describe, expect, it } from "bun:test"
import { games } from "@platform/fixtures/games/games"
import { DualScreenSessionRoot } from "@platform/react/display/dual-screen/DualScreenSessionRoot"
import { cleanup, render, screen } from "@testing-library/react"
import { ShiftCompanionScreen } from "./ShiftCompanionScreen"

const storyGames = games.slice(0, 2)

afterEach(() => cleanup())

describe("ShiftCompanionScreen", () => {
  it("renders the selected game", () => {
    render(
      <DualScreenSessionRoot initialGameId="ember-circuit">
        <ShiftCompanionScreen items={storyGames} />
      </DualScreenSessionRoot>,
    )

    expect(screen.getByText("Ember Circuit")).toBeTruthy()
    expect(screen.getByText("Forge Foundry")).toBeTruthy()
  })

  it("falls back when the selected game is missing", () => {
    render(
      <DualScreenSessionRoot initialGameId="missing-game">
        <ShiftCompanionScreen items={storyGames} />
      </DualScreenSessionRoot>,
    )

    expect(screen.getByText("Crystalline Drift")).toBeTruthy()
  })

  it("renders title copy when the selected game has no image", () => {
    render(
      <DualScreenSessionRoot initialGameId="text-only">
        <ShiftCompanionScreen
          items={[
            {
              id: "text-only",
              system: "fixture",
              contentPath: "/storage/fixtures/text-only.rom",
              metadata: { name: "Text Only" },
            },
          ]}
        />
      </DualScreenSessionRoot>,
    )

    expect(screen.getByText("Text Only")).toBeTruthy()
    expect(screen.getByText("Unknown studio")).toBeTruthy()
  })
})
