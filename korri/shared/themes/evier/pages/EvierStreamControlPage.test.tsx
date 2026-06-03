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
      (
        screen.getByRole("checkbox", {
          name: "Unified stream controls",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true)
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Unified display brightness",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true)
    expect(
      screen.getByRole("heading", { name: "Session controls" }),
    ).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: "Device controls" }),
    ).toBeTruthy()
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

    expect(
      screen.getByRole("heading", { name: "Moonlight stream" }),
    ).toBeTruthy()
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

  it("limits unified FPS to the Moonlight and Gamescope intersection", async () => {
    const calls: unknown[] = []
    render(<EvierStreamControlPage controller={recordingController(calls)} />)
    await waitFor(() => expect(screen.getByText("74%")).toBeTruthy())

    const fps = screen.getByRole("slider", { name: "FPS" })
    expect(fps.getAttribute("max")).toBe("5")

    fireEvent.change(fps, { target: { value: "1" } })
    await act(async () => {
      await Bun.sleep(650)
    })

    expect(calls).toContainEqual({
      method: "setLinkedFps",
      payload: { fps: 45 },
    })
    expect(calls).not.toContainEqual({
      method: "setGamescopeFps",
      payload: { fps: 40 },
    })
  })

  it("does not let a stale refresh overwrite a newer action readback", async () => {
    let resolveStaleRefresh: ((state: unknown) => void) | undefined
    const staleRefresh = new Promise<unknown>(resolve => {
      resolveStaleRefresh = resolve
    })
    const stateQueue: Array<unknown | Promise<unknown>> = [
      stateSnapshot({ bitrateKbps: 12_000 }),
      staleRefresh,
      stateSnapshot({ bitrateKbps: 6_000 }),
    ]
    const controller = recordingController()
    const guardedController: EvierStreamControlController = {
      ...controller,
      getState: async () => {
        const next = stateQueue.shift() ?? stateSnapshot({ bitrateKbps: 6_000 })
        return next instanceof Promise ? await next : next
      },
    }

    render(<EvierStreamControlPage controller={guardedController} />)
    await waitFor(() => expect(screen.getByText("12 Mbps")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
    fireEvent.change(screen.getByRole("slider", { name: "Bitrate" }), {
      target: { value: "6000" },
    })

    await act(async () => {
      await Bun.sleep(650)
    })
    await waitFor(() => expect(screen.getByText("6 Mbps")).toBeTruthy())

    await act(async () => {
      resolveStaleRefresh?.(stateSnapshot({ bitrateKbps: 12_000 }))
      await Bun.sleep(0)
    })

    expect(screen.getByText("6 Mbps")).toBeTruthy()
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

function stateSnapshot({
  bitrateKbps = 12_000,
  fps = 60,
  width = 1920,
  height = 1080,
}: {
  readonly bitrateKbps?: number
  readonly fps?: number
  readonly width?: number
  readonly height?: number
} = {}) {
  return {
    moonlight: {
      status: "ok",
      readback: {
        bitrateKbps,
        fps,
        resolution: { width, height },
      },
    },
    gamescope: {
      status: "ok",
      readback: {
        resolution: { width, height },
        fps,
        sharpness: 10,
        filter: "fsr",
      },
    },
    brightness: {
      status: "ok",
      readback: {
        percent: 50,
        devices: [
          { name: "panel-a", brightness: 102, maxBrightness: 255, percent: 40 },
          {
            name: "panel-b",
            brightness: 2458,
            maxBrightness: 4096,
            percent: 60,
          },
        ],
      },
    },
    battery: {
      status: "ok",
      readback: {
        percent: 74,
        status: "Discharging",
        supplies: [
          {
            name: "battery",
            type: "Battery",
            status: "Discharging",
            capacity: 74,
            online: null,
            voltageNow: null,
            currentNow: null,
            powerNow: null,
            modelName: null,
          },
        ],
      },
    },
  }
}

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
      return stateSnapshot()
    },
    setBrightness: record("setBrightness"),
    setMoonlightBitrate: record("setMoonlightBitrate"),
    setMoonlightFps: record("setMoonlightFps"),
    setMoonlightResolution: record("setMoonlightResolution"),
    setLinkedFps: record("setLinkedFps"),
    setLinkedResolution: record("setLinkedResolution"),
    setGamescopeMode: record("setGamescopeMode"),
    setGamescopeFps: record("setGamescopeFps"),
    setGamescopeFilter: record("setGamescopeFilter"),
    setGamescopeSharpness: record("setGamescopeSharpness"),
  }
}
