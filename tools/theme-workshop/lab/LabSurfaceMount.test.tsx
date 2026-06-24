import { afterEach, describe, expect, it, mock } from "bun:test"
import type { RouterHistory } from "@tanstack/history"
import { cleanup, render, waitFor } from "@testing-library/react"
import type { LabSurfaceAdapter } from "./surface-registry"
import { LabSurfaceMount } from "./LabSurfaceMount"

afterEach(() => cleanup())

describe("LabSurfaceMount", () => {
  it("mounts once, drives route changes without remounting, reports inner navigation once, and disposes", async () => {
    const dispose = mock(() => undefined)
    const onNavigate = mock(() => undefined)
    const histories: RouterHistory[] = []
    const hosts: HTMLElement[] = []

    const adapter: LabSurfaceAdapter<{ readonly seed: true }> = {
      id: "test",
      devices: [],
      makeSeedInitialValues: async () => ({ seed: true }),
      mountSurface: (host, { history }) => {
        if (!history) throw new Error("expected controlled history")
        histories.push(history)
        hosts.push(host)
        const marker = document.createElement("div")
        marker.dataset.testid = "mounted-surface"
        marker.textContent = history.location.pathname
        host.append(marker)
        return { router: {} as never, dispose }
      },
    }

    const mounted = render(
      <LabSurfaceMount
        adapter={adapter}
        initialValues={{ seed: true }}
        surfacePath="/"
        onNavigate={onNavigate}
      />,
    )

    expect(histories).toHaveLength(1)
    expect(histories[0]?.location.pathname).toBe("/")
    expect(mounted.getByTestId("mounted-surface")).toBeTruthy()

    mounted.rerender(
      <LabSurfaceMount
        adapter={adapter}
        initialValues={{ seed: true }}
        surfacePath="/game/hollow-knight"
        onNavigate={onNavigate}
      />,
    )

    expect(histories).toHaveLength(1)
    expect(dispose).toHaveBeenCalledTimes(0)
    expect(histories[0]?.location.pathname).toBe("/game/hollow-knight")
    expect(onNavigate).toHaveBeenCalledTimes(0)

    histories[0]?.push("/game/celeste")

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledTimes(1)
    })
    expect(onNavigate).toHaveBeenLastCalledWith("/game/celeste")

    mounted.rerender(
      <LabSurfaceMount
        adapter={adapter}
        initialValues={{ seed: true }}
        surfacePath="/game/celeste"
        onNavigate={onNavigate}
      />,
    )

    expect(histories).toHaveLength(1)
    expect(onNavigate).toHaveBeenCalledTimes(1)

    mounted.unmount()

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(hosts[0]?.childElementCount).toBe(0)
  })
})
