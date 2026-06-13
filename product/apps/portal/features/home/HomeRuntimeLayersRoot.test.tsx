import { afterEach, describe, expect, it } from "bun:test"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { LibraryListState } from "@platform/library/library-list-state"
import { LibrarySource } from "@platform/library/library-services"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import {
  libraryItemsAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { Effect, Layer } from "effect"
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
  const setSourceLayer = useAtomSet(librarySourceLayerAtom)

  useLayoutEffect(() => {
    setSourceLayer(
      Layer.succeed(LibrarySource)({
        list: () => Effect.sync(() => []),
        listPlayableEntries: () => Effect.sync(getEntries),
        launchSpecFor: () => Effect.succeed(undefined),
        resolveLaunchForGame: id =>
          Effect.fail({
            reason: "unavailable",
            message: `unknown ${id}`,
          } as never),
      }),
    )
  }, [getEntries, setSourceLayer])

  return <>{children}</>
}

function LibraryTitles() {
  const result = useAtomValue(libraryItemsAtom)
  const state = LibraryListState.fromResult(result)
  if (state._tag !== "Ready") return <div>{state._tag}</div>
  return (
    <ul>
      {state.games.map(game => (
        <li key={game.id}>{game.title}</li>
      ))}
    </ul>
  )
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

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type))
    }
  }
}
