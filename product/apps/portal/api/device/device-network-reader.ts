import { readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import type { DeviceNetworkKind, RawNetworkSnapshot } from "@platform/device/device-facts"

export interface DeviceNetworkReaderOptions {
  readonly netDir?: string
  readonly procNetWirelessPath?: string
  readonly iface?: string
}

export interface DeviceNetworkReaderDependencies {
  readonly readdir?: (path: string) => Promise<readonly string[]>
  readonly readFile?: (path: string, encoding: "utf8") => Promise<string>
  readonly stat?: (path: string) => Promise<{ readonly isDirectory: () => boolean }>
}

export interface DeviceNetworkReader {
  readonly readNetwork: () => Promise<RawNetworkSnapshot>
}

interface NetworkInterfaceSnapshot {
  readonly name: string
  readonly kind: DeviceNetworkKind
  readonly connected: boolean | null
  readonly strengthPercent: number | null
}

const VIRTUAL_PREFIXES = [
  "br-",
  "docker",
  "gre",
  "p2p-dev-",
  "sit",
  "tap",
  "tun",
  "veth",
] as const

export function createDeviceNetworkReader(
  options: DeviceNetworkReaderOptions = {},
  deps: DeviceNetworkReaderDependencies = {},
): DeviceNetworkReader {
  const netDir = options.netDir ?? "/sys/class/net"
  const procNetWirelessPath =
    options.procNetWirelessPath ?? "/proc/net/wireless"
  const readdirImpl = deps.readdir ?? readdir
  const readFileImpl = deps.readFile ?? readFile
  const statImpl = deps.stat ?? stat

  return {
    readNetwork: () =>
      readNetworkSnapshot({
        netDir,
        procNetWirelessPath,
        iface: options.iface,
        readdirImpl,
        readFileImpl,
        statImpl,
      }),
  }
}

async function readNetworkSnapshot({
  netDir,
  procNetWirelessPath,
  iface,
  readdirImpl,
  readFileImpl,
  statImpl,
}: {
  readonly netDir: string
  readonly procNetWirelessPath: string
  readonly iface?: string
  readonly readdirImpl: (path: string) => Promise<readonly string[]>
  readonly readFileImpl: (path: string, encoding: "utf8") => Promise<string>
  readonly statImpl: (path: string) => Promise<{ readonly isDirectory: () => boolean }>
}): Promise<RawNetworkSnapshot> {
  const names = iface ? [iface] : await discoverInterfaceNames(netDir, readdirImpl)
  if (names.length === 0) {
    return { connected: null, kind: null, strengthPercent: null }
  }

  const interfaces = await Promise.all(
    names.map(name =>
      readInterfaceSnapshot({
        netDir,
        procNetWirelessPath,
        name,
        readFileImpl,
        statImpl,
      }),
    ),
  )
  const known = interfaces.filter(snapshot => snapshot.connected !== null)
  const connected = known.filter(snapshot => snapshot.connected)
  const representative =
    connected.find(snapshot => snapshot.kind === "wifi") ??
    connected.find(snapshot => snapshot.kind === "ethernet") ??
    connected[0]

  if (representative) {
    return {
      connected: true,
      kind: representative.kind,
      strengthPercent: representative.strengthPercent,
    }
  }

  if (known.length > 0) {
    return { connected: false, kind: known[0]?.kind ?? null, strengthPercent: null }
  }

  return { connected: null, kind: null, strengthPercent: null }
}

async function discoverInterfaceNames(
  netDir: string,
  readdirImpl: (path: string) => Promise<readonly string[]>,
): Promise<readonly string[]> {
  return (await readdirImpl(netDir))
    .filter(name => !name.includes("/"))
    .filter(name => name !== "lo")
    .filter(name => !VIRTUAL_PREFIXES.some(prefix => name.startsWith(prefix)))
}

async function readInterfaceSnapshot({
  netDir,
  procNetWirelessPath,
  name,
  readFileImpl,
  statImpl,
}: {
  readonly netDir: string
  readonly procNetWirelessPath: string
  readonly name: string
  readonly readFileImpl: (path: string, encoding: "utf8") => Promise<string>
  readonly statImpl: (path: string) => Promise<{ readonly isDirectory: () => boolean }>
}): Promise<NetworkInterfaceSnapshot> {
  const base = join(netDir, name)
  const kind: DeviceNetworkKind = (await isDirectory(join(base, "wireless"), statImpl))
    ? "wifi"
    : "ethernet"
  const operstate = await readOptionalText(join(base, "operstate"), readFileImpl)
  const carrier =
    operstate === "down" ? null : await readOptionalCarrier(join(base, "carrier"), readFileImpl)
  const connected = connectedForOperstate(operstate, carrier)
  const strengthPercent =
    kind === "wifi"
      ? await signalPercentForInterface(name, procNetWirelessPath, readFileImpl)
      : null
  return {
    name,
    kind,
    connected,
    strengthPercent,
  }
}

function connectedForOperstate(
  operstate: string | null,
  carrier: boolean | null,
): boolean | null {
  switch (operstate) {
    case "up":
      return true
    case "down":
    case "lowerlayerdown":
    case "notpresent":
      return false
    case "dormant":
    case "testing":
      return null
    case "unknown":
      return carrier === null ? null : carrier
    default:
      return carrier
  }
}

async function signalPercentForInterface(
  name: string,
  procNetWirelessPath: string,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<number | null> {
  const text = await readOptionalText(procNetWirelessPath, readFileImpl)
  const line = text
    ?.split("\n")
    .find(entry => entry.trimStart().startsWith(`${name}:`))
  if (!line) return null
  const parts = line.trim().split(/\s+/)
  const dbm = Number.parseFloat(parts[3]?.replace(".", "") ?? "")
  if (!Number.isFinite(dbm)) return null
  return Math.max(0, Math.min(100, Math.round(2 * (dbm + 100))))
}

async function readOptionalCarrier(
  path: string,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<boolean | null> {
  const text = await readOptionalText(path, readFileImpl)
  if (text === null) return null
  return text.trim() === "1"
}

async function readOptionalText(
  path: string,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<string | null> {
  try {
    const text = (await readFileImpl(path, "utf8")).trim()
    return text.length === 0 ? null : text
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT" || code === "EINVAL" || code === "ENODEV") {
      return null
    }
    throw error
  }
}

async function isDirectory(
  path: string,
  statImpl: (path: string) => Promise<{ readonly isDirectory: () => boolean }>,
): Promise<boolean> {
  try {
    return (await statImpl(path)).isDirectory()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}
