import { afterEach, describe, expect, it, mock } from "bun:test"
import type { RouterHistory } from "@tanstack/history"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import type { DeviceConfig } from "../../device-lab"
import { LabContext, type LabContextValue } from "../Lab.context"
import type { LabSurfaceAdapter } from "../surface-registry"
import { LabScreenView } from "./LabScreenView"

afterEach(() => cleanup())

const device: DeviceConfig = {
  id: "rg353m",
  name: "RG353M",
  widthMm: 72,
  heightMm: 52,
}

function makeAdapter() {
  const mountCounts = { count: 0 }
  const histories: RouterHistory[] = []
  const adapter: LabSurfaceAdapter = {
    id: "test",
    devices: [device],
    screens: [
      { label: "Home", path: "/" },
      { label: "Game Detail", path: "/game/hollow-knight" },
    ],
    makeSeedInitialValues: async () => ({ seed: true }),
    mountSurface: (host, { history }) => {
      if (!history) throw new Error("expected controlled history")
      mountCounts.count += 1
      histories.push(history)
      const marker = document.createElement("div")
      marker.dataset.testid = "mounted-route"
      marker.textContent = history.location.pathname
      host.append(marker)
      const unsubscribe = history.subscribe(({ location }) => {
        marker.textContent = location.pathname
      })
      return { router: {} as never, dispose: () => unsubscribe() }
    },
  }
  return { adapter, mountCounts, histories }
}

function context(adapter: LabSurfaceAdapter): LabContextValue {
  return {
    adapter,
    initialValues: { seed: true },
    themeId: adapter.id,
    surfacePath: "/",
    initialCanvasView: "selection",
    screens: adapter.screens ?? [],
    selection: { kind: "all" },
    devices: [device],
    selectedDevices: [device],
    pxPerMm: 4,
    knobValues: {},
    calibration: {
      setPxPerMm: () => {},
      patchDevice: () => {},
      addDevice: () => {},
      removeDevice: () => {},
      setKnob: () => {},
      reset: () => {},
      storageKey: "test",
    },
    setDevicesSegment: () => {},
    setThemeId: () => {},
    setSurfacePath: () => {},
  }
}

describe("LabScreenView", () => {
  it("mounts the surface at the screen's route on one device", async () => {
    const { adapter, mountCounts } = makeAdapter()
    const view = render(
      <LabContext.Provider value={context(adapter)}>
        <LabScreenView
          screenPath="/game/hollow-knight"
          sourceId="default"
          stateId="ready"
        />
      </LabContext.Provider>,
    )

    await waitFor(() => {
      expect(view.getByTestId("mounted-route").textContent).toBe(
        "/game/hollow-knight",
      )
    })
    expect(mountCounts.count).toBe(1)
  })

  it("re-anchors to a new screen route without remounting the surface", async () => {
    const { adapter, mountCounts } = makeAdapter()
    const view = render(
      <LabContext.Provider value={context(adapter)}>
        <LabScreenView screenPath="/" sourceId="default" stateId="ready" />
      </LabContext.Provider>,
    )

    await waitFor(() => {
      expect(view.getByTestId("mounted-route").textContent).toBe("/")
    })

    view.rerender(
      <LabContext.Provider value={context(adapter)}>
        <LabScreenView
          screenPath="/game/hollow-knight"
          sourceId="default"
          stateId="ready"
        />
      </LabContext.Provider>,
    )

    await waitFor(() => {
      expect(view.getByTestId("mounted-route").textContent).toBe(
        "/game/hollow-knight",
      )
    })
    // Route change pushes history rather than remounting (no second mount).
    expect(mountCounts.count).toBe(1)
  })

  it("falls back to the adapter's device roster when none is selected", async () => {
    const { adapter, mountCounts } = makeAdapter()
    const view = render(
      <LabContext.Provider value={{ ...context(adapter), selectedDevices: [] }}>
        <LabScreenView screenPath="/" sourceId="default" stateId="ready" />
      </LabContext.Provider>,
    )
    await waitFor(() => {
      expect(view.getByTestId("mounted-route")).toBeTruthy()
    })
    expect(mountCounts.count).toBe(1)
  })
})
