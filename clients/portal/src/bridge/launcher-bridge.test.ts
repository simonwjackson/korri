import { describe, expect, it } from "bun:test"
import type { KorriNativeBridgeSurface } from "@contracts/bridge/korri-native-bridge"
import {
  createInMemoryLauncherBridge,
  createKorriNativeLauncherBridge,
} from "./launcher-bridge"

describe("createInMemoryLauncherBridge", () => {
  it("launches local specs through the configured in-memory bridge", async () => {
    const bridge = createInMemoryLauncherBridge()
    const spec = {
      launchId: "launch-1",
      launcherId: "retroarch",
      component: { packageName: "pkg", className: "Activity" },
      extras: {},
      directories: [],
      files: [],
      integrity: "opaque-signature",
    }

    expect(await bridge.launchLocal(spec)).toEqual({ _tag: "Launched" })
  })

  it("fails local launches when configured to", async () => {
    const bridge = createInMemoryLauncherBridge({ behavior: "local-launch-fail" })
    const result = await bridge.launchLocal({
      launchId: "launch-2",
      launcherId: "retroarch",
      component: { packageName: "pkg", className: "Activity" },
      extras: {},
      directories: [],
      files: [],
      integrity: "opaque-signature",
    })
    expect(result).toMatchObject({
      _tag: "LaunchFailed",
      reason: "NotInstalled",
    })
  })
})

describe("createKorriNativeLauncherBridge", () => {
  const surface = (
    overrides: Partial<KorriNativeBridgeSurface>,
  ): KorriNativeBridgeSurface => ({
    launchLocal: () => JSON.stringify({ _tag: "Launched" }),
    queryStreamHosts: () =>
      JSON.stringify({
        _tag: "StreamHosts",
        items: [{ uuid: "h1", name: "Office", paired: true }],
      }),
    queryStreamApps: () =>
      JSON.stringify({
        _tag: "StreamApps",
        items: [{ id: 7, name: "Desktop" }],
      }),
    startStream: () => JSON.stringify({ _tag: "StreamStarted" }),
    korridPort: () => 43117,
    korridCapability: () => "test-capability",
    storageAccess: () => JSON.stringify({ _tag: "Granted" }),
    openStorageAccessSettings: () => JSON.stringify({ _tag: "Opened" }),
    openPairing: () => JSON.stringify({ _tag: "Opened" }),
    backgroundNotice: () => JSON.stringify({ _tag: "Visible" }),
    requestBackgroundNotice: () => JSON.stringify({ _tag: "Granted" }),
    openNotificationSettings: () => JSON.stringify({ _tag: "Opened" }),
    systemInfo: () =>
      JSON.stringify({
        _tag: "SystemInfo",
        payload: {
          device: "RG405M",
          manufacturer: "Anbernic",
          androidRelease: "14",
          sdk: 34,
          appVersion: "1.0",
        },
      }),
    bridgeVersion: () => 11,
    ...overrides,
  })

  it("serializes a launcher-neutral local spec to the native surface", async () => {
    let received = ""
    const bridge = createKorriNativeLauncherBridge(
      surface({
        launchLocal: specJson => {
          received = specJson
          return JSON.stringify({ _tag: "Launched" })
        },
      }),
    )
    const spec = {
      launchId: "launch-3",
      launcherId: "retroarch",
      component: { packageName: "pkg", className: "Activity" },
      extras: { ROM: "/rom" },
      directories: [],
      files: [],
      integrity: "opaque-signature",
    }
    expect(await bridge.launchLocal(spec)).toEqual({ _tag: "Launched" })
    expect(JSON.parse(received)).toEqual(spec)
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
    expect(await bridge.startStream("h1", 7)).toEqual({
      _tag: "StreamStarted",
    })
  })

  it("round-trips valid shell-state bridge payloads", async () => {
    for (const expected of [
      { _tag: "Granted" },
      { _tag: "NotRequired" },
      { _tag: "Denied" },
      { _tag: "QueryFailed", message: "storage probe failed" },
    ] as const) {
      const bridge = createKorriNativeLauncherBridge(
        surface({ storageAccess: () => JSON.stringify(expected) }),
      )
      expect(await bridge.storageAccess()).toEqual(expected)
    }

    for (const expected of [
      { _tag: "Opened" },
      { _tag: "Unavailable", message: "no storage settings" },
    ] as const) {
      const bridge = createKorriNativeLauncherBridge(
        surface({ openStorageAccessSettings: () => JSON.stringify(expected) }),
      )
      expect(await bridge.openStorageAccessSettings()).toEqual(expected)
    }

    for (const expected of [{ _tag: "Visible" }, { _tag: "Hidden" }] as const) {
      const bridge = createKorriNativeLauncherBridge(
        surface({ backgroundNotice: () => JSON.stringify(expected) }),
      )
      expect(await bridge.backgroundNotice()).toEqual(expected)
    }

    for (const expected of [
      { _tag: "Granted" },
      { _tag: "Denied" },
      { _tag: "Prompted" },
      { _tag: "Unprompted" },
    ] as const) {
      const bridge = createKorriNativeLauncherBridge(
        surface({ requestBackgroundNotice: () => JSON.stringify(expected) }),
      )
      expect(await bridge.requestBackgroundNotice()).toEqual(expected)
    }

    for (const expected of [
      { _tag: "Opened" },
      { _tag: "Unavailable", message: "no notification settings" },
    ] as const) {
      const bridge = createKorriNativeLauncherBridge(
        surface({ openNotificationSettings: () => JSON.stringify(expected) }),
      )
      expect(await bridge.openNotificationSettings()).toEqual(expected)
    }

    for (const expected of [
      { _tag: "Opened" },
      { _tag: "Unavailable", message: "no pairing screen" },
    ] as const) {
      const bridge = createKorriNativeLauncherBridge(
        surface({ openPairing: () => JSON.stringify(expected) }),
      )
      expect(await bridge.openPairing()).toEqual(expected)
    }
  })

  it("decodes Android system information", async () => {
    const bridge = createKorriNativeLauncherBridge(surface({}))

    expect(await bridge.systemInfo()).toEqual({
      _tag: "SystemInfo",
      payload: {
        device: "RG405M",
        manufacturer: "Anbernic",
        androidRelease: "14",
        sdk: 34,
        appVersion: "1.0",
      },
    })
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

  it("converts malformed local launch native payloads into tagged failures", async () => {
    const bridge = createKorriNativeLauncherBridge(
      surface({
        launchLocal: () => {
          throw new Error("bridge exploded")
        },
      }),
    )
    expect(
      await bridge.launchLocal({
        launchId: "launch-4",
        launcherId: "retroarch",
        component: { packageName: "pkg", className: "Activity" },
        extras: {},
        directories: [],
        files: [],
        integrity: "opaque-signature",
      }),
    ).toMatchObject({
      _tag: "LaunchFailed",
      reason: "StartFailed",
      message: "bridge exploded",
    })
  })

  it("rejects wrong tags in shell-state bridge payloads", async () => {
    const bridge = createKorriNativeLauncherBridge(
      surface({
        storageAccess: () => JSON.stringify({ _tag: "Opened" }),
        openStorageAccessSettings: () => JSON.stringify({ _tag: "Granted" }),
        backgroundNotice: () => JSON.stringify({ _tag: "Granted" }),
        requestBackgroundNotice: () => JSON.stringify({ _tag: "Visible" }),
        openNotificationSettings: () => JSON.stringify({ _tag: "Denied" }),
        openPairing: () => JSON.stringify({ _tag: "Denied" }),
      }),
    )

    expect((await bridge.storageAccess())._tag).toBe("QueryFailed")
    expect(await bridge.openStorageAccessSettings()).toMatchObject({
      _tag: "Unavailable",
    })
    expect(await bridge.backgroundNotice()).toEqual({ _tag: "Hidden" })
    expect(await bridge.requestBackgroundNotice()).toEqual({
      _tag: "Unprompted",
    })
    expect(await bridge.openNotificationSettings()).toMatchObject({
      _tag: "Unavailable",
    })
    expect(await bridge.openPairing()).toMatchObject({ _tag: "Unavailable" })
  })

  it("rejects missing fields in shell-state bridge payloads", async () => {
    const bridge = createKorriNativeLauncherBridge(
      surface({
        storageAccess: () => JSON.stringify({ _tag: "QueryFailed" }),
        openStorageAccessSettings: () =>
          JSON.stringify({ _tag: "Unavailable" }),
        openNotificationSettings: () =>
          JSON.stringify({ _tag: "Unavailable" }),
        openPairing: () => JSON.stringify({ _tag: "Unavailable" }),
      }),
    )

    expect((await bridge.storageAccess())._tag).toBe("QueryFailed")
    expect(await bridge.openStorageAccessSettings()).toMatchObject({
      _tag: "Unavailable",
    })
    expect(await bridge.openNotificationSettings()).toMatchObject({
      _tag: "Unavailable",
    })
    expect(await bridge.openPairing()).toMatchObject({ _tag: "Unavailable" })
  })
})
