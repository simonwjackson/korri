import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

export interface DeviceControlOptions {
  readonly backlightDir?: string
  readonly powerSupplyDir?: string
}

export interface DeviceControlDependencies {
  readonly readdir?: (path: string) => Promise<readonly string[]>
  readonly readFile?: (path: string, encoding: "utf8") => Promise<string>
  readonly writeFile?: (path: string, content: string) => Promise<void>
}

export interface DeviceControlService {
  readonly backlightDir: string
  readonly powerSupplyDir: string
  readonly readBacklights: () => Promise<BacklightSnapshot>
  readonly readBattery: () => Promise<BatterySnapshot>
  readonly setBacklightPercent: (
    percent: number,
    device?: string,
  ) => Promise<BacklightSetResult>
}

export interface BacklightDeviceState {
  readonly name: string
  readonly brightness: number
  readonly maxBrightness: number
  readonly percent: number
}

export interface BacklightSnapshot {
  readonly devices: readonly BacklightDeviceState[]
  readonly percent: number | null
}

export interface BacklightSetResult extends BacklightSnapshot {
  readonly requestedPercent: number
  readonly requestedDevice?: string
}

export interface PowerSupplyState {
  readonly name: string
  readonly type: string | null
  readonly status: string | null
  readonly capacity: number | null
  readonly online: boolean | null
  readonly voltageNow: number | null
  readonly currentNow: number | null
  readonly powerNow: number | null
  readonly modelName: string | null
}

export interface BatterySnapshot {
  readonly percent: number | null
  readonly status: string | null
  readonly supplies: readonly PowerSupplyState[]
}

export function createDeviceControlService(
  options: DeviceControlOptions = {},
  deps: DeviceControlDependencies = {},
): DeviceControlService {
  const backlightDir = options.backlightDir ?? "/sys/class/backlight"
  const powerSupplyDir = options.powerSupplyDir ?? "/sys/class/power_supply"
  const readdirImpl = deps.readdir ?? readdir
  const readFileImpl = deps.readFile ?? readFile
  const writeFileImpl = deps.writeFile ?? writeFile

  return {
    backlightDir,
    powerSupplyDir,
    readBacklights: () =>
      readBacklightSnapshot(backlightDir, readdirImpl, readFileImpl),
    readBattery: () =>
      readBatterySnapshot(powerSupplyDir, readdirImpl, readFileImpl),
    setBacklightPercent: (percent, device) =>
      writeBacklightPercent(
        backlightDir,
        percent,
        device,
        readdirImpl,
        readFileImpl,
        writeFileImpl,
      ),
  }
}

async function writeBacklightPercent(
  dir: string,
  percent: number,
  device: string | undefined,
  readdirImpl: (path: string) => Promise<readonly string[]>,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
  writeFileImpl: (path: string, content: string) => Promise<void>,
): Promise<BacklightSetResult> {
  const devices = await listBacklightDeviceNames(dir, readdirImpl)
  if (devices.length === 0) throw new Error(`no backlight devices in ${dir}`)
  const targets = device ? [device] : devices
  for (const name of targets) {
    if (!devices.includes(name))
      throw new Error(`unknown backlight device ${name}`)
    const maxBrightness = await readPositiveInteger(
      join(dir, name, "max_brightness"),
      readFileImpl,
    )
    const brightness = Math.round((maxBrightness * percent) / 100)
    await writeFileImpl(join(dir, name, "brightness"), `${brightness}\n`)
  }
  return {
    requestedPercent: percent,
    ...(device ? { requestedDevice: device } : {}),
    ...(await readBacklightSnapshot(dir, readdirImpl, readFileImpl)),
  }
}

async function readBacklightSnapshot(
  dir: string,
  readdirImpl: (path: string) => Promise<readonly string[]>,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<BacklightSnapshot> {
  const names = await listBacklightDeviceNames(dir, readdirImpl)
  if (names.length === 0) throw new Error(`no backlight devices in ${dir}`)
  const devices = await Promise.all(
    names.map(async name => {
      const [brightness, maxBrightness] = await Promise.all([
        readNonNegativeInteger(join(dir, name, "brightness"), readFileImpl),
        readPositiveInteger(join(dir, name, "max_brightness"), readFileImpl),
      ])
      return {
        name,
        brightness,
        maxBrightness,
        percent: Math.round((brightness * 100) / maxBrightness),
      }
    }),
  )
  return {
    devices,
    percent:
      devices.length === 0
        ? null
        : Math.round(
            devices.reduce((sum, device) => sum + device.percent, 0) /
              devices.length,
          ),
  }
}

async function listBacklightDeviceNames(
  dir: string,
  readdirImpl: (path: string) => Promise<readonly string[]>,
): Promise<readonly string[]> {
  return (await readdirImpl(dir)).filter(name => !name.includes("/"))
}

async function readBatterySnapshot(
  dir: string,
  readdirImpl: (path: string) => Promise<readonly string[]>,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<BatterySnapshot> {
  const names = (await readdirImpl(dir)).filter(name => !name.includes("/"))
  if (names.length === 0) throw new Error(`no power supplies in ${dir}`)
  const supplies = await Promise.all(
    names.map(async name => readPowerSupply(dir, name, readFileImpl)),
  )
  const batteries = supplies.filter(supply => supply.type === "Battery")
  const primary =
    batteries.find(supply => supply.capacity !== null) ?? batteries[0]
  return {
    percent: primary?.capacity ?? null,
    status: primary?.status ?? null,
    supplies,
  }
}

async function readPowerSupply(
  dir: string,
  name: string,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<PowerSupplyState> {
  const readOptional = (file: string) =>
    readOptionalText(join(dir, name, file), readFileImpl)
  const [
    type,
    status,
    capacity,
    online,
    voltageNow,
    currentNow,
    powerNow,
    modelName,
  ] = await Promise.all([
    readOptional("type"),
    readOptional("status"),
    readOptionalInteger(join(dir, name, "capacity"), readFileImpl),
    readOptionalInteger(join(dir, name, "online"), readFileImpl),
    readOptionalInteger(join(dir, name, "voltage_now"), readFileImpl),
    readOptionalInteger(join(dir, name, "current_now"), readFileImpl),
    readOptionalInteger(join(dir, name, "power_now"), readFileImpl),
    readOptional("model_name"),
  ])
  return {
    name,
    type,
    status,
    capacity,
    online: online === null ? null : online !== 0,
    voltageNow,
    currentNow,
    powerNow,
    modelName,
  }
}

async function readOptionalText(
  path: string,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<string | null> {
  try {
    const text = (await readFileImpl(path, "utf8")).trim()
    return text.length === 0 ? null : text
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

async function readOptionalInteger(
  path: string,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<number | null> {
  const text = await readOptionalText(path, readFileImpl)
  if (text === null) return null
  const value = Number.parseInt(text, 10)
  return Number.isInteger(value) ? value : null
}

async function readPositiveInteger(
  path: string,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<number> {
  const value = await readNonNegativeInteger(path, readFileImpl)
  if (value <= 0) throw new Error(`${path} must be > 0`)
  return value
}

async function readNonNegativeInteger(
  path: string,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<number> {
  const value = Number.parseInt((await readFileImpl(path, "utf8")).trim(), 10)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${path} is not a non-negative integer`)
  }
  return value
}
