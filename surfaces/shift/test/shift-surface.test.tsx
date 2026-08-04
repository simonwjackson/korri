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

  test("setup actions do not pollute the game rail", () => {
    render(<ShiftSurface model={model()} host={createFixtureHost()} />)

    expect(screen.queryByRole("button", { name: "Pair a device" })).toBeNull()
    expect(screen.getByRole("button", { name: "Settings" })).toBeDefined()
  })

  test("confirming a tile asks the host to launch that game", () => {
    const host = createFixtureHost()
    render(<ShiftSurface model={model()} host={host} />)

    // The first tile is focused at mount, so a single activation launches it.
    fireEvent.click(screen.getByRole("button", { name: "Skate 3" }))
    expect(host.calls).toEqual(["launch:now-playing:L1"])
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
      <ShiftSurface
        model={model({ catalog: { _tag: "Empty" }, settings: [] })}
        host={host}
      />,
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

describe("Shift library", () => {
  const openLibrary = () => {
    const cap = screen.getByRole("button", { name: "Library" })
    fireEvent.focus(cap)
    fireEvent.click(cap)
  }

  test("restores the original browse-everything destination", () => {
    const { container } = render(
      <ShiftSurface model={model()} host={createFixtureHost()} />,
    )

    openLibrary()

    expect(container.querySelector("[data-shift-library]")).toBeDefined()
    expect(screen.getByRole("heading", { name: "Library" })).toBeDefined()
    expect(screen.getByText("3 games")).toBeDefined()
    expect(
      screen.getAllByRole("button").map(button => button.getAttribute("aria-label")),
    ).toEqual(["Skate 3", "Wario Land 4", "Neverball"])
  })

  test("launches the selected Korri game from Home's feedback context", () => {
    const host = createFixtureHost()
    const { container } = render(<ShiftSurface model={model()} host={host} />)
    openLibrary()

    fireEvent.click(screen.getByRole("button", { name: "Wario Land 4" }))

    expect(host.calls).toEqual(["launch:local-game:wl4"])
    expect(container.querySelector("[data-shift-library]")).toBeNull()
  })

  test("Back returns to Home without calling the host", () => {
    const host = createFixtureHost()
    const { container } = render(<ShiftSurface model={model()} host={host} />)
    openLibrary()

    act(() => host.press("back"))

    expect(container.querySelector("[data-shift-library]")).toBeNull()
    expect(screen.getByRole("button", { name: "Library" })).toBeDefined()
    expect(host.calls).toEqual([])
  })
})

describe("Shift settings", () => {
  const openSettings = () => {
    const cap = screen.getByRole("button", { name: "Settings" })
    fireEvent.focus(cap)
    fireEvent.click(cap)
  }

  test("the rail offers Settings once Korri has facts to state", () => {
    render(<ShiftSurface model={model()} host={createFixtureHost()} />)

    expect(screen.getByRole("button", { name: "Settings" })).toBeDefined()
  })

  test("Settings stays reachable when plugin choices leave no games", () => {
    render(
      <ShiftSurface
        model={model({ catalog: { _tag: "Empty" } })}
        host={createFixtureHost()}
      />,
    )

    expect(screen.getByRole("button", { name: "Settings" })).toBeDefined()
  })

  test("no Settings destination when Korri can state nothing", () => {
    // A surface must not advertise a screen that would open empty.
    render(
      <ShiftSurface model={model({ settings: [] })} host={createFixtureHost()} />,
    )

    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull()
  })

  test("opening settings is Shift's own business, not a host action", () => {
    const host = createFixtureHost()
    render(<ShiftSurface model={model()} host={host} />)

    openSettings()

    // Korri never hears about it: which screens exist is the surface's call.
    expect(host.calls).toEqual([])
    expect(screen.getByText("This device")).toBeDefined()
  })

  test("settings shows each group's facts as label and value", () => {
    render(<ShiftSurface model={model()} host={createFixtureHost()} />)
    openSettings()

    expect(screen.getByText("Software")).toBeDefined()
    expect(screen.getByText("korrid 0.4.1")).toBeDefined()
    expect(screen.getByText("File access")).toBeDefined()
    expect(screen.getByText("Granted")).toBeDefined()
  })

  test("only settings backed by a real interaction become buttons", () => {
    const { container } = render(
      <ShiftSurface model={model()} host={createFixtureHost()} />,
    )
    openSettings()

    expect(container.querySelectorAll("button.shift-setting-row").length).toBe(3)
    expect(container.querySelectorAll("div.shift-setting-row").length).toBe(2)
  })

  test("an actionable row advertises Select and Back", () => {
    const { container } = render(
      <ShiftSurface model={model()} host={createFixtureHost()} />,
    )
    openSettings()

    const hints = Array.from(
      container.querySelectorAll(".shift-cine-hint"),
    ).map(hint => hint.textContent)
    expect(hints).toEqual(["ASelect", "BBack"])
  })

  test("text editing saves through the side sheet", () => {
    const host = createFixtureHost()
    render(<ShiftSurface model={model()} host={host} />)
    openSettings()

    fireEvent.click(screen.getByRole("button", { name: "Name: usu" }))
    const input = screen.getByRole("textbox", { name: "Name" })
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: "pocket" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(host.calls).toEqual(["setting:device-name:pocket"])
  })

  test("a background refresh does not erase an unfinished text edit", () => {
    const host = createFixtureHost()
    const rendered = render(<ShiftSurface model={model()} host={host} />)
    openSettings()
    fireEvent.click(screen.getByRole("button", { name: "Name: usu" }))
    const input = screen.getByRole("textbox", { name: "Name" })
    fireEvent.change(input, { target: { value: "unfinished" } })

    rendered.rerender(<ShiftSurface model={model()} host={host} />)

    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Name" }).value)
      .toBe("unfinished")
  })

  test("a choice opens the side sheet and publishes the chosen value", () => {
    const host = createFixtureHost()
    render(<ShiftSurface model={model()} host={host} />)
    openSettings()

    fireEvent.click(screen.getByRole("button", { name: "mGBA: On" }))
    fireEvent.click(screen.getByRole("button", { name: "Off" }))

    expect(host.calls).toEqual(["setting:@korri:mgba:false"])
  })

  test("an Android-owned row runs its native action", () => {
    const host = createFixtureHost()
    render(<ShiftSurface model={model()} host={host} />)
    openSettings()

    fireEvent.click(screen.getByRole("button", { name: "File access: Granted" }))

    expect(host.calls).toEqual(["action:storage-access"])
  })

  test("back returns to the games without touching the host", () => {
    const host = createFixtureHost()
    render(<ShiftSurface model={model()} host={host} />)
    openSettings()

    act(() => host.press("back"))

    expect(screen.getByRole("button", { name: "Wario Land 4" })).toBeDefined()
    expect(host.calls).toEqual([])
  })
})
