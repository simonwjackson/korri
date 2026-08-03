import { describe, expect, test } from "bun:test"
import { act, fireEvent, render, screen } from "@testing-library/react"
import type { SurfaceModel } from "@contracts/surface/korri-surface"
import {
  createFixtureHost,
  fixtureModel,
} from "../src/fixtures/fixture-host"
import { ShiftSurface } from "../src/ShiftSurface"

const model = (overrides: Partial<SurfaceModel> = {}): SurfaceModel => ({
  ...fixtureModel,
  ...overrides,
})

describe("ShiftSurface", () => {
  test("renders every game the host published, in the host's order", () => {
    render(<ShiftSurface model={model()} host={createFixtureHost()} />)

    const tiles = screen.getAllByRole("button", {
      name: /Skate 3|Wario Land 4|Neverball/,
    })
    expect(tiles.map(tile => tile.getAttribute("aria-label"))).toEqual([
      "Skate 3",
      "Wario Land 4",
      "Neverball",
    ])
  })

  test("draws a title monogram when the host has no cover art", () => {
    const { container } = render(
      <ShiftSurface model={model()} host={createFixtureHost()} />,
    )

    expect(container.querySelectorAll("img")).toHaveLength(0)
    expect(container.querySelectorAll(".shift-monogram").length).toBe(3)
  })

  test("host actions become rail entries, not games", () => {
    render(<ShiftSurface model={model()} host={createFixtureHost()} />)

    expect(screen.getByRole("button", { name: "Pair a device" })).toBeDefined()
  })

  test("confirming a tile asks the host to launch that game", () => {
    const host = createFixtureHost()
    render(<ShiftSurface model={model()} host={host} />)

    // The first tile is focused at mount, so a single activation launches it.
    fireEvent.click(screen.getByRole("button", { name: "Skate 3" }))
    expect(host.calls).toEqual(["launch:now-playing:L1"])
  })

  test("activating a rail action asks the host to run it", () => {
    const host = createFixtureHost()
    render(<ShiftSurface model={model()} host={host} />)

    // The host's focus controller moves DOM focus; confirm then activates it.
    const pair = screen.getByRole("button", { name: "Pair a device" })
    fireEvent.focus(pair)
    fireEvent.click(pair)
    expect(host.calls).toEqual(["action:pairing"])
  })

  test("busy work shows the host's words, never an error", () => {
    render(
      <ShiftSurface
        model={model({
          status: { _tag: "Busy", kicker: "Starting Wario Land 4…" },
        })}
        host={createFixtureHost()}
      />,
    )

    expect(screen.getByText("Starting Wario Land 4…")).toBeDefined()
  })

  test("a problem offers Back, and back dismisses it", () => {
    const host = createFixtureHost()
    render(
      <ShiftSurface
        model={model({
          status: {
            _tag: "Problem",
            kicker: "Couldn't start",
            reason: "local ROM is missing",
            canRetry: false,
          },
        })}
        host={host}
      />,
    )

    expect(screen.getByText("local ROM is missing")).toBeDefined()
    act(() => host.press("back"))
    expect(host.calls).toEqual(["dismiss"])
  })

  test("a retryable problem routes A to retry", () => {
    const host = createFixtureHost()
    render(
      <ShiftSurface
        model={model({
          status: {
            _tag: "Problem",
            kicker: "Couldn't start",
            reason: "That device is offline",
            canRetry: true,
          },
        })}
        host={host}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Skate 3" }))
    expect(host.calls).toEqual(["retry"])
  })

  test("loading, empty, and error each get their own body", () => {
    const host = createFixtureHost()
    const loading = render(
      <ShiftSurface model={model({ catalog: { _tag: "Loading" } })} host={host} />,
    )
    expect(screen.getByText("Loading library…")).toBeDefined()
    loading.unmount()

    const empty = render(
      <ShiftSurface model={model({ catalog: { _tag: "Empty" } })} host={host} />,
    )
    expect(screen.getByText("No games found.")).toBeDefined()
    empty.unmount()

    render(
      <ShiftSurface
        model={model({ catalog: { _tag: "Error", message: "brain offline" } })}
        host={host}
      />,
    )
    expect(screen.getByText("Could not load library.")).toBeDefined()
    expect(screen.getByText("brain offline")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(host.calls).toEqual(["reload"])
  })

  test("Options is silent when the host offers no game actions", () => {
    const host = createFixtureHost()
    render(<ShiftSurface model={model()} host={host} />)

    expect(screen.queryByText("Options")).toBeNull()
    act(() => host.press("options"))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  test("Options opens the host's actions for the focused game", () => {
    const host = createFixtureHost({
      "now-playing:L1": [
        { id: "resume", label: "Continue playing", enabled: true },
        { id: "stop", label: "Stop", enabled: true, destructive: true },
      ],
    })
    render(<ShiftSurface model={model()} host={host} />)

    expect(screen.getByText("Options")).toBeDefined()
    act(() => host.press("options"))

    const sheet = screen.getByRole("dialog")
    expect(sheet.getAttribute("aria-label")).toBe("Actions for Skate 3")
    fireEvent.click(screen.getByRole("button", { name: "Stop" }))
    expect(host.calls).toEqual(["game-action:now-playing:L1:stop"])
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
