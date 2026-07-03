import { afterEach, describe, expect, it } from "bun:test"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { CatalogFactsSource } from "@platform/catalog/catalog-facts-source"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import {
  catalogFactsSourceLayerAtom,
  catalogSnapshotAtom,
} from "@platform/react/catalog/catalog-atoms"
import { deviceStateAtom } from "@platform/react/device/device-atoms"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { Effect, Layer } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { type ReactNode, useLayoutEffect } from "react"
import { HomeRuntimeLayersRoot } from "./HomeRuntimeLayersRoot"

const originalEventSource = globalThis.EventSource
const runtimeWindow = window as Window & {
  __korriRuntimeConfig?: { readonly desktopInput?: boolean }
}
const originalRuntimeConfig = runtimeWindow.__korriRuntimeConfig

afterEach(() => {
  cleanup()
  FakeEventSource.instances.splice(0)
  globalThis.EventSource = originalEventSource
  runtimeWindow.__korriRuntimeConfig = originalRuntimeConfig
})

describe("HomeRuntimeLayersRoot", () => {
  it("updates device state from the current-first device event stream", async () => {
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource

    render(
      <HomeRuntimeLayersRoot>
        <DeviceBatteryPercent />
      </HomeRuntimeLayersRoot>,
    )

    const deviceEvents = FakeEventSource.instances.find(
      instance => instance.url === "/api/device/events",
    )
    expect(deviceEvents).toBeTruthy()

    act(() => {
      deviceEvents?.emit("device.state", {
        state: {
          observedAt: "2026-07-01T00:00:00.000Z",
          battery: {
            _tag: "Ready",
            percent: 72,
            status: "Discharging",
            charging: false,
            supplies: [],
            observedAt: "2026-07-01T00:00:00.000Z",
          },
        },
      })
    })

    await waitFor(() => expect(screen.getByText("72")).toBeTruthy())
  })

  it("refreshes mounted library items when korrid announces a config change", async () => {
    let entries: readonly PlayableLibraryEntry[] = [entry("before", "Before")]
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource
    runtimeWindow.__korriRuntimeConfig = { desktopInput: false }

    render(
      <HomeRuntimeLayersRoot>
        <WithMutableLibrary getEntries={() => entries}>
          <LibraryTitles />
        </WithMutableLibrary>
      </HomeRuntimeLayersRoot>,
    )

    await waitFor(() => expect(screen.getByText("Before")).toBeTruthy())
    expect(FakeEventSource.instances[0]?.url).toBe("/api/config/events")

    entries = [entry("ready", "Ready")]
    act(() => {
      FakeEventSource.instances[0]?.emit("config.ready")
    })

    await waitFor(() => expect(screen.getByText("Ready")).toBeTruthy())

    entries = [entry("ready-ignored", "Ready Ignored")]
    act(() => {
      FakeEventSource.instances[0]?.emit("config.ready")
    })

    expect(screen.queryByText("Ready Ignored")).toBeNull()

    entries = [entry("after", "After")]
    act(() => {
      FakeEventSource.instances[0]?.emit("config.changed")
    })

    await waitFor(() => expect(screen.getByText("After")).toBeTruthy())
  })
})

function WithMutableLibrary({
  children,
  getEntries,
}: {
  readonly children: ReactNode
  readonly getEntries: () => readonly PlayableLibraryEntry[]
}) {
  const setSourceLayer = useAtomSet(catalogFactsSourceLayerAtom)

  useLayoutEffect(() => {
    setSourceLayer(
      Layer.succeed(CatalogFactsSource)({
        snapshot: () => Effect.sync(() => snapshotWith(getEntries())),
      }),
    )
  }, [getEntries, setSourceLayer])

  return <>{children}</>
}

function DeviceBatteryPercent() {
  const state = useAtomValue(deviceStateAtom)
  return (
    <div>{state.battery._tag === "Ready" ? state.battery.percent : "none"}</div>
  )
}

function LibraryTitles() {
  const result = useAtomValue(catalogSnapshotAtom)
  return AsyncResult.matchWithWaiting(result, {
    onWaiting: () => <div>Loading</div>,
    onError: () => <div>LoadError</div>,
    onDefect: () => <div>Defect</div>,
    onSuccess: success => (
      <ul>
        {success.value.entries.map(game => (
          <li key={game.id}>{game.title}</li>
        ))}
      </ul>
    ),
  })
}

function snapshotWith(entries: readonly PlayableLibraryEntry[]) {
  return {
    entries: entries.map(game => ({
      ...game,
      source: {
        hostId: "self",
        controlUrl: "http://127.0.0.1:3001",
        isLocal: true,
      },
    })),
    peers: [
      {
        hostId: "self",
        displayName: "self",
        controlUrl: "http://127.0.0.1:3001",
        isLocal: true,
        caps: ["source"],
        status: "ready" as const,
        entryCount: entries.length,
        updatedAt: "2026-06-13T00:00:00.000Z",
      },
    ],
    generation: 1,
    updatedAt: "2026-06-13T00:00:00.000Z",
    health: {
      coordinatorReachable: true,
      self: "ready" as const,
      loadingPeers: 0,
      readyPeers: 0,
      failedPeers: 0,
      generation: 1,
    },
  }
}

function entry(id: string, title: string): PlayableLibraryEntry {
  return {
    id,
    itemId: id,
    title,
    releases: [{ id: "default", system: "test", launchable: true }],
    launchable: true,
  }
}

class FakeEventSource {
  static readonly instances: FakeEventSource[] = []
  readonly listeners = new Map<string, Set<EventListener>>()
  closed = false

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener)
  }

  close() {
    this.closed = true
  }

  emit(type: string, data?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data: JSON.stringify(data ?? {}) }))
    }
  }
}
