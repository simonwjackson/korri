import { afterEach, describe, expect, it } from "bun:test"
import type { DualScreenChannelFactory } from "@platform/react/display/dual-screen/DualScreenBroadcastSessionRoot"
import type { RouterHistory } from "@tanstack/history"
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react"
import type { DeviceConfig } from "../../device-lab"
import { LabContext, type LabContextValue } from "../Lab.context"
import type {
  LabSurfaceAdapter,
  LabSurfaceDualScreenOptions,
} from "../surface-registry"
import { LabCanvasDevice } from "./LabCanvasDevice"

type BroadcastListener = (event: MessageEvent) => void

class TestBroadcastChannel {
  static channels = new Map<string, Set<TestBroadcastChannel>>()

  readonly name: string
  private readonly listeners = new Set<BroadcastListener>()

  constructor(name: string) {
    this.name = name
    const peers = TestBroadcastChannel.channels.get(name) ?? new Set()
    peers.add(this)
    TestBroadcastChannel.channels.set(name, peers)
  }

  postMessage(message: unknown) {
    for (const peer of TestBroadcastChannel.channels.get(this.name) ?? []) {
      if (peer === this) continue
      for (const listener of peer.listeners) {
        queueMicrotask(() =>
          listener(new MessageEvent("message", { data: message })),
        )
      }
    }
  }

  close() {
    TestBroadcastChannel.channels.get(this.name)?.delete(this)
    this.listeners.clear()
  }

  addEventListener(type: "message", listener: BroadcastListener) {
    if (type === "message") this.listeners.add(listener)
  }

  removeEventListener(type: "message", listener: BroadcastListener) {
    if (type === "message") this.listeners.delete(listener)
  }
}

afterEach(() => {
  cleanup()
  TestBroadcastChannel.channels.clear()
})

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
    secondaryScreenPath: "/adapter-secondary",
    makeSeedInitialValues: async () => ({ seed: true }),
    mountSurface: (host, { history, dualScreen }) => {
      if (!history) throw new Error("expected controlled history")
      mounts.push({ path: history.location.pathname, dualScreen })
      const marker = document.createElement("div")
      marker.dataset.testid = "mounted-route"
      marker.textContent = `${history.location.pathname}:${dualScreen?.role ?? "none"}`
      host.append(marker)
      const unsubscribe = (history as RouterHistory).subscribe(
        ({ location }) => {
          marker.textContent = `${location.pathname}:${dualScreen?.role ?? "none"}`
        },
      )
      return { router: {} as never, dispose: () => unsubscribe() }
    },
  }
  return { adapter, mounts }
}

function makeSharedSessionAdapter(): LabSurfaceAdapter {
  const createDualScreenChannel = createTestChannelFactory()
  return {
    id: "shift",
    devices: [thor],
    secondaryScreenPath: "/companion",
    createDualScreenChannel,
    makeSeedInitialValues: async () => ({ seed: true }),
    mountSurface: (host, { history, dualScreen }) => {
      if (!dualScreen) return { router: {} as never, dispose: () => {} }
      if (!dualScreen.createChannel)
        throw new Error("expected injected dual-screen channel factory")
      const channel = dualScreen.createChannel(dualScreen.channelName)
      const path = history?.location.pathname ?? "/"
      const dispose =
        path === "/companion"
          ? mountCompanionProbe(host, channel)
          : mountPrimaryProbe(host, channel)
      return { router: {} as never, dispose }
    },
  }
}

function createTestChannelFactory(): DualScreenChannelFactory {
  return name => new TestBroadcastChannel(name)
}

function mountPrimaryProbe(
  host: HTMLElement,
  channel: ReturnType<DualScreenChannelFactory>,
) {
  let selectedGameId = "hollow-knight"
  let revision = 1
  const revisionSourceId = "primary:lab-probe"
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = "Celeste"
  const snapshot = () =>
    channel.postMessage({
      _tag: "SelectionSnapshot",
      selectedGameId,
      lastSource: "primary",
      source: "primary",
      revision,
      revisionSourceId,
    })
  const receive = (event: MessageEvent) => {
    if (event.data?._tag === "SelectionRequested") snapshot()
  }
  const focusCeleste = () => {
    selectedGameId = "celeste"
    revision += 1
    channel.postMessage({
      _tag: "GameFocused",
      gameId: selectedGameId,
      source: "primary",
      revision,
      revisionSourceId,
    })
  }
  button.addEventListener("focus", focusCeleste)
  channel.addEventListener("message", receive)
  host.append(button)
  queueMicrotask(snapshot)
  return () => {
    button.removeEventListener("focus", focusCeleste)
    channel.removeEventListener("message", receive)
    channel.close()
  }
}

function mountCompanionProbe(
  host: HTMLElement,
  channel: ReturnType<DualScreenChannelFactory>,
) {
  const heading = document.createElement("h1")
  heading.textContent = "Waiting"
  const receive = (event: MessageEvent) => {
    if (
      event.data?._tag !== "GameFocused" &&
      event.data?._tag !== "SelectionSnapshot"
    )
      return
    const selectedGameId =
      event.data._tag === "GameFocused"
        ? event.data.gameId
        : event.data.selectedGameId
    heading.textContent =
      selectedGameId === "celeste"
        ? "Celeste"
        : selectedGameId === "hollow-knight"
          ? "Hollow Knight"
          : "Waiting"
  }
  channel.addEventListener("message", receive)
  host.append(heading)
  channel.postMessage({ _tag: "SelectionRequested", requester: "companion" })
  return () => {
    channel.removeEventListener("message", receive)
    channel.close()
  }
}

function context(
  adapter: LabSurfaceAdapter,
  initialValues: unknown = { seed: true },
): LabContextValue {
  return {
    adapter,
    initialValues,
    themeId: adapter.id,
    surfacePath: "/",
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

function makeInspectableAdapter() {
  let clicks = 0
  const adapter: LabSurfaceAdapter = {
    id: "shift",
    devices: [thor],
    makeSeedInitialValues: async () => ({ seed: true }),
    mountSurface: host => {
      const molecule = document.createElement("section")
      molecule.setAttribute("data-korri-part", "shift.status-bar")
      molecule.setAttribute("data-korri-layer", "molecule")
      molecule.setAttribute("data-korri-name", "Status Bar")
      const atom = document.createElement("button")
      atom.type = "button"
      atom.textContent = "Battery"
      atom.setAttribute("data-korri-part", "shift.battery")
      atom.setAttribute("data-korri-layer", "atom")
      atom.setAttribute("data-korri-name", "Battery")
      atom.addEventListener("click", () => {
        clicks += 1
      })
      molecule.append(atom)
      host.append(molecule)
      return { router: {} as never, dispose: () => {} }
    },
  }
  return { adapter, clicks: () => clicks }
}

function renderLiveDevice({
  adapter,
  sourceId = "default",
  stateId = "ready",
  pickMode = false,
  onInnerSelect = () => undefined,
}: {
  readonly adapter: LabSurfaceAdapter
  readonly sourceId?: string
  readonly stateId?: string
  readonly pickMode?: boolean
  readonly onInnerSelect?: Parameters<
    typeof LabCanvasDevice
  >[0]["onInnerSelect"]
}) {
  return (
    <LabContext.Provider value={context(adapter)}>
      <LabCanvasDevice
        object={{
          kind: "live-device",
          id: "live-thor",
          deviceId: "thor",
          inputValues: {},
        }}
        scale={1}
        selected={false}
        sourceId={sourceId}
        stateId={stateId}
        pickMode={pickMode}
        innerSelection={null}
        onSelect={() => undefined}
        onInnerSelect={onInnerSelect}
        onMove={() => undefined}
        onMeasure={() => undefined}
      />
    </LabContext.Provider>
  )
}

describe("LabCanvasDevice", () => {
  it("mounts Thor primary and companion screens with one scoped dual-screen channel", async () => {
    const { adapter, mounts } = makeAdapter()

    render(renderLiveDevice({ adapter }))

    await waitFor(() => {
      expect(mounts.some(mount => mount.path === "/")).toBe(true)
      expect(mounts.some(mount => mount.path === "/adapter-secondary")).toBe(
        true,
      )
    })

    const primaryMount = mounts.find(mount => mount.path === "/")
    const companionMount = mounts.find(
      mount => mount.path === "/adapter-secondary",
    )
    expect(primaryMount?.dualScreen?.role).toBe("primary")
    expect(companionMount?.dualScreen?.role).toBe("companion")
    expect(primaryMount?.dualScreen?.channelName).toBe(
      companionMount?.dualScreen?.channelName,
    )
    expect(primaryMount?.dualScreen?.channelName.startsWith("lab:")).toBe(true)
    expect(primaryMount?.dualScreen?.channelName.endsWith(":shift:thor")).toBe(
      true,
    )

    expect(mounts).not.toContainEqual({
      path: "/game/hollow-knight",
      dualScreen: undefined,
    })
  })

  it("does not remount default-seed adapters when source state changes", async () => {
    const { adapter, mounts } = makeAdapter()
    const view = render(renderLiveDevice({ adapter }))

    await waitFor(() => {
      expect(mounts.filter(mount => mount.path === "/").length).toBe(1)
      expect(
        mounts.filter(mount => mount.path === "/adapter-secondary").length,
      ).toBe(1)
    })

    view.rerender(
      renderLiveDevice({
        adapter,
        sourceId: "alternate",
        stateId: "loading",
      }),
    )

    await waitFor(() => {
      expect(mounts.filter(mount => mount.path === "/").length).toBe(1)
      expect(
        mounts.filter(mount => mount.path === "/adapter-secondary").length,
      ).toBe(1)
    })
  })

  it("uses a different dual-screen channel for each lab view", async () => {
    const { adapter, mounts } = makeAdapter()

    render(
      <>
        {renderLiveDevice({ adapter })}
        {renderLiveDevice({ adapter })}
      </>,
    )

    await waitFor(() => {
      expect(mounts.filter(mount => mount.path === "/").length).toBe(2)
    })

    const channelNames = mounts
      .filter(mount => mount.path === "/")
      .map(mount => mount.dualScreen?.channelName)
    expect(channelNames[0]).toBeTruthy()
    expect(channelNames[1]).toBeTruthy()
    expect(channelNames[0]).not.toBe(channelNames[1])
  })

  it("lets a product-session companion follow primary focus through lab wiring", async () => {
    const adapter = makeSharedSessionAdapter()
    const { container } = render(renderLiveDevice({ adapter }))

    const secondary = await waitFor(() => {
      const node = container.querySelector<HTMLElement>(
        '[data-lab-device-id="thor"] [data-lab-screen-role="secondary"]',
      )
      expect(node).toBeTruthy()
      return node as HTMLElement
    })
    const primary = container.querySelector<HTMLElement>(
      '[data-lab-device-id="thor"] [data-lab-screen-role="primary"]',
    )
    expect(primary).toBeTruthy()

    await waitFor(() => {
      expect(
        within(secondary).getByRole("heading", { name: "Hollow Knight" }),
      ).toBeTruthy()
    })

    fireEvent.focus(
      within(primary as HTMLElement).getByRole("button", { name: "Celeste" }),
    )

    await waitFor(() => {
      expect(
        within(secondary).getByRole("heading", { name: "Celeste" }),
      ).toBeTruthy()
    })
  })

  it("selects a named preview part in pick mode without running the app click", async () => {
    const { adapter, clicks } = makeInspectableAdapter()
    const selectedNames: string[] = []

    render(
      renderLiveDevice({
        adapter,
        pickMode: true,
        onInnerSelect: selection => {
          const name = selection?.targets[0]?.name
          if (name) selectedNames.push(name)
        },
      }),
    )

    const button = await waitFor(() =>
      document.querySelector<HTMLButtonElement>(
        '[data-korri-part="shift.battery"]',
      ),
    )
    expect(button).toBeTruthy()

    fireEvent.pointerDown(button as HTMLButtonElement)
    fireEvent.click(button as HTMLButtonElement)

    expect(selectedNames).toContain("Battery")
    expect(clicks()).toBe(0)
  })
})
