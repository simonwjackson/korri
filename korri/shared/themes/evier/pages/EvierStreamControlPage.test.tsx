import { afterEach, describe, expect, it } from "bun:test"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import {
  type EvierStreamControlController,
  EvierStreamControlPage,
} from "./EvierStreamControlPage"

afterEach(() => {
  cleanup()
})

describe("EvierStreamControlPage", () => {
  it("renders as a development theme with separate Moonlight and Gamescope controls", async () => {
    render(<EvierStreamControlPage controller={recordingController()} />)

    expect(screen.getByRole("heading", { name: /evier/i })).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: "Moonlight stream" }),
    ).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: "Gamescope presentation" }),
    ).toBeTruthy()
    expect(
      screen.getByRole("slider", { name: "Moonlight bitrate" }),
    ).toBeTruthy()
    expect(screen.getByRole("slider", { name: "Gamescope FPS" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "FSR" })).toBeTruthy()
    await waitFor(() => expect(screen.getByText(/disabled/)).toBeTruthy())
  })

  it("debounces slider mutations against the Evier RPC controller", async () => {
    const calls: unknown[] = []
    render(<EvierStreamControlPage controller={recordingController(calls)} />)
    await waitFor(() => expect(screen.getByText(/disabled/)).toBeTruthy())

    fireEvent.change(
      screen.getByRole("slider", { name: "Moonlight bitrate" }),
      {
        target: { value: "6000" },
      },
    )
    fireEvent.change(
      screen.getByRole("slider", { name: "Moonlight bitrate" }),
      {
        target: { value: "12000" },
      },
    )

    await act(async () => {
      await Bun.sleep(650)
    })

    expect(calls).toContainEqual({
      method: "setMoonlightBitrate",
      payload: { bitrateKbps: 12_000 },
    })
    expect(
      calls.filter(
        call =>
          typeof call === "object" &&
          call !== null &&
          "method" in call &&
          call.method === "setMoonlightBitrate",
      ),
    ).toHaveLength(1)
  })
})

function recordingController(
  calls: unknown[] = [],
): EvierStreamControlController {
  const record = (method: string) => async (payload: unknown) => {
    calls.push({ method, payload })
    return {
      action: method,
      requested: payload,
      response: { status: "applied" },
    }
  }

  return {
    getState: async () => {
      calls.push({ method: "getState" })
      return {
        moonlight: { status: "disabled" },
        gamescope: { status: "disabled" },
      }
    },
    setMoonlightBitrate: record("setMoonlightBitrate"),
    setMoonlightFps: record("setMoonlightFps"),
    setMoonlightResolution: record("setMoonlightResolution"),
    setGamescopeMode: record("setGamescopeMode"),
    setGamescopeFps: record("setGamescopeFps"),
    setGamescopeFilter: record("setGamescopeFilter"),
    setGamescopeSharpness: record("setGamescopeSharpness"),
  }
}
