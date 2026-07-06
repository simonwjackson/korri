import { describe, expect, it } from "bun:test"
import { join } from "node:path"
import { createDeviceNetworkReader } from "./device-network-reader"

const netDir = "/sys/class/net"
const wirelessPath = "/proc/net/wireless"

type Files = Record<string, string>

function deps(
  files: Files,
  dirs: readonly string[] = [],
  commands: Readonly<Record<string, string>> = {},
) {
  return {
    readdir: async (path: string) => {
      if (path !== netDir)
        throw Object.assign(new Error(path), { code: "ENOENT" })
      return Object.keys(files)
        .filter(file => file.startsWith(`${netDir}/`))
        .map(file => file.slice(`${netDir}/`.length).split("/")[0])
        .filter((value, index, all) => all.indexOf(value) === index)
    },
    readFile: async (path: string) => {
      const value = files[path]
      if (value === undefined)
        throw Object.assign(new Error(path), { code: "ENOENT" })
      return value
    },
    stat: async (path: string) => {
      if (!dirs.includes(path))
        throw Object.assign(new Error(path), { code: "ENOENT" })
      return { isDirectory: () => true }
    },
    command: async (command: readonly string[]) => ({
      exitCode: commands[command.join(" ")] === undefined ? 1 : 0,
      stdout: commands[command.join(" ")] ?? "",
    }),
  }
}

function iface(name: string, file: string): string {
  return join(netDir, name, file)
}

describe("createDeviceNetworkReader", () => {
  it("reads a connected wifi interface with wireless name and signal", async () => {
    const reader = createDeviceNetworkReader(
      { netDir, procNetWirelessPath: wirelessPath },
      deps(
        {
          [iface("wlan0", "operstate")]: "up\n",
          [iface("wlan0", "carrier")]: "1\n",
          [wirelessPath]:
            "Inter-| sta-| Quality | Discarded\n wlan0: 0000 70. -60. -95. 0 0 0\n",
        },
        [iface("wlan0", "wireless")],
        {
          "iw dev wlan0 link":
            "Connected to 00:11:22:33:44:55 (on wlan0)\n\tSSID: KorriNet\n\tsignal: -60 dBm\n",
        },
      ),
    )

    await expect(reader.readNetwork()).resolves.toEqual({
      connected: true,
      kind: "wifi",
      name: "KorriNet",
      strengthPercent: 80,
    })
  })

  it("reads a connected ethernet interface without signal", async () => {
    const reader = createDeviceNetworkReader(
      { netDir, procNetWirelessPath: wirelessPath },
      deps({
        [iface("eth0", "operstate")]: "up\n",
        [iface("eth0", "carrier")]: "1\n",
      }),
    )

    await expect(reader.readNetwork()).resolves.toEqual({
      connected: true,
      kind: "ethernet",
      name: null,
      strengthPercent: null,
    })
  })

  it("ignores loopback and virtual interfaces", async () => {
    const reader = createDeviceNetworkReader(
      { netDir, procNetWirelessPath: wirelessPath },
      deps(
        {
          [iface("lo", "operstate")]: "up\n",
          [iface("docker0", "operstate")]: "up\n",
          [iface("wlan0", "operstate")]: "down\n",
        },
        [iface("wlan0", "wireless")],
      ),
    )

    await expect(reader.readNetwork()).resolves.toEqual({
      connected: false,
      kind: "wifi",
      name: null,
      strengthPercent: null,
    })
  })

  it("honors an explicit interface override", async () => {
    const reader = createDeviceNetworkReader(
      { netDir, procNetWirelessPath: wirelessPath, iface: "wlan1" },
      deps(
        {
          [iface("eth0", "operstate")]: "up\n",
          [iface("wlan1", "operstate")]: "up\n",
          [iface("wlan1", "carrier")]: "1\n",
        },
        [iface("wlan1", "wireless")],
      ),
    )

    await expect(reader.readNetwork()).resolves.toMatchObject({
      connected: true,
      kind: "wifi",
    })
  })

  it("uses carrier when operstate is unknown", async () => {
    const reader = createDeviceNetworkReader(
      { netDir, procNetWirelessPath: wirelessPath },
      deps({
        [iface("wlan0", "operstate")]: "unknown\n",
        [iface("wlan0", "carrier")]: "1\n",
      }),
    )

    await expect(reader.readNetwork()).resolves.toMatchObject({
      connected: true,
    })
  })

  it("returns unknown when no reliable physical interface can be classified", async () => {
    const reader = createDeviceNetworkReader(
      { netDir, procNetWirelessPath: wirelessPath },
      deps({
        [iface("wlan0", "operstate")]: "dormant\n",
      }),
    )

    await expect(reader.readNetwork()).resolves.toEqual({
      connected: null,
      kind: null,
      name: null,
      strengthPercent: null,
    })
  })
})
