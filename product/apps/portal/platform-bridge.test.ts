import { describe, expect, it } from "bun:test"
import { createInputBus } from "@platform/input/bus"
import type { InputAction } from "@platform/input/types"
import {
  createPortalPlatformBridge,
  type PortalRpcRunner,
} from "./platform-bridge"

describe("createPortalPlatformBridge", () => {
  it("exposes library, launch, API, input, and fixture foreground capabilities", async () => {
    const calls: Array<{ method: string; payload: unknown }> = []
    const bus = createInputBus()
    const appRpc: PortalRpcRunner = async (method, payload) => {
      calls.push({ method, payload })
      if (method === "app.catalog.snapshot") {
        return { entries: [{ id: "hades" }] }
      }
      return { ok: true }
    }

    const bridge = createPortalPlatformBridge({ inputBus: bus, appRpc })

    await expect(bridge.library.list()).resolves.toEqual([{ id: "hades" }])
    await bridge.library.launch({ id: "hades" })
    await expect(bridge.api.rpc("app.example", { yes: true })).resolves.toEqual(
      {
        ok: true,
      },
    )
    await expect(bridge.foregroundSession.get()).resolves.toEqual({
      _tag: "Ready",
    })
    await expect(bridge.device?.status()).resolves.toMatchObject({
      battery: { _tag: "Unknown" },
    })
    await expect(bridge.device?.refresh()).resolves.toBeUndefined()

    const seen: InputAction[] = []
    const unsubscribe = bridge.input.subscribe(action => seen.push(action))
    bus.emit({ type: "menu", source: "keyboard" })
    unsubscribe()
    expect(seen).toEqual([{ type: "menu", source: "keyboard" }])

    expect(calls).toEqual([
      { method: "app.catalog.snapshot", payload: { scope: "fabric" } },
      { method: "app.library.launch", payload: { id: "hades" } },
      { method: "app.example", payload: { yes: true } },
      { method: "app.device.status", payload: {} },
      { method: "app.device.refresh", payload: {} },
    ])
  })

  it("keeps no-upstream library responses as empty but rejects invalid shapes", async () => {
    const bus = createInputBus()

    await expect(
      createPortalPlatformBridge({
        inputBus: bus,
        appRpc: async () => {
          throw new Error("503 no upstream")
        },
      }).library.list(),
    ).resolves.toEqual([])

    await expect(
      createPortalPlatformBridge({
        inputBus: bus,
        appRpc: async () => ({ games: [] }),
      }).library.list(),
    ).rejects.toThrow("unexpected response shape")
  })

  it("uses server status only for desktop foreground-session state", async () => {
    const bridge = createPortalPlatformBridge({
      inputBus: createInputBus(),
      desktopInput: true,
      appRpc: async () => ({ entries: [] }),
      serverRpc: async () => ({
        serverId: "server-1",
        sessiond: { mode: "game" },
      }),
    })

    await expect(bridge.foregroundSession.get()).resolves.toMatchObject({
      _tag: "Running",
    })
  })
})
