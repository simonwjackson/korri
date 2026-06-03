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
  it("defaults to unified stream controls and unified display brightness", async () => {
    render(<EvierStreamControlPage controller={recordingController()} />)

    expect(
      (screen.getByRole("checkbox", {
        name: "Unified stream controls",
      }) as HTMLInputElement).checked,
    ).toBe(true)
    expect(
      (screen.getByRole("checkbox", {
        name: "Unified display brightness",
      }) as HTMLInputElement).checked,
    ).toBe(true)
    expect(screen.getByRole("heading", { name: "Session controls" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Device controls" })).toBeTruthy()
    expect(screen.getByRole("slider", { name: "Bitrate" })).toBeTruthy()
    expect(screen.getByRole("slider", { name: "FPS" })).toBeTruthy()
    expect(screen.getByRole("slider", { name: "Resolution" })).toBeTruthy()
    expect(screen.getByRole("slider", { name: "Sharpness" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "FSR" })).toBeTruthy()
    expect(
      screen.getByRole("slider", { name: "Display brightness" }),
    ).toBeTruthy()
    expect(screen.queryByText("Moonlight stream")).toBeNull()
    expect(screen.queryByText("Gamescope presentation")).toBeNull()
    expect(screen.getByLabelText("Battery status")).toBeTruthy()
    await waitFor(() => expect(screen.getByText("74%")).toBeTruthy())
  })

  it("can split stream controls without affecting unified brightness", async () => {
    render(<EvierStreamControlPage controller={recordingController()} />)
    await waitFor(() => expect(screen.getByText("74%")).toBeTruthy())

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Unified stream controls" }),
    )

    expect(screen.getByRole("heading", { name: "Moonlight stream" })).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: "Gamescope presentation" }),
    ).toBeTruthy()
    expect(screen.getByRole("slider", { name: "Moonlight FPS" })).toBeTruthy()
    expect(
      screen.getByRole("slider", { name: "Gamescope FPS cap" }),
    ).toBeTruthy()
    expect(
      screen.getByRole("slider", { name: "Display brightness" }),
    ).toBeTruthy()
  })

  it("splits display brightness per screen independently of stream mode", async () => {
    const calls: unknown[] = []
    render(<EvierStreamControlPage controller={recordingController(calls)} />)
    await waitFor(() => expect(screen.getByText(/panel-a/)).toBeTruthy())

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Unified display brightness" }),
    )

    expect(
      screen.getByRole("slider", { name: "Display 1 brightness" }),
    ).toBeTruthy()
    expect(
      screen.getByRole("slider", { name: "Display 2 brightness" }),
    ).toBeTruthy()
    expect(screen.getByRole("slider", { name: "FPS" })).toBeTruthy()
    expect(screen.queryByRole("slider", { name: "Moonlight FPS" })).toBeNull()

    fireEvent.change(
      screen.getByRole("slider", { name: "Display 2 brightness" }),
      { target: { value: "70" } },
    )
    await act(async () => {
      await Bun.sleep(650)
    })

    expect(calls).toContainEqual({
      method: "setBrightness",
      payload: { percent: 70, device: "panel-b" },
    })
  })

  it("debounces slider mutations against the Evier RPC controller", async () => {
    const calls: unknown[] = []
    render(<EvierStreamControlPage controller={recordingController(calls)} />)
    await waitFor(() => expect(screen.getByText(/panel-a/)).toBeTruthy())

    fireEvent.change(screen.getByRole("slider", { name: "Bitrate" }), {
      target: { value: "6000" },
    })

    await act(async () => {
      await Bun.sleep(650)
    })

    expect(calls).toContainEqual({
      method: "setMoonlightBitrate",
      payload: { bitrateKbps: 6_000 },
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
        moonlight: {
          status: "ok",
          response: {
            result: {
              streamQuality: {
                bitrateKbps: 12_000,
                fps: 60,
                width: 1920,
                height: 1080,
              },
              runtimeSettings: {
                appliedBitrateKbps: 12_000,
                appliedFps: 60,
                appliedResolution: { width: 1920, height: 1080 },
              },
            },
          },
        },
        gamescope: {
          status: "ok",
          response: {
            result: {
              xwaylandMode: { width: 1920, height: 1080 },
              fps: 60,
              sharpness: 10,
              filter: "fsr",
            },
          },
        },
        brightness: {
          status: "ok",
          response: {
            percent: 50,
            devices: [
              { name: "panel-a", percent: 40 },
              { name: "panel-b", percent: 60 },
            ],
          },
        },
        battery: {
          status: "ok",
          response: {
            percent: 74,
            status: "Discharging",
            supplies: [{ name: "battery", type: "Battery", capacity: 74 }],
          },
        },
      }
    },
    setBrightness: record("setBrightness"),
    setMoonlightBitrate: record("setMoonlightBitrate"),
    setMoonlightFps: record("setMoonlightFps"),
    setMoonlightResolution: record("setMoonlightResolution"),
    setGamescopeMode: record("setGamescopeMode"),
    setGamescopeFps: record("setGamescopeFps"),
    setGamescopeFilter: record("setGamescopeFilter"),
    setGamescopeSharpness: record("setGamescopeSharpness"),
  }
}
