import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import {
  type ShiftCinematicGame,
  ShiftCinematicHome,
} from "./ShiftCinematicHome"

afterEach(() => cleanup())

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
