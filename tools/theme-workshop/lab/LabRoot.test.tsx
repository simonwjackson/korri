import { afterEach, describe, expect, it, mock } from "bun:test"
import type { RouterHistory } from "@tanstack/history"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { useState } from "react"
import type { DeviceConfig } from "../device-lab"
import { LabRoot, type LabRouteState } from "./LabRoot"
import { __setPartModulesForTest } from "./parts-discovery"
import type { LabSurfaceAdapter } from "./surface-registry"

afterEach(() => {
  __setPartModulesForTest(null)
  window.localStorage.clear()
  cleanup()
})

const devices: readonly DeviceConfig[] = [
  {
    id: "rg353m",
    name: "RG353M",
    widthMm: 72,
    heightMm: 52,
  },
  {
    id: "odin2portal",
    name: "ODIN 2 PORTAL",
    widthMm: 156,
    heightMm: 85,
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
  it("keeps physical calibration controls inside the settings modal", async () => {
    const { adapter } = makeAdapter()

    const view = render(
      <LabRoot
        adapters={[adapter]}
        routeState={{
          devicesSegment: "all",
          themeId: "test",
          surfacePath: "/",
        }}
        navigation={{
          setDevicesSegment: mock(() => undefined),
          setThemeId: mock(() => undefined),
          setSurfacePath: mock(() => undefined),
        }}
      />,
    )

    // Calibration controls live behind the Settings gear, not in the shell.
    await waitFor(() => {
      expect(view.getByRole("button", { name: "Settings" })).toBeTruthy()
    })
    expect(view.queryByText("Scale")).toBeNull()

    fireEvent.click(view.getByRole("button", { name: "Settings" }))

    await waitFor(() => {
      expect(view.getAllByText("Scale").length).toBeGreaterThan(0)
    })
    expect(view.getByRole("button", { name: "+ add device" })).toBeTruthy()
  })

  function renderShell() {
    const { adapter } = makeAdapter()
    return render(
      <LabRoot
        adapters={[adapter]}
        routeState={{
          devicesSegment: "all",
          themeId: "test",
          surfacePath: "/",
        }}
        navigation={{
          setDevicesSegment: mock(() => undefined),
          setThemeId: mock(() => undefined),
          setSurfacePath: mock(() => undefined),
        }}
      />,
    )
  }

  function withNarrowViewport(run: () => Promise<void>): Promise<void> {
    const originalMatchMedia = window.matchMedia
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: mock(() => ({
        matches: true,
        media: "(max-width: 760px), (pointer: coarse)",
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })),
    })
    return run().finally(() => {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia,
      })
    })
  }

  it("defaults to the workspace layout on a wide viewport", async () => {
    const view = renderShell()

    await waitFor(() => {
      expect(
        view.container.querySelector(".pt-shell")?.getAttribute("data-present"),
      ).toBe("workspace")
    })
    expect(view.container.querySelector(".pt-float-host")).toBeTruthy()
    expect(screen.getByLabelText("Surface")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy()
  })

  it("uses the overlay layout on a narrow viewport", async () => {
    await withNarrowViewport(async () => {
      const view = renderShell()

      await waitFor(() => {
        expect(
          view.container
            .querySelector(".pt-shell")
            ?.getAttribute("data-present"),
        ).toBe("overlay")
      })
      expect(view.container.querySelector(".pt-dock-right")).toBeNull()

      fireEvent.click(screen.getByRole("button", { name: "Open lab controls" }))
      await waitFor(() => {
        expect(
          screen.getByRole("dialog", { name: "Lab controls" }),
        ).toBeTruthy()
      })
      expect(screen.getByLabelText("Surface")).toBeTruthy()
      expect(screen.queryByRole("tab", { name: "Surface" })).toBeNull()
      fireEvent.click(screen.getByRole("tab", { name: "Devices" }))
      expect(screen.getByRole("list", { name: "Live devices" })).toBeTruthy()
    })
  })

  it("lets the user switch layout regardless of viewport", async () => {
    const view = renderShell()

    await waitFor(() => {
      expect(
        view.container.querySelector(".pt-shell")?.getAttribute("data-present"),
      ).toBe("workspace")
    })

    fireEvent.click(screen.getByRole("tab", { name: "Overlay" }))

    await waitFor(() => {
      expect(
        view.container.querySelector(".pt-shell")?.getAttribute("data-present"),
      ).toBe("overlay")
    })
    expect(view.container.querySelector(".pt-dock-right")).toBeNull()
    expect(
      screen.getByRole("button", { name: "Open lab controls" }),
    ).toBeTruthy()
  })

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

  it("allows an empty workspace when no devices are selected", async () => {
    const { adapter } = makeAdapter()

    const view = render(
      <LabRoot
        adapters={[adapter]}
        routeState={{
          devicesSegment: "none",
          themeId: "test",
          surfacePath: "/",
        }}
        navigation={{
          setDevicesSegment: mock(() => undefined),
          setThemeId: mock(() => undefined),
          setSurfacePath: mock(() => undefined),
        }}
      />,
    )

    await waitFor(() => {
      expect(
        screen
          .getByRole("button", { name: "RG353M" })
          .getAttribute("aria-pressed"),
      ).toBe("false")
      expect(
        screen
          .getByRole("button", { name: "ODIN 2 PORTAL" })
          .getAttribute("aria-pressed"),
      ).toBe("false")
    })
    expect(view.queryByTestId("surface-rg353m")).toBeNull()
    expect(view.queryByTestId("surface-odin2portal")).toBeNull()
  })

  it("renders discovered parts at /parts in one workspace beside live device frames", async () => {
    const { adapter, mountCounts } = makeAdapter()
    __setPartModulesForTest({
      "/product/surfaces/web/test/ui/Test.atom.part.tsx": {
        default: {
          name: "Test Atom",
          render: () => <div>discovered test atom</div>,
        },
      },
    })

    const view = render(
      <LabRoot
        adapters={[adapter]}
        routeState={{
          devicesSegment: "all",
          themeId: "test",
          surfacePath: "/parts",
        }}
        navigation={{
          setDevicesSegment: mock(() => undefined),
          setThemeId: mock(() => undefined),
          setSurfacePath: mock(() => undefined),
        }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText("discovered test atom")).toBeTruthy()
    })
    expect(screen.queryByRole("tab", { name: "Compose" })).toBeNull()
    expect(screen.queryByRole("tab", { name: "Device" })).toBeNull()
    expect(screen.queryByRole("tab", { name: "Gallery" })).toBeNull()
    expect(screen.queryByRole("tab", { name: "Workshop" })).toBeNull()
    expect(view.queryByTestId("surface-rg353m")).toBeTruthy()
    expect(mountCounts.size).toBeGreaterThan(0)
  })

  it("toggles the Parts panel between visual and list from the titlebar", async () => {
    const { adapter } = makeAdapter()
    __setPartModulesForTest({
      "/product/surfaces/web/test/ui/Test.atom.part.tsx": {
        default: {
          name: "Test Atom",
          render: () => <div>discovered test atom</div>,
        },
      },
    })

    const view = render(
      <LabRoot
        adapters={[adapter]}
        routeState={{
          devicesSegment: "all",
          themeId: "test",
          surfacePath: "/parts",
        }}
        navigation={{
          setDevicesSegment: mock(() => undefined),
          setThemeId: mock(() => undefined),
          setSurfacePath: mock(() => undefined),
        }}
      />,
    )

    // Visual by default: the card grid renders, not the list tree.
    await waitFor(() => {
      expect(view.container.querySelector(".pt-grid")).toBeTruthy()
    })
    expect(
      view.container.querySelector(".pt-tree:not(.pt-device-list)"),
    ).toBeNull()

    fireEvent.click(screen.getByRole("tab", { name: "List" }))

    await waitFor(() => {
      expect(
        view.container.querySelector(".pt-tree:not(.pt-device-list)"),
      ).toBeTruthy()
    })
    expect(view.container.querySelector(".pt-grid")).toBeNull()
  })

  it("places a part from the workspace palette without remounting live devices", async () => {
    const { adapter, mountCounts } = makeAdapter()
    __setPartModulesForTest({
      "/product/surfaces/web/test/ui/Test.atom.part.tsx": {
        default: {
          name: "Test Atom",
          render: () => <div>placed test atom</div>,
        },
      },
    })

    const view = render(
      <LabRoot
        adapters={[adapter]}
        routeState={{
          devicesSegment: "all",
          themeId: "test",
          surfacePath: "/parts",
        }}
        navigation={{
          setDevicesSegment: mock(() => undefined),
          setThemeId: mock(() => undefined),
          setSurfacePath: mock(() => undefined),
        }}
      />,
    )

    await waitFor(() => {
      expect(view.queryByTestId("surface-rg353m")).toBeTruthy()
    })
    const countsBeforePlacement = new Map(mountCounts)

    const card = await screen.findByRole("button", { name: "Open Test Atom" })
    fireEvent.click(card)

    await waitFor(() => {
      expect(
        view.container.querySelector('[data-lab-frame="screen"]'),
      ).toBeTruthy()
    })
    expect(view.queryByTestId("surface-rg353m")).toBeTruthy()
    expect(mountCounts).toEqual(countsBeforePlacement)
  })

  it("shows a direct /parts empty state when a surface has no discovered parts", async () => {
    const { adapter } = makeAdapter()

    render(
      <LabRoot
        adapters={[adapter]}
        routeState={{
          devicesSegment: "all",
          themeId: "test",
          surfacePath: "/parts",
        }}
        navigation={{
          setDevicesSegment: mock(() => undefined),
          setThemeId: mock(() => undefined),
          setSurfacePath: mock(() => undefined),
        }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/No parts discovered for/)).toBeTruthy()
      expect(screen.getByText("Component.atom.part.tsx")).toBeTruthy()
    })
  })
})
