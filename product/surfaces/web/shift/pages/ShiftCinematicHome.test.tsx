import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import {
  type ShiftCinematicGame,
  ShiftCinematicHome,
  shiftImageWindow,
  shiftPreloadImageUrls,
} from "./ShiftCinematicHome"

const BrowserImage = globalThis.Image

beforeEach(() => {
  Object.defineProperty(globalThis, "Image", {
    configurable: true,
    value: undefined,
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, "Image", {
    configurable: true,
    value: BrowserImage,
  })
  cleanup()
})

const games: readonly ShiftCinematicGame[] = [
  { id: "a", title: "Game A", tileArtUrl: "a.png", wideArtUrl: "aw.png" },
  { id: "b", title: "Game B", tileArtUrl: "b.png", wideArtUrl: "bw.png" },
]

describe("ShiftCinematicHome onLaunch", () => {
  it("launches the focused tile and only focuses an unfocused one", () => {
    const onLaunch = mock(() => undefined)
    render(<ShiftCinematicHome games={games} onLaunch={onLaunch} />)

    // index 0 is focused at mount → clicking it launches.
    fireEvent.click(screen.getByRole("button", { name: "Game A" }))
    expect(onLaunch).toHaveBeenCalledWith("a")

    onLaunch.mockClear()

    // An unfocused tile focuses (no launch) on first click, launches on second.
    fireEvent.click(screen.getByRole("button", { name: "Game B" }))
    expect(onLaunch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Game B" }))
    expect(onLaunch).toHaveBeenCalledWith("b")
  })

  it("reports the initial and focused game through an optional focus callback", () => {
    const onGameFocus = mock(() => undefined)
    render(<ShiftCinematicHome games={games} onGameFocus={onGameFocus} />)

    expect(onGameFocus).toHaveBeenCalledWith("a")

    fireEvent.focus(screen.getByRole("button", { name: "Game B" }))

    expect(onGameFocus).toHaveBeenLastCalledWith("b")
  })

  it("follows DOM focus so every device drives the rail, not just the keyboard", () => {
    render(<ShiftCinematicHome games={games} />)
    const tileB = screen.getByRole("button", { name: "Game B" })
    // Mount seeds focus on the first tile, so B is not the centered selection.
    expect(tileB.getAttribute("data-focused")).toBeNull()
    // Moving real DOM focus is exactly what the platform focus engine does for a
    // controller `direction` (and keyboard arrows, and the desktop input
    // bridge). The centered rail selection must follow that focus rather than a
    // private key handler — the gap that dropped controller navigation before.
    fireEvent.focus(tileB)
    expect(tileB.getAttribute("data-focused")).toBe("true")
  })

  it("renders available metadata and play-state chips", () => {
    render(
      <ShiftCinematicHome
        games={[
          {
            id: "a",
            title: "Game A",
            tileArtUrl: "a.png",
            wideArtUrl: "aw.png",
            genre: "Metroidvania",
            developer: "Team Cherry",
            lastPlayedLabel: "3h ago",
            playtimeLabel: "4.5h",
            favorite: true,
          },
        ]}
      />,
    )

    expect(screen.getByText("Metroidvania")).toBeTruthy()
    expect(screen.getByText("Team Cherry")).toBeTruthy()
    expect(screen.getByText("3h ago")).toBeTruthy()
    expect(screen.getByText("4.5h")).toBeTruthy()
    expect(screen.getByText("★ Favorite")).toBeTruthy()
  })

  it("does not require a launch handler (prototype/fixture usage)", () => {
    render(<ShiftCinematicHome games={games} />)
    fireEvent.click(screen.getByRole("button", { name: "Game A" }))
    // No throw, tile is focusable without a handler.
    expect(screen.getByRole("button", { name: "Game A" })).toBeTruthy()
  })

  it("bounds mounted tile images while keeping every tile focusable", () => {
    const manyGames = Array.from({ length: 30 }, (_, index) => ({
      id: `game-${index}`,
      title: `Game ${index}`,
      tileArtUrl: `tile-${index}.png`,
      wideArtUrl: `wide-${index}.png`,
    })) satisfies readonly ShiftCinematicGame[]

    const { container } = render(<ShiftCinematicHome games={manyGames} />)

    expect(screen.getAllByRole("button")).toHaveLength(30)
    expect(container.querySelectorAll(".shift-cine-tile img")).toHaveLength(10)
    expect(
      screen.getByRole("button", { name: "Game 0" }).querySelector("img"),
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Game 29" }).querySelector("img"),
    ).toBeNull()

    fireEvent.focus(screen.getByRole("button", { name: "Game 15" }))

    expect(container.querySelectorAll(".shift-cine-tile img")).toHaveLength(19)
    expect(
      screen.getByRole("button", { name: "Game 15" }).querySelector("img"),
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Game 0" }).querySelector("img"),
    ).toBeNull()
  })
})

describe("ShiftCinematicHome library affordance", () => {
  it("appends a trailing Library entry and opens it on confirm", () => {
    const onOpenLibrary = mock(() => undefined)
    render(<ShiftCinematicHome games={games} onOpenLibrary={onOpenLibrary} />)

    const libraryTile = screen.getByRole("button", { name: "Library" })
    // Mount focus sits on Game A, so the first activation only focuses the
    // trailing slot (it does not open).
    fireEvent.click(libraryTile)
    expect(onOpenLibrary).not.toHaveBeenCalled()
    expect(screen.getByText("Browse every game")).toBeTruthy()

    // Confirming the focused Library slot opens the library.
    fireEvent.click(libraryTile)
    expect(onOpenLibrary).toHaveBeenCalledTimes(1)
  })

  it("omits the Library entry when no handler is provided", () => {
    render(<ShiftCinematicHome games={games} />)
    expect(screen.queryByRole("button", { name: "Library" })).toBeNull()
  })
})

describe("ShiftCinematicHome surprise affordance", () => {
  it("appends a trailing Surprise entry and picks on confirm", () => {
    const onSurprise = mock(() => undefined)
    const onOpenLibrary = mock(() => undefined)
    render(
      <ShiftCinematicHome
        games={games}
        onSurprise={onSurprise}
        onOpenLibrary={onOpenLibrary}
      />,
    )

    const surpriseTile = screen.getByRole("button", { name: "Surprise me" })
    // Mount focus sits on Game A, so the first activation only focuses the slot.
    fireEvent.click(surpriseTile)
    expect(onSurprise).not.toHaveBeenCalled()
    expect(screen.getByText("Jump into something at random")).toBeTruthy()

    // Confirming the focused Surprise slot fires the random pick.
    fireEvent.click(surpriseTile)
    expect(onSurprise).toHaveBeenCalledTimes(1)
    expect(onOpenLibrary).not.toHaveBeenCalled()
  })

  it("omits the Surprise entry when no handler is provided", () => {
    render(<ShiftCinematicHome games={games} onOpenLibrary={() => undefined} />)
    expect(screen.queryByRole("button", { name: "Surprise me" })).toBeNull()
  })
})

describe("ShiftCinematicHome fresh marker", () => {
  it("marks a fresh game's tile and leads its hero with a reason chip", () => {
    const freshGames: readonly ShiftCinematicGame[] = [
      { id: "a", title: "Game A", tileArtUrl: "a.png", wideArtUrl: "aw.png" },
      {
        id: "b",
        title: "Game B",
        tileArtUrl: "b.png",
        wideArtUrl: "bw.png",
        fresh: true,
      },
    ]
    render(<ShiftCinematicHome games={freshGames} />)

    const freshTile = screen.getByRole("button", { name: "Game B" })
    expect(freshTile.querySelector(".shift-cine-tile-fresh")).toBeTruthy()
    fireEvent.focus(freshTile)
    expect(screen.getByText("Fresh pick")).toBeTruthy()
  })
})

describe("ShiftCinematicHome image windows", () => {
  it("selects a bounded image window around focus", () => {
    expect(shiftImageWindow({ index: 0, total: 30, radius: 9 })).toEqual({
      start: 0,
      end: 9,
    })
    expect(shiftImageWindow({ index: 15, total: 30, radius: 9 })).toEqual({
      start: 6,
      end: 24,
    })
  })

  it("preloads nearby tile art and only adjacent backdrop art", () => {
    const manyGames = Array.from({ length: 30 }, (_, index) => ({
      id: `game-${index}`,
      title: `Game ${index}`,
      tileArtUrl: `tile-${index}.png`,
      wideArtUrl: `wide-${index}.png`,
    })) satisfies readonly ShiftCinematicGame[]

    const urls = shiftPreloadImageUrls(manyGames, 15)

    expect(urls).toContain("tile-3.png")
    expect(urls).toContain("tile-27.png")
    expect(urls).not.toContain("tile-2.png")
    expect(urls).toContain("wide-13.png")
    expect(urls).toContain("wide-17.png")
    expect(urls).not.toContain("wide-12.png")
  })
})

describe("ShiftCinematicHome launch feedback", () => {
  it("shows a failure with a calm reason and retries instead of launching", () => {
    const onRetry = mock(() => undefined)
    const onLaunch = mock(() => undefined)
    render(
      <ShiftCinematicHome
        games={games}
        onLaunch={onLaunch}
        onRetry={onRetry}
        launchState={{
          _tag: "Failed",
          gameId: "a",
          exitCode: 1,
          failureKind: "command-failed",
        }}
      />,
    )

    expect(screen.getByText("Couldn't start")).toBeTruthy()
    expect(screen.getByText("It didn't start")).toBeTruthy()
    expect(screen.getByText("Retry")).toBeTruthy()

    // A (the focused tile) retries while a failure is shown — it does not launch.
    fireEvent.click(screen.getByRole("button", { name: "Game A" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onLaunch).not.toHaveBeenCalled()
  })

  it("hides Retry for non-retryable failures and keeps Back", () => {
    render(
      <ShiftCinematicHome
        games={games}
        launchState={{
          _tag: "Failed",
          gameId: "a",
          exitCode: 127,
          failureKind: "no-such-game",
        }}
      />,
    )

    expect(screen.getByText("We can't find this game")).toBeTruthy()
    expect(screen.queryByText("Retry")).toBeNull()
    expect(screen.getByText("Back")).toBeTruthy()
  })

  it("shows a Starting state without the normal hero chips", () => {
    render(
      <ShiftCinematicHome
        games={[
          {
            id: "a",
            title: "Game A",
            tileArtUrl: "a.png",
            wideArtUrl: "aw.png",
            genre: "Metroidvania",
          },
        ]}
        launchState={{ _tag: "Launching", gameId: "a" }}
      />,
    )

    expect(screen.getByText("Starting\u2026")).toBeTruthy()
    expect(screen.queryByText("Metroidvania")).toBeNull()
  })
})
