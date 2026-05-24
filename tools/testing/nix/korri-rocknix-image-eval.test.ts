import { describe, expect, it, setDefaultTimeout } from "bun:test"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const FLAKE_ROOT = resolve(import.meta.dir, "..", "..", "..")
const FIXTURE_PATH = resolve(
  import.meta.dir,
  "korri-rocknix-image-eval.fixture.nix",
)

setDefaultTimeout(30_000)

type RockNixImageSummary = {
  assertionsPassed: boolean
  assertionMessages: string[]
  serverEnabled: boolean
  serverUser: string | null
  serverServiceMode: string | null
  clientEnabled: boolean
  kioskEnabled: boolean
  inputdEnabled: boolean
  kioskUser: string | null
  kioskCreateUser: boolean | null
  kioskRuntimeDir: string | null
  kioskSessionBusMode: string | null
  kioskSessionBusServices: string[]
  inputProviderName: string | null
  inputProviderServices: string[]
  inputplumberDataDirs: string | null
  inputplumberPackage: string | null
  moonlightCommand: string | null
  moonlightMappingFile: string | null
  moonlightRequireInputPlumber: string | null
  systemName: string
  hostName: string
  systemPackages: string[]
}

type EvalResult = {
  configAttrs: string[]
  targetPackageAttrs: string[]
  hostPackageAttrs: string[]
  packageDrvPaths: {
    thorSystem: string | null
    soboSystem: string | null
    thorRootfs: string | null
    soboRootfs: string | null
  }
  thor: RockNixImageSummary
  sobo: RockNixImageSummary
  byCompatibleWithoutEnv: {
    success: boolean
    value: string | null
  }
}

function evalFixture(): EvalResult {
  const apply = `f: f { flakeRoot = ${FLAKE_ROOT}; }`
  const child = spawnSync(
    "nix",
    [
      "--extra-experimental-features",
      "nix-command flakes",
      "eval",
      "--impure",
      "--json",
      "--file",
      FIXTURE_PATH,
      "--apply",
      apply,
    ],
    {
      cwd: FLAKE_ROOT,
      encoding: "utf8",
      env: { ...process.env, NIX_PATH: "" },
    },
  )

  if (child.status !== 0) {
    throw new Error(`nix eval failed (exit ${child.status}):\n${child.stderr}`)
  }

  return JSON.parse(child.stdout) as EvalResult
}

describe("Korri RockNix image output evaluation", () => {
  const result = evalFixture()

  it("exposes Thor and Sobo RockNix kiosk appliance configuration targets", () => {
    expect(result.configAttrs).toEqual(
      expect.arrayContaining([
        "korri-rocknix-kiosk-thor",
        "korri-rocknix-kiosk-odin2portal",
        "korri-rocknix-kiosk-by-compatible",
      ]),
    )
  })

  it("exposes explicit system and rootfs package aliases", () => {
    expect(result.targetPackageAttrs).toEqual(
      expect.arrayContaining([
        "korri-rocknix-kiosk-system-thor",
        "korri-rocknix-kiosk-system-odin2portal",
      ]),
    )
    expect(result.hostPackageAttrs).toEqual(
      expect.arrayContaining([
        "korri-rocknix-rootfs-thor",
        "korri-rocknix-rootfs-odin2portal",
      ]),
    )
    expect(result.packageDrvPaths.thorSystem).toContain(".drv")
    expect(result.packageDrvPaths.soboSystem).toContain(".drv")
    expect(result.packageDrvPaths.thorRootfs).toContain(".drv")
    expect(result.packageDrvPaths.soboRootfs).toContain(".drv")
  })

  it("keeps Thor and Sobo as full kiosk appliances, never server-only targets", () => {
    for (const appliance of [result.thor, result.sobo]) {
      expect(appliance.assertionsPassed).toBe(true)
      expect(appliance.serverEnabled).toBe(true)
      expect(appliance.serverServiceMode).toBe("system")
      expect(appliance.serverUser).toBe("korri-server")
      expect(appliance.clientEnabled).toBe(true)
      expect(appliance.kioskEnabled).toBe(true)
      expect(appliance.inputdEnabled).toBe(true)
    }
  })

  it("uses the constrained RockNix kiosk session shape", () => {
    for (const appliance of [result.thor, result.sobo]) {
      expect(appliance.kioskUser).toBe("root")
      expect(appliance.kioskCreateUser).toBe(false)
      expect(appliance.kioskRuntimeDir).toBe("/run/user/0")
      expect(appliance.kioskSessionBusMode).toBe("existing")
      expect(appliance.kioskSessionBusServices).toContain(
        "main-space-session-dbus.service",
      )
      expect(appliance.inputProviderName).toBe("inputplumber")
      expect(appliance.inputProviderServices).toContain("inputplumber.service")
      expect(appliance.inputplumberPackage).toContain("inputplumber")
      expect(appliance.inputplumberDataDirs).toContain("/share")
      expect(appliance.inputplumberDataDirs).toContain(
        "/run/current-system/sw/share",
      )
      expect(appliance.moonlightCommand).toContain("moonlight")
      expect(appliance.moonlightMappingFile).toContain("gamecontrollerdb.txt")
      expect(appliance.moonlightRequireInputPlumber).toBe("1")
    }
  })

  it("selects user-launchable RockNix app packages from the substrate", () => {
    for (const appliance of [result.thor, result.sobo]) {
      expect(appliance.systemPackages.join("\n")).toMatch(/cemu/i)
      expect(appliance.systemPackages.join("\n")).toMatch(/moonlight/i)
    }
  })

  it("keeps by-compatible impure instead of making it the off-device gate", () => {
    expect(result.byCompatibleWithoutEnv.success).toBe(false)
  })

  it("keeps generic Korri image modules free of RockNix facts", () => {
    for (const relativePath of [
      "nix/images/common.nix",
      "nix/images/headless.nix",
      "nix/images/kiosk.nix",
      "nix/images/platforms/x86.nix",
    ]) {
      const contents = readFileSync(resolve(FLAKE_ROOT, relativePath), "utf8")
      expect(contents).not.toMatch(/SM8550|RockNix|Odin|Thor|DSI-1|DSI-2/i)
    }
  })
})
