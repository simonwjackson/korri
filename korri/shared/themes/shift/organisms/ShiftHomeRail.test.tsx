import { afterEach, describe, expect, it } from "bun:test"
import type { GameRecord } from "@shared/fixtures/games/game"
import { cleanup, render } from "@testing-library/react"
import { createRef } from "react"
import { ShiftHomeCtx } from "../templates/ShiftHome.context"
import { ShiftHomeRail } from "./ShiftHomeRail"

const games: readonly GameRecord[] = [
  { id: "resume", metadata: { name: "Resume" } },
  { id: "next", metadata: { name: "Next" } },
]

afterEach(() => cleanup())

describe("ShiftHomeRail", () => {
  it("uses Shift rail geometry tokens instead of component-local pixel styles", () => {
    const { container } = render(
      <ShiftHomeCtx.Provider
        value={{
          items: games,
          resumeTarget: games[0],
          focused: games[0],
          isResumeFocused: true,
          captionAnchorX: 0,
          railRef: createRef<HTMLDivElement>(),
          isLabsOpen: false,
          uiScale: 1,
          focusTile: () => {},
          openLabs: () => {},
          closeLabs: () => {},
          changeUiScale: () => {},
          resetUiScale: () => {},
        }}
      >
        <ShiftHomeRail />
      </ShiftHomeCtx.Provider>,
    )

    const region = container.querySelector<HTMLElement>(
      ".shift-home-rail-region",
    )
    expect(region).not.toBeNull()
    expect(region?.style.height).toBe("")

    const grid = container.querySelector<HTMLElement>(
      '[style*="grid-auto-columns"]',
    )
    expect(grid?.style.gridAutoColumns).toBe("var(--shift-home-rail-cell-size)")
    expect(grid?.style.gridTemplateRows).toBe(
      "var(--shift-home-rail-cell-size)",
    )
    expect(grid?.style.gap).toBe("var(--shift-home-rail-gap)")
  })
})
