import { describe, expect, it } from "bun:test"
import { parseProcBusInputDevices } from "@platform/input/native/discover-devices"
import { CDP_INPUT_BRIDGE_PLUGIN_ID } from "./policy"
import { createCdpInputBridgeSessionLifecycleHook } from "./session-lifecycle-hook"

const ambiguousDevices = parseProcBusInputDevices(`
I: Bus=0003 Vendor=045e Product=028e Version=0114
N: Name="Microsoft X-Box 360 pad"
P: Phys=inputplumber/virtual-xbox360
S: Sysfs=/devices/virtual/input/input10
U: Uniq=inputplumber-virtual-xbox360
H: Handlers=event10 
B: PROP=0
B: EV=20001b
B: KEY=1000000000000 0 0 0 0
B: ABS=30027

I: Bus=0003 Vendor=045e Product=0b12 Version=0114
N: Name="Microsoft Xbox Series S|X Controller"
P: Phys=inputplumber/virtual-xbox-series
S: Sysfs=/devices/virtual/input/input11
U: Uniq=inputplumber-virtual-xbox-series
H: Handlers=event11 
B: PROP=0
B: EV=20001b
B: KEY=1000000000000 0 0 0 0
B: ABS=30027
`)

function metadata(annotation: unknown) {
  return { annotations: { [CDP_INPUT_BRIDGE_PLUGIN_ID]: annotation } }
}

describe("CDP input bridge session lifecycle hook", () => {
  it("starts the bridge from launch metadata and stops it before cleanup", async () => {
    const starts: unknown[] = []
    const stops: string[] = []
    const hook = createCdpInputBridgeSessionLifecycleHook({
      devices: async () => ambiguousDevices,
      processManager: {
        start: async request => {
          starts.push(request)
          return {
            pid: 111,
            stop: async () => {
              stops.push(request.devicePath)
            },
          }
        },
      },
    })

    const handle = await hook.afterChildRunning?.({
      launchId: "launch-1",
      spec: { command: "yfs", args: [] },
      launchMetadata: metadata({
        enable: true,
        cdpPort: 9333,
        mapping: "yfs-default",
        sourcePreference: { names: ["Microsoft Xbox Series S|X Controller"] },
        target: { type: "page", urlPattern: "index.html" },
      }),
    })
    await handle?.stopBeforeCleanup?.()

    expect(starts).toEqual([
      expect.objectContaining({
        launchId: "launch-1",
        devicePath: "/dev/input/event11",
        cdpHost: "127.0.0.1",
        cdpPort: 9333,
        mappingName: "yfs-default",
        axis: { pressThreshold: 12000, releaseThreshold: 8000 },
        target: { type: "page", urlPattern: "index.html" },
      }),
    ])
    expect(handle).toMatchObject({
      label: "cdp-input-bridge",
      resource: "/dev/input/event11",
    })
    expect(stops).toEqual(["/dev/input/event11"])
  })

  it("skips absent or disabled annotations", async () => {
    const starts: unknown[] = []
    const hook = createCdpInputBridgeSessionLifecycleHook({
      devices: async () => ambiguousDevices,
      processManager: {
        start: async request => {
          starts.push(request)
          return { stop: async () => undefined }
        },
      },
    })

    await expect(
      hook.afterChildRunning?.({
        launchId: "launch-1",
        spec: { command: "yfs", args: [] },
      }),
    ).resolves.toBeUndefined()
    await expect(
      hook.afterChildRunning?.({
        launchId: "launch-2",
        spec: { command: "yfs", args: [] },
        launchMetadata: metadata({ enable: false }),
      }),
    ).resolves.toBeUndefined()
    expect(starts).toEqual([])
  })

  it("fails launch before spawning when source selection is ambiguous", async () => {
    const hook = createCdpInputBridgeSessionLifecycleHook({
      devices: async () => ambiguousDevices,
      processManager: {
        start: async () => {
          throw new Error("should not start")
        },
      },
    })

    await expect(
      hook.afterChildRunning?.({
        launchId: "launch-1",
        spec: { command: "yfs", args: [] },
        launchMetadata: metadata({ enable: true, cdpPort: 9333 }),
      }),
    ).rejects.toThrow(/ambiguous InputPlumber virtual controller/)
  })

  it("does not terminate the launched session when bridge exits during cleanup", async () => {
    let resolveExit!: () => void
    let terminated = 0
    const hook = createCdpInputBridgeSessionLifecycleHook({
      devices: async () => ambiguousDevices,
      processManager: {
        start: async () => ({
          stop: async () => undefined,
          exited: new Promise<void>(resolve => {
            resolveExit = resolve
          }),
        }),
      },
    })

    const handle = await hook.afterChildRunning?.({
      launchId: "launch-1",
      spec: { command: "yfs", args: [] },
      terminateLaunch: () => {
        terminated += 1
      },
      launchMetadata: metadata({
        enable: true,
        cdpPort: 9333,
        sourcePreference: { names: ["Microsoft Xbox Series S|X Controller"] },
      }),
    })
    await handle?.stopBeforeCleanup?.()
    resolveExit()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(terminated).toBe(0)
  })

  it("terminates the launched session if the bridge exits unexpectedly", async () => {
    let resolveExit!: () => void
    let terminated = 0
    const hook = createCdpInputBridgeSessionLifecycleHook({
      devices: async () => ambiguousDevices,
      processManager: {
        start: async () => ({
          stop: async () => undefined,
          exited: new Promise<void>(resolve => {
            resolveExit = resolve
          }),
        }),
      },
    })

    await hook.afterChildRunning?.({
      launchId: "launch-1",
      spec: { command: "yfs", args: [] },
      terminateLaunch: () => {
        terminated += 1
      },
      launchMetadata: metadata({
        enable: true,
        cdpPort: 9333,
        sourcePreference: { names: ["Microsoft Xbox Series S|X Controller"] },
      }),
    })
    resolveExit()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(terminated).toBe(1)
  })
})
