import { afterEach, describe, expect, mock, test } from "bun:test"
import * as React from "react"
import * as ReactJsxRuntime from "react/jsx-runtime"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { SHELL_RESUMED_EVENT } from "@contracts/bridge/korri-native-bridge"
import type {
  BackgroundNoticeResult,
  LaunchLocalResult,
  LocalLaunchSpec,
  QueryStreamAppsResult,
  QueryStreamHostsResult,
  StartStreamResult,
  StorageAccessResult,
  StreamHost,
} from "@contracts/bridge/korri-native-bridge"
import type {
  CatalogSnapshotOutcome,
  Game,
  HealthOutcome,
  LocalGame,
  LocalGameLaunchOutcome,
  LocalGamesListOutcome,
  SessionPrepareOutcome,
  SessionStatusOutcome,
  SessionStopOutcome,
  SettingsSnapshotOutcome,
  SettingsUpdateOutcome,
} from "@contracts/generated/korrid"
import { SessionStopPhase } from "@contracts/generated/korrid"
import { createInputBus, type InputBus } from "../input/bus"
import { createSpatialFocusController } from "../input/spatial-focus"
import type { LauncherBridge } from "../bridge/launcher-bridge"
import type { KorridClient } from "../korrid/client"
// The portal compiles Shift from source, but Bun resolves Shift's peer React
// from the surface package once its dependencies are installed. Keep this
// cross-boundary test on one React instance without replacing Shift itself.
const shiftReact = new URL(
  "../../../../surfaces/shift/node_modules/react/index.js",
  import.meta.url,
).pathname
const shiftJsxRuntime = new URL(
  "../../../../surfaces/shift/node_modules/react/jsx-runtime.js",
  import.meta.url,
).pathname

mock.module("react", () => React)
mock.module("react/jsx-runtime", () => ReactJsxRuntime)
mock.module(shiftReact, () => React)
mock.module(shiftJsxRuntime, () => ReactJsxRuntime)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

let loadedSurfaceRoot:
  | typeof import("./SurfaceRoot").SurfaceRoot
  | undefined

async function surfaceRootComponent() {
  loadedSurfaceRoot ??= (await import("./SurfaceRoot")).SurfaceRoot
  return loadedSurfaceRoot
}

const sleep = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))

const identity = {
  kind: "provider" as const,
  value: { provider: "fixture", ref: "wario-land-4" },
}

const localGame = (title = "Wario Land 4"): LocalGame => ({
  id: "wl4",
  title,
  system: "Game Boy Advance",
  identity,
})

const remoteGame = (host: string, id = "wl4"): Game => ({
  id,
  title: "Wario Land 4",
  host,
  identity,
})

const streamHost = (name: string, uuid = `${name}-uuid`): StreamHost => ({
  uuid,
  name,
  paired: true,
})

const streamApps = (id: number): QueryStreamAppsResult => ({
  _tag: "StreamApps",
  items: [{ id, name: "Korri Stream" }],
})

const localLaunchSpec: LocalLaunchSpec = {
  launcherId: "fixture-local",
  component: {
    packageName: "dev.fixture.runtime",
    className: "dev.fixture.runtime.MainActivity",
  },
  extras: { CONTENT: "/fixture/wl4.gba" },
  directories: [],
  files: [],
  integrity: "fixture-integrity",
}

interface Calls {
  localLaunches: string[]
  prepared: Array<{ gameId: string; host: string | undefined }>
  streams: Array<{ hostUuid: string; appId: number }>
}

interface Sources {
  localGames: readonly LocalGame[]
  remoteGames: readonly Game[]
  streamHosts: readonly StreamHost[]
  streamAppsByHost: Readonly<Record<string, QueryStreamAppsResult>>
}

function okCatalog(games: readonly Game[]): CatalogSnapshotOutcome {
  return { _tag: "Ok", payload: { games: [...games] } }
}

function okLocalGames(games: readonly LocalGame[]): LocalGamesListOutcome {
  return { _tag: "Ok", payload: { games: [...games] } }
}

function okSettings(): SettingsSnapshotOutcome {
  return {
    _tag: "Ok",
    payload: {
      revision: "settings-0",
      deviceName: "Browser",
      plugins: [
        { id: "@korri:android-app", title: "Android", enabled: true },
        { id: "@korri:mgba", title: "mGBA", enabled: true },
        { id: "@korri:retroarch", title: "RetroArch", enabled: true },
      ],
    },
  }
}

function buildKorrid(sources: Sources, calls: Calls): KorridClient {
  return {
    async health(): Promise<HealthOutcome> {
      return { _tag: "Ok", payload: { version: "surface-root-test" } }
    },
    async settingsSnapshot(): Promise<SettingsSnapshotOutcome> {
      return okSettings()
    },
    async updateSetting(): Promise<SettingsUpdateOutcome> {
      return okSettings()
    },
    async catalogSnapshot(): Promise<CatalogSnapshotOutcome> {
      return okCatalog(sources.remoteGames)
    },
    async localGames(): Promise<LocalGamesListOutcome> {
      return okLocalGames(sources.localGames)
    },
    async localGameLaunch(gameId): Promise<LocalGameLaunchOutcome> {
      calls.localLaunches.push(gameId)
      return { _tag: "Ok", payload: localLaunchSpec }
    },
    async sessionPrepare(gameId, host): Promise<SessionPrepareOutcome> {
      calls.prepared.push({ gameId, host })
      return { _tag: "Ok", payload: { gameId } }
    },
    async sessionStatus(): Promise<SessionStatusOutcome> {
      return { _tag: "Ok", payload: {} }
    },
    async sessionStop(): Promise<SessionStopOutcome> {
      return { _tag: "Ok", payload: { phase: SessionStopPhase.Stopped } }
    },
  }
}

function buildBridge(sources: Sources, calls: Calls): LauncherBridge {
  return {
    async launchLocal(_spec): Promise<LaunchLocalResult> {
      return { _tag: "Launched" }
    },
    async queryStreamHosts(): Promise<QueryStreamHostsResult> {
      return { _tag: "StreamHosts", items: [...sources.streamHosts] }
    },
    async queryStreamApps(hostUuid): Promise<QueryStreamAppsResult> {
      return sources.streamAppsByHost[hostUuid] ?? { _tag: "StreamApps", items: [] }
    },
    async startStream(hostUuid, appId): Promise<StartStreamResult> {
      calls.streams.push({ hostUuid, appId })
      return { _tag: "StreamStarted" }
    },
    async storageAccess(): Promise<StorageAccessResult> {
      return { _tag: "Granted" }
    },
    async openStorageAccessSettings() {
      return { _tag: "Opened" as const }
    },
    async openPairing() {
      return { _tag: "Opened" as const }
    },
    async backgroundNotice(): Promise<BackgroundNoticeResult> {
      return { _tag: "Hidden" }
    },
    async requestBackgroundNotice() {
      return { _tag: "Unprompted" as const }
    },
    async openNotificationSettings() {
      return { _tag: "Opened" as const }
    },
    async systemInfo() {
      return {
        _tag: "SystemInfo" as const,
        payload: {
          device: "Browser",
          manufacturer: "Korri",
          androidRelease: "Not Android",
          sdk: 0,
          appVersion: "test",
        },
      }
    },
  }
}

interface SurfaceRootView {
  readonly container: HTMLElement
  readonly bus: InputBus
  cleanup(): void
}

const mounted: SurfaceRootView[] = []

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.cleanup()
  document.body.innerHTML = ""
})

async function renderSurfaceRoot(sources: Sources, calls: Calls): Promise<SurfaceRootView> {
  const container = document.createElement("div")
  document.body.append(container)
  const root: Root = createRoot(container)
  const bus = createInputBus()
  const stopSpatialFocus = createSpatialFocusController(bus)
  const SurfaceRoot = await surfaceRootComponent()

  await act(async () => {
    root.render(
      <SurfaceRoot
        bus={bus}
        bridge={buildBridge(sources, calls)}
        korrid={buildKorrid(sources, calls)}
      />,
    )
  })

  const view: SurfaceRootView = {
    container,
    bus,
    cleanup() {
      act(() => root.unmount())
      stopSpatialFocus()
      bus.dispose()
      container.remove()
    },
  }
  mounted.push(view)
  return view
}

async function waitFor(assertReady: () => void, label: string, attempts = 80) {
  let last: unknown
  for (let index = 0; index < attempts; index += 1) {
    try {
      assertReady()
      return
    } catch (error) {
      last = error
      await act(async () => {
        await sleep()
      })
    }
  }
  throw new Error(`${label}: ${last instanceof Error ? last.message : String(last)}`)
}

function accessibleName(element: HTMLElement): string {
  return element.getAttribute("aria-label") ?? element.textContent?.trim() ?? ""
}

function buttons(root: ParentNode = document): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button"))
}

function buttonNamed(name: string, root: ParentNode = document): HTMLButtonElement {
  const button = buttons(root).find(candidate => accessibleName(candidate) === name)
  if (button === undefined) {
    throw new Error(
      `Missing button ${name}. Buttons: ${buttons(root)
        .map(accessibleName)
        .join(", ")}`,
    )
  }
  return button
}

function dialogNamed(name: string): HTMLElement {
  const dialog = document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${name}"]`)
  if (dialog === null) throw new Error(`Missing dialog ${name}`)
  return dialog
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.focus()
    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
    await sleep()
    button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    )
    await sleep()
  })
}

async function openWarioDetail() {
  await click(buttonNamed("Library"))
  await waitFor(
    () => expect(document.querySelector("[data-shift-library]")).not.toBeNull(),
    "expected Library screen",
  )
  await click(buttonNamed("Wario Land 4", document.querySelector("[data-shift-library]")!))
  await waitFor(
    () => expect(document.querySelector("[data-shift-detail]")).not.toBeNull(),
    "expected Wario detail screen",
  )
}

describe("SurfaceRoot", () => {
  test("selecting a folded remote location dispatches the exact non-default stream route", async () => {
    const calls: Calls = { localLaunches: [], prepared: [], streams: [] }
    const sources: Sources = {
      localGames: [localGame()],
      remoteGames: [remoteGame("zao")],
      streamHosts: [streamHost("zao", "zao-uuid")],
      streamAppsByHost: { "zao-uuid": streamApps(77) },
    }
    await renderSurfaceRoot(sources, calls)

    await waitFor(() => expect(buttonNamed("Library")).toBeDefined(), "expected loaded home")
    await openWarioDetail()
    await click(buttonNamed("▶ Play"))
    const chooser = dialogNamed("Choose where to play Wario Land 4")
    expect(buttons(chooser).map(accessibleName)).toContain("This device")

    await click(buttonNamed("zao", chooser))

    await waitFor(
      () => {
        expect(calls.prepared).toEqual([{ gameId: "wl4", host: "zao" }])
        expect(calls.streams).toEqual([{ hostUuid: "zao-uuid", appId: 77 }])
      },
      "expected exact remote launch path",
    )
    expect(calls.localLaunches).toEqual([])
  })

  test("a shell-resume refresh lets the stable surface host act on the current route", async () => {
    const calls: Calls = { localLaunches: [], prepared: [], streams: [] }
    const sources: Sources = {
      localGames: [localGame()],
      remoteGames: [remoteGame("zao")],
      streamHosts: [streamHost("zao", "zao-uuid")],
      streamAppsByHost: { "zao-uuid": streamApps(77) },
    }
    await renderSurfaceRoot(sources, calls)

    await waitFor(() => expect(buttonNamed("Library")).toBeDefined(), "expected loaded home")

    sources.remoteGames = [remoteGame("aka")]
    sources.streamHosts = [streamHost("aka", "aka-uuid")]
    sources.streamAppsByHost = { "aka-uuid": streamApps(88) }
    await act(async () => {
      window.dispatchEvent(new Event(SHELL_RESUMED_EVENT))
      await sleep()
    })

    await waitFor(
      () => expect(document.body.textContent ?? "").toContain("Also on aka"),
      "expected refreshed remote source",
    )
    expect(document.body.textContent ?? "").not.toContain("Also on zao")

    await openWarioDetail()
    await click(buttonNamed("▶ Play"))
    const chooser = dialogNamed("Choose where to play Wario Land 4")
    expect(buttons(chooser).map(accessibleName)).toContain("aka")
    expect(buttons(chooser).map(accessibleName)).not.toContain("zao")

    await click(buttonNamed("aka", chooser))

    await waitFor(
      () => {
        expect(calls.prepared).toEqual([{ gameId: "wl4", host: "aka" }])
        expect(calls.streams).toEqual([{ hostUuid: "aka-uuid", appId: 88 }])
      },
      "expected refreshed route launch path",
    )
    expect(calls.localLaunches).toEqual([])
  })
})
