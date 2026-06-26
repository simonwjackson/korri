import { afterEach, describe, expect, it } from "bun:test"
import type { RouterHistory } from "@tanstack/history"
import { cleanup, render, waitFor } from "@testing-library/react"
import type { DeviceConfig } from "../../device-lab"
import { LabContext, type LabContextValue } from "../Lab.context"
import type {
  LabSurfaceAdapter,
  LabSurfaceDualScreenOptions,
} from "../surface-registry"
import { LabSurfaceView } from "./LabSurfaceView"

afterEach(() => cleanup())

const thor: DeviceConfig = {
  id: "thor",
  name: "THOR",
  widthMm: 132,
  heightMm: 76,
  screens: [
    { id: "thor-top", widthMm: 132, heightMm: 76, role: "primary" },
    {
      id: "thor-bottom",
      widthMm: 110,
      heightMm: 62,
      role: "secondary",
      placement: "below",
    },
  ],
}

function makeAdapter() {
  const mounts: {
    readonly path: string
    readonly dualScreen: LabSurfaceDualScreenOptions | undefined
  }[] = []
  const adapter: LabSurfaceAdapter = {
    id: "shift",
    devices: [thor],
    makeSeedInitialValues: async () => ({ seed: true }),
    mountSurface: (host, { history, dualScreen }) => {
      if (!history) throw new Error("expected controlled history")
      mounts.push({ path: history.location.pathname, dualScreen })
      const marker = document.createElement("div")
      marker.dataset.testid = "mounted-route"
      marker.textContent = `${history.location.pathname}:${dualScreen?.role ?? "none"}`
      host.append(marker)
      const unsubscribe = (history as RouterHistory).subscribe(({ location }) => {
        marker.textContent = `${location.pathname}:${dualScreen?.role ?? "none"}`
      })
      return { router: {} as never, dispose: () => unsubscribe() }
    },
  }
  return { adapter, mounts }
}

function context(adapter: LabSurfaceAdapter): LabContextValue {
  return {
    adapter,
    initialValues: { seed: true },
    themeId: adapter.id,
    surfacePath: "/",
    initialCanvasView: "surface",
    screens: adapter.screens ?? [],
    selection: { kind: "set", ids: ["thor"] },
    devices: [thor],
    selectedDevices: [thor],
    pxPerMm: 1,
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

describe("LabSurfaceView", () => {
  it("mounts Thor primary and companion screens with one scoped dual-screen channel", async () => {
    const { adapter, mounts } = makeAdapter()

    render(
      <LabContext.Provider value={context(adapter)}>
        <LabSurfaceView sourceId="default" stateId="ready" />
      </LabContext.Provider>,
    )

    await waitFor(() => {
      expect(mounts).toContainEqual({
        path: "/",
        dualScreen: { role: "primary", channelName: "lab:shift:thor" },
      })
      expect(mounts).toContainEqual({
        path: "/companion",
        dualScreen: { role: "companion", channelName: "lab:shift:thor" },
      })
    })

    expect(mounts).not.toContainEqual({
      path: "/game/hollow-knight",
      dualScreen: undefined,
    })
  })
})
