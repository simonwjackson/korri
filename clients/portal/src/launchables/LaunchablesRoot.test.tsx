import { describe, expect, it } from "bun:test"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { SHELL_RESUMED_EVENT } from "@contracts/bridge/korri-native-bridge"
import { createInMemoryLauncherBridge } from "../bridge/launcher-bridge"
import { createInMemoryKorridClient } from "../korrid/client"
import { createInputBus } from "../input/bus"
import { LaunchablesRoot } from "./LaunchablesRoot"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true
;(globalThis as { __PORTAL_BUILD__?: string }).__PORTAL_BUILD__ = "test"

const flush = () => new Promise(resolve => setTimeout(resolve, 25))

async function renderRoot(
  korrid = createInMemoryKorridClient({ games: [] }),
  bridge = createInMemoryLauncherBridge({
    streamHosts: [],
  }),
) {
  const bus = createInputBus()
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<LaunchablesRoot bus={bus} bridge={bridge} korrid={korrid} />)
  })
  await act(async () => {
    await flush()
  })
  return {
    bus,
    container,
    async cleanup() {
      await act(async () => root.unmount())
      bus.dispose()
      container.remove()
    },
  }
}

describe("LaunchablesRoot shell action entries", () => {
  it("opens native pairing and renders Unavailable as a notice", async () => {
    let calls = 0
    const baseBridge = createInMemoryLauncherBridge({
      streamHosts: [],
    })
    const bridge = {
      ...baseBridge,
      async openPairing() {
        calls += 1
        return { _tag: "Unavailable" as const, message: "no pairing screen" }
      },
    }
    const view = await renderRoot(
      createInMemoryKorridClient({ games: [], localGames: [] }),
      bridge,
    )

    await act(async () => {
      view.bus.emit({ type: "confirm", source: "keyboard" })
      await flush()
    })

    expect(calls).toBe(1)
    expect(view.container.textContent).toContain(
      "cannot open pairing: no pairing screen",
    )
    await view.cleanup()
  })

  it("opens storage access settings and renders Unavailable as a notice", async () => {
    let calls = 0
    const baseBridge = createInMemoryLauncherBridge({
      streamHosts: [],
    })
    const bridge = {
      ...baseBridge,
      async storageAccess() {
        return { _tag: "Denied" as const }
      },
      async openStorageAccessSettings() {
        calls += 1
        return { _tag: "Unavailable" as const, message: "no storage settings" }
      },
    }
    const view = await renderRoot(
      createInMemoryKorridClient({ games: [], localGames: [] }),
      bridge,
    )
    expect(view.container.textContent).toContain("Korri needs file access")

    await act(async () => {
      view.bus.emit({ type: "confirm", source: "keyboard" })
      await flush()
    })

    expect(calls).toBe(1)
    expect(view.container.textContent).toContain(
      "cannot open settings: no storage settings",
    )
    await view.cleanup()
  })

  it("requests background notice visibility and renders Unavailable settings", async () => {
    let requests = 0
    let settings = 0
    const baseBridge = createInMemoryLauncherBridge({
      streamHosts: [],
    })
    const bridge = {
      ...baseBridge,
      async backgroundNotice() {
        return { _tag: "Hidden" as const }
      },
      async requestBackgroundNotice() {
        requests += 1
        return { _tag: "Unprompted" as const }
      },
      async openNotificationSettings() {
        settings += 1
        return {
          _tag: "Unavailable" as const,
          message: "no notification settings",
        }
      },
    }
    const view = await renderRoot(
      createInMemoryKorridClient({ games: [], localGames: [] }),
      bridge,
    )

    await act(async () => {
      view.bus.emit({
        type: "direction",
        direction: "down",
        source: "keyboard",
      })
      view.bus.emit({ type: "confirm", source: "keyboard" })
      await flush()
    })

    expect(requests).toBe(1)
    expect(settings).toBe(1)
    expect(view.container.textContent).toContain(
      "cannot open notification settings: no notification settings",
    )
    await view.cleanup()
  })

  it("opens notification settings directly when the background notice is visible", async () => {
    let requests = 0
    let settings = 0
    const baseBridge = createInMemoryLauncherBridge({
      streamHosts: [],
    })
    const bridge = {
      ...baseBridge,
      async backgroundNotice() {
        return { _tag: "Visible" as const }
      },
      async requestBackgroundNotice() {
        requests += 1
        return { _tag: "Granted" as const }
      },
      async openNotificationSettings() {
        settings += 1
        return { _tag: "Opened" as const }
      },
    }
    const view = await renderRoot(
      createInMemoryKorridClient({ games: [], localGames: [] }),
      bridge,
    )

    await act(async () => {
      view.bus.emit({
        type: "direction",
        direction: "down",
        source: "keyboard",
      })
      view.bus.emit({ type: "confirm", source: "keyboard" })
      await flush()
    })

    expect(requests).toBe(0)
    expect(settings).toBe(1)
    await view.cleanup()
  })

  for (const outcome of ["Granted", "Prompted", "Denied"] as const) {
    it(`does not open notification settings after the hidden background notice returns ${outcome}`, async () => {
      let requests = 0
      let settings = 0
      const baseBridge = createInMemoryLauncherBridge({
        streamHosts: [],
      })
      const bridge = {
        ...baseBridge,
        async backgroundNotice() {
          return { _tag: "Hidden" as const }
        },
        async requestBackgroundNotice() {
          requests += 1
          return { _tag: outcome }
        },
        async openNotificationSettings() {
          settings += 1
          return { _tag: "Opened" as const }
        },
      }
      const view = await renderRoot(
        createInMemoryKorridClient({ games: [], localGames: [] }),
        bridge,
      )

      await act(async () => {
        view.bus.emit({
          type: "direction",
          direction: "down",
          source: "keyboard",
        })
        view.bus.emit({ type: "confirm", source: "keyboard" })
        await flush()
      })

      expect(requests).toBe(1)
      expect(settings).toBe(0)
      await view.cleanup()
    })
  }
})

describe("LaunchablesRoot pointer activation", () => {
  it("ignores stale activate actions whose key does not match the indexed entry", async () => {
    let pairings = 0
    let launches = 0
    const baseBridge = createInMemoryLauncherBridge({ streamHosts: [] })
    const bridge = {
      ...baseBridge,
      async openPairing() {
        pairings += 1
        return { _tag: "Opened" as const }
      },
      async launchLocal(spec: Parameters<typeof baseBridge.launchLocal>[0]) {
        launches += 1
        return baseBridge.launchLocal(spec)
      },
    }
    const view = await renderRoot(createInMemoryKorridClient({ games: [] }), bridge)

    await act(async () => {
      view.bus.emit({
        type: "activate",
        index: 0,
        key: "pairing",
        source: "pointer",
      })
      await flush()
    })

    expect(pairings).toBe(0)
    expect(launches).toBe(0)
    expect(view.container.textContent).toContain("Wario Land 4")
    await view.cleanup()
  })

  it("ignores out-of-range activate actions", async () => {
    let launches = 0
    const baseBridge = createInMemoryLauncherBridge({ streamHosts: [] })
    const bridge = {
      ...baseBridge,
      async launchLocal(spec: Parameters<typeof baseBridge.launchLocal>[0]) {
        launches += 1
        return baseBridge.launchLocal(spec)
      },
    }
    const view = await renderRoot(createInMemoryKorridClient({ games: [] }), bridge)

    await act(async () => {
      view.bus.emit({
        type: "activate",
        index: 99,
        key: "local-game:wl4",
        source: "pointer",
      })
      await flush()
    })

    expect(launches).toBe(0)
    expect(view.container.textContent).toContain("Wario Land 4")
    await view.cleanup()
  })

  it("ignores activate actions from a list reordered since the tap target was rendered", async () => {
    let storageDenied = false
    let pairings = 0
    let launches = 0
    const baseBridge = createInMemoryLauncherBridge({ streamHosts: [] })
    const bridge = {
      ...baseBridge,
      async storageAccess() {
        return storageDenied ? { _tag: "Denied" as const } : { _tag: "Granted" as const }
      },
      async openPairing() {
        pairings += 1
        return { _tag: "Opened" as const }
      },
      async launchLocal(spec: Parameters<typeof baseBridge.launchLocal>[0]) {
        launches += 1
        return baseBridge.launchLocal(spec)
      },
    }
    const view = await renderRoot(createInMemoryKorridClient({ games: [] }), bridge)
    expect(view.container.textContent).toContain("Wario Land 4")

    await act(async () => {
      storageDenied = true
      window.dispatchEvent(new Event(SHELL_RESUMED_EVENT))
      await flush()
    })
    expect(view.container.textContent).toContain("Korri needs file access")

    await act(async () => {
      view.bus.emit({
        type: "activate",
        index: 1,
        key: "pairing",
        source: "pointer",
      })
      await flush()
    })

    expect(pairings).toBe(0)
    expect(launches).toBe(0)
    expect(view.container.textContent).toContain("Korri needs file access")
    await view.cleanup()
  })
})

describe("LaunchablesRoot local launch flow", () => {
  it("confirms Wario through korrid then the launcher-neutral bridge", async () => {
    let requestedGame = ""
    let launchedSpec: unknown
    let reloads = 0
    const baseKorrid = createInMemoryKorridClient({ games: [] })
    const korrid = {
      ...baseKorrid,
      async localGames() {
        reloads += 1
        return baseKorrid.localGames()
      },
      async localGameLaunch(gameId: string) {
        requestedGame = gameId
        return baseKorrid.localGameLaunch(gameId)
      },
    }
    const baseBridge = createInMemoryLauncherBridge({
      streamHosts: [],
    })
    const bridge = {
      ...baseBridge,
      async launchLocal(spec: Parameters<typeof baseBridge.launchLocal>[0]) {
        launchedSpec = spec
        return baseBridge.launchLocal(spec)
      },
    }
    const view = await renderRoot(korrid, bridge)
    expect(view.container.textContent).toContain("Wario Land 4")

    await act(async () => {
      view.bus.emit({ type: "confirm", source: "keyboard" })
      await flush()
    })

    expect(requestedGame).toBe("wl4")
    expect(launchedSpec).toMatchObject({ launcherId: "retroarch" })

    await act(async () => {
      window.dispatchEvent(new Event(SHELL_RESUMED_EVENT))
      await flush()
    })
    expect(reloads).toBe(2)
    await view.cleanup()
  })

  it("keeps the portal usable and skips the bridge when the ROM is missing", async () => {
    let bridgeCalls = 0
    const korrid = createInMemoryKorridClient({
      games: [],
      behavior: "local-launch-fail",
    })
    const baseBridge = createInMemoryLauncherBridge({
      streamHosts: [],
    })
    const bridge = {
      ...baseBridge,
      async launchLocal(spec: Parameters<typeof baseBridge.launchLocal>[0]) {
        bridgeCalls += 1
        return baseBridge.launchLocal(spec)
      },
    }
    const view = await renderRoot(korrid, bridge)

    await act(async () => {
      view.bus.emit({ type: "confirm", source: "keyboard" })
      await flush()
    })

    expect(bridgeCalls).toBe(0)
    expect(view.container.textContent).toContain("LocalRomMissing")
    expect(view.container.textContent).toContain("Wario Land 4")
    await view.cleanup()
  })

  it("prepares and attaches a hosted game on its matching paired host", async () => {
    let prepared: { gameId: string; host?: string } | undefined
    let started: { hostUuid: string; appId: number } | undefined
    const baseKorrid = createInMemoryKorridClient({
      games: [{ id: "neverball", title: "Neverball", host: "zao" }],
      localGames: [],
    })
    const korrid = {
      ...baseKorrid,
      async sessionPrepare(gameId: string, host?: string) {
        prepared = { gameId, host }
        return baseKorrid.sessionPrepare(gameId, host)
      },
    }
    const baseBridge = createInMemoryLauncherBridge({
      streamHosts: [
        { uuid: "aka-uuid", name: "aka", paired: true },
        { uuid: "zao-uuid", name: "zao", paired: true },
      ],
      streamApps: {
        "aka-uuid": [{ id: 10, name: "Korri Stream" }],
        "zao-uuid": [{ id: 20, name: "Korri Stream" }],
      },
    })
    const bridge = {
      ...baseBridge,
      async startStream(hostUuid: string, appId: number) {
        started = { hostUuid, appId }
        return baseBridge.startStream(hostUuid, appId)
      },
    }
    const view = await renderRoot(korrid, bridge)

    await act(async () => {
      view.bus.emit({ type: "confirm", source: "keyboard" })
      await flush()
    })

    expect(prepared).toEqual({ gameId: "neverball", host: "zao" })
    expect(started).toEqual({ hostUuid: "zao-uuid", appId: 20 })
    await view.cleanup()
  })

  it("does not prepare a hosted game when its stream host is absent", async () => {
    let prepareCalls = 0
    let streamCalls = 0
    const baseKorrid = createInMemoryKorridClient({
      games: [{ id: "neverball", title: "Neverball", host: "zao" }],
      localGames: [],
    })
    const korrid = {
      ...baseKorrid,
      async sessionPrepare(gameId: string, host?: string) {
        prepareCalls += 1
        return baseKorrid.sessionPrepare(gameId, host)
      },
    }
    const baseBridge = createInMemoryLauncherBridge({
      streamHosts: [{ uuid: "aka-uuid", name: "aka", paired: true }],
      streamApps: {
        "aka-uuid": [{ id: 10, name: "Korri Stream" }],
      },
    })
    const bridge = {
      ...baseBridge,
      async startStream(hostUuid: string, appId: number) {
        streamCalls += 1
        return baseBridge.startStream(hostUuid, appId)
      },
    }
    const view = await renderRoot(korrid, bridge)

    await act(async () => {
      view.bus.emit({ type: "confirm", source: "keyboard" })
      await flush()
    })

    expect(prepareCalls).toBe(0)
    expect(streamCalls).toBe(0)
    expect(view.container.textContent).toContain("NoStreamTarget")
    expect(view.container.textContent).toContain("zao")
    await view.cleanup()
  })

  it("resumes now-playing on the session's host", async () => {
    let started: { hostUuid: string; appId: number } | undefined
    const korrid = createInMemoryKorridClient({
      games: [],
      localGames: [],
      activeSession: {
        launchId: "aka-session",
        title: "Skate 3",
        host: "aka",
      },
    })
    const baseBridge = createInMemoryLauncherBridge({
      streamHosts: [
        { uuid: "zao-uuid", name: "zao", paired: true },
        { uuid: "aka-uuid", name: "aka", paired: true },
      ],
      streamApps: {
        "zao-uuid": [{ id: 20, name: "Korri Stream" }],
        "aka-uuid": [{ id: 10, name: "Korri Stream" }],
      },
    })
    const bridge = {
      ...baseBridge,
      async startStream(hostUuid: string, appId: number) {
        started = { hostUuid, appId }
        return baseBridge.startStream(hostUuid, appId)
      },
    }
    const view = await renderRoot(korrid, bridge)

    await act(async () => {
      view.bus.emit({ type: "confirm", source: "keyboard" })
      await flush()
    })

    expect(started).toEqual({ hostUuid: "aka-uuid", appId: 10 })
    await view.cleanup()
  })

  it("still confirms an existing stream entry", async () => {
    let streamCalls = 0
    const korrid = createInMemoryKorridClient({ games: [], localGames: [] })
    const baseBridge = createInMemoryLauncherBridge({
      streamHosts: [{ uuid: "host", name: "Aka", paired: true }],
      streamApps: { host: [{ id: 7, name: "Desktop" }] },
    })
    const bridge = {
      ...baseBridge,
      async startStream(hostUuid: string, appId: number) {
        streamCalls += 1
        return baseBridge.startStream(hostUuid, appId)
      },
    }
    const view = await renderRoot(korrid, bridge)

    await act(async () => {
      view.bus.emit({ type: "confirm", source: "keyboard" })
      await flush()
    })

    expect(streamCalls).toBe(1)
    await view.cleanup()
  })
})
