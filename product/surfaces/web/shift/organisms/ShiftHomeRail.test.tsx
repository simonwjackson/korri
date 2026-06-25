import { afterEach, describe, expect, it } from "bun:test"
import type { GameRecord } from "@platform/fixtures/games/game"
import type { EntrySourceTag } from "@platform/library/entry-key"
import { cleanup, render } from "@testing-library/react"
import { createRef } from "react"
import { ShiftHomeCtx } from "../templates/ShiftHome.context"
import { ShiftHomeRail } from "./ShiftHomeRail"

type RailGame = GameRecord & { readonly source?: EntrySourceTag }

const games: readonly GameRecord[] = [
  {
    id: "resume",
    system: "fixture",
    contentPath: "/storage/fixtures/resume.rom",
    metadata: { name: "Resume" },
  },
  {
    id: "next",
    system: "fixture",
    contentPath: "/storage/fixtures/next.rom",
    metadata: { name: "Next" },
  },
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
          isSystemPanelOpen: false,
          uiScale: 1,
          focusTile: () => {},
          openLabs: () => {},
          closeLabs: () => {},
          openSystemPanel: () => {},
          closeSystemPanel: () => {},
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

  it("renders distinct tiles for same-id entries from different sources (AE3)", () => {
    const akaSource: EntrySourceTag = {
      hostId: "aka",
      controlUrl: "http://192.168.1.117:3001",
      isLocal: false,
    }
    const soboSource: EntrySourceTag = {
      hostId: "sobo",
      controlUrl: "http://192.168.1.239:3001",
      isLocal: true,
    }
    const duplicateIdGames: ReadonlyArray<RailGame> = [
      {
        id: "pico-8/celeste",
        system: "pico-8",
        contentPath: "/storage/roms/pico-8/celeste.p8.png",
        metadata: { name: "Celeste (AKA)" },
        source: akaSource,
      },
      {
        id: "pico-8/celeste",
        system: "pico-8",
        contentPath: "/storage/roms/pico-8/celeste.p8.png",
        metadata: { name: "Celeste (Sobo)" },
        source: soboSource,
      },
    ]

    const { container } = render(
      <ShiftHomeCtx.Provider
        value={{
          items: duplicateIdGames,
          resumeTarget: duplicateIdGames[0],
          focused: duplicateIdGames[0],
          isResumeFocused: true,
          captionAnchorX: 0,
          railRef: createRef<HTMLDivElement>(),
          isLabsOpen: false,
          isSystemPanelOpen: false,
          uiScale: 1,
          focusTile: () => {},
          openLabs: () => {},
          closeLabs: () => {},
          openSystemPanel: () => {},
          closeSystemPanel: () => {},
          changeUiScale: () => {},
          resetUiScale: () => {},
        }}
      >
        <ShiftHomeRail />
      </ShiftHomeCtx.Provider>,
    )

    const tiles = container.querySelectorAll<HTMLElement>("[data-tile-id]")
    // Both same-id entries must render as separate focusables. Without
    // source-aware keying they would collide on `data-tile-id` and one
    // would silently overwrite the other.
    expect(tiles).toHaveLength(2)
    const ids = Array.from(tiles).map(tile => tile.dataset.tileId)
    expect(new Set(ids).size).toBe(2)
    // Composite key must include the source discriminator so different
    // peers can be distinguished structurally.
    expect(ids[0]).toContain("aka")
    expect(ids[1]).toContain("sobo")
  })

  it("renders a single local entry with a bare-id key when no source is present (back-compat with fixtures)", () => {
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
          isSystemPanelOpen: false,
          uiScale: 1,
          focusTile: () => {},
          openLabs: () => {},
          closeLabs: () => {},
          openSystemPanel: () => {},
          closeSystemPanel: () => {},
          changeUiScale: () => {},
          resetUiScale: () => {},
        }}
      >
        <ShiftHomeRail />
      </ShiftHomeCtx.Provider>,
    )

    const tiles = container.querySelectorAll<HTMLElement>("[data-tile-id]")
    expect(tiles).toHaveLength(2)
    // Existing fixture entries with no source tag fall back to bare id.
    const ids = Array.from(tiles).map(tile => tile.dataset.tileId)
    expect(ids).toEqual(["resume", "next"])
  })
})
