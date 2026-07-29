import { describe, expect, it } from "bun:test"
import type { KorriNativeBridgeSurface } from "@contracts/bridge/korri-native-bridge"
import {
  createInMemoryLauncherBridge,
  createKorriNativeLauncherBridge,
} from "./launcher-bridge"

describe("createInMemoryLauncherBridge", () => {
  it("returns configured items", async () => {
    const bridge = createInMemoryLauncherBridge({
      items: [{ packageName: "a", label: "A" }],
    })
    expect(await bridge.queryLaunchables()).toEqual({
      _tag: "Launchables",
      items: [{ packageName: "a", label: "A" }],
    })
    expect(await bridge.launchApp("a")).toEqual({ _tag: "Launched" })
  })

  it("fails queries when configured to", async () => {
    const bridge = createInMemoryLauncherBridge({ behavior: "query-fail" })
    const result = await bridge.queryLaunchables()
    expect(result._tag).toBe("QueryFailed")
  })

  it("fails launches for unknown packages", async () => {
    const bridge = createInMemoryLauncherBridge({ items: [] })
    const result = await bridge.launchApp("ghost")
    expect(result).toMatchObject({ _tag: "LaunchFailed", reason: "NotFound" })
  })
})

describe("createKorriNativeLauncherBridge", () => {
  const surface = (overrides: Partial<KorriNativeBridgeSurface>): KorriNativeBridgeSurface => ({
    queryLaunchables: () =>
      JSON.stringify({ _tag: "Launchables", items: [{ packageName: "x", label: "X" }] }),
    launchApp: () => JSON.stringify({ _tag: "Launched" }),
    bridgeVersion: () => 1,
    ...overrides,
  })

  it("decodes results from the native surface", async () => {
    const bridge = createKorriNativeLauncherBridge(surface({}))
    expect(await bridge.queryLaunchables()).toEqual({
      _tag: "Launchables",
      items: [{ packageName: "x", label: "X" }],
    })
    expect(await bridge.launchApp("x")).toEqual({ _tag: "Launched" })
  })

  it("decodes stream results from the native surface", async () => {
    const bridge = createKorriNativeLauncherBridge(surface({}))
    expect(await bridge.queryStreamHosts()).toEqual({
      _tag: "StreamHosts",
      items: [{ uuid: "h1", name: "Office", paired: true }],
    })
    expect(await bridge.queryStreamApps("h1")).toEqual({
      _tag: "StreamApps",
      items: [{ id: 7, name: "Desktop" }],
    })
    expect(await bridge.startStream("h1", 7)).toEqual({ _tag: "StreamStarted" })
  })

  it("converts stream bridge explosions into tagged failures", async () => {
    const bridge = createKorriNativeLauncherBridge(
      surface({
        startStream: () => {
          throw new Error("bridge exploded")
        },
      }),
    )
    expect(await bridge.startStream("h1", 7)).toMatchObject({
      _tag: "StreamFailed",
      reason: "StartFailed",
    })
  })

  it("converts malformed native payloads into tagged failures", async () => {
    const bridge = createKorriNativeLauncherBridge(
      surface({
        queryLaunchables: () => "not json",
        launchApp: () => {
          throw new Error("bridge exploded")
        },
      }),
    )
    expect((await bridge.queryLaunchables())._tag).toBe("QueryFailed")
    expect(await bridge.launchApp("x")).toMatchObject({
      _tag: "LaunchFailed",
      reason: "StartFailed",
      message: "bridge exploded",
    })
  })
})
