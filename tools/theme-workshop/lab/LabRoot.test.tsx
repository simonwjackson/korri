import { afterEach, describe, expect, it, mock } from "bun:test"
import type { RouterHistory } from "@tanstack/history"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { useState } from "react"
import type { DeviceConfig } from "../device-lab"
import { LabRoot, type LabRouteState } from "./LabRoot"
import type { LabSurfaceAdapter } from "./surface-registry"

afterEach(() => cleanup())

const devices: readonly DeviceConfig[] = [
  {
    id: "rg353m",
    name: "RG353M",
    widthMm: 72,
    heightMm: 52,
    textPct: 100,
    padPct: 100,
  },
  {
    id: "odin2portal",
    name: "ODIN 2 PORTAL",
    widthMm: 156,
    heightMm: 85,
    textPct: 100,
    padPct: 100,
  },
]

function makeAdapter() {
  const dispose = mock((host: HTMLElement) => host.replaceChildren())
  const histories = new Map<string, RouterHistory>()
  const mountCounts = new Map<string, number>()

  const adapter: LabSurfaceAdapter = {
    id: "test",
    devices,
    makeSeedInitialValues: async () => ({ seed: true }),
    mountSurface: (host, { history }) => {
      if (!history) throw new Error("expected controlled history")
      const deviceId = host
        .closest("[data-lab-device-id]")
        ?.getAttribute("data-lab-device-id")
      if (!deviceId) throw new Error("expected device wrapper")
      histories.set(deviceId, history)
      mountCounts.set(deviceId, (mountCounts.get(deviceId) ?? 0) + 1)

      const marker = document.createElement("div")
      marker.dataset.testid = `surface-${deviceId}`
      marker.textContent = history.location.pathname
      host.append(marker)
      const unsubscribe = history.subscribe(({ location }) => {
        marker.textContent = location.pathname
      })

      return {
        router: {} as never,
        dispose: () => {
          unsubscribe()
          dispose(host)
        },
      }
    },
  }

  return { adapter, histories, mountCounts, dispose }
}

describe("LabRoot", () => {
  it("renders selected real-surface frames and mirrors navigation from one frame to all frames", async () => {
    const { adapter, histories, mountCounts } = makeAdapter()
    const surfaceWrites: string[] = []

    function Harness() {
      const [state, setState] = useState<LabRouteState>({
        devicesSegment: "rg353m,odin2portal",
        themeId: "test",
        surfacePath: "/",
      })
      return (
        <LabRoot
          adapters={[adapter]}
          routeState={state}
          navigation={{
            setDevicesSegment: devicesSegment =>
              setState(prev => ({ ...prev, devicesSegment })),
            setThemeId: themeId => setState(prev => ({ ...prev, themeId })),
            setSurfacePath: surfacePath => {
              surfaceWrites.push(surfacePath)
              setState(prev => ({ ...prev, surfacePath }))
            },
          }}
        />
      )
    }

    const view = render(<Harness />)

    await waitFor(() => {
      expect(view.getByTestId("surface-rg353m").textContent).toBe("/")
      expect(view.getByTestId("surface-odin2portal").textContent).toBe("/")
    })

    act(() => {
      histories.get("rg353m")?.push("/game/hollow-knight")
    })

    await waitFor(() => {
      expect(view.getByTestId("surface-rg353m").textContent).toBe(
        "/game/hollow-knight",
      )
      expect(view.getByTestId("surface-odin2portal").textContent).toBe(
        "/game/hollow-knight",
      )
    })

    expect(surfaceWrites).toEqual(["/game/hollow-knight"])
    expect(mountCounts.get("rg353m")).toBe(1)
    expect(mountCounts.get("odin2portal")).toBe(1)
  })

  it("unmounts only removed device frames and keeps surviving frames mounted", async () => {
    const { adapter, mountCounts, dispose } = makeAdapter()
    const noopNavigation = {
      setDevicesSegment: mock(() => undefined),
      setThemeId: mock(() => undefined),
      setSurfacePath: mock(() => undefined),
    }

    const view = render(
      <LabRoot
        adapters={[adapter]}
        routeState={{
          devicesSegment: "rg353m,odin2portal",
          themeId: "test",
          surfacePath: "/",
        }}
        navigation={noopNavigation}
      />,
    )

    await waitFor(() => {
      expect(view.getByTestId("surface-rg353m")).toBeTruthy()
      expect(view.getByTestId("surface-odin2portal")).toBeTruthy()
    })

    view.rerender(
      <LabRoot
        adapters={[adapter]}
        routeState={{
          devicesSegment: "rg353m",
          themeId: "test",
          surfacePath: "/",
        }}
        navigation={noopNavigation}
      />,
    )

    await waitFor(() => {
      expect(view.queryByTestId("surface-odin2portal")).toBeNull()
    })

    expect(view.getByTestId("surface-rg353m")).toBeTruthy()
    expect(mountCounts.get("rg353m")).toBe(1)
    expect(mountCounts.get("odin2portal")).toBe(1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it("coerces an empty device selection back to all devices", async () => {
    const { adapter } = makeAdapter()

    const view = render(
      <LabRoot
        adapters={[adapter]}
        routeState={{ devicesSegment: "", themeId: "test", surfacePath: "/" }}
        navigation={{
          setDevicesSegment: mock(() => undefined),
          setThemeId: mock(() => undefined),
          setSurfacePath: mock(() => undefined),
        }}
      />,
    )

    await waitFor(() => {
      expect(view.getByTestId("surface-rg353m")).toBeTruthy()
      expect(view.getByTestId("surface-odin2portal")).toBeTruthy()
    })
  })
})
