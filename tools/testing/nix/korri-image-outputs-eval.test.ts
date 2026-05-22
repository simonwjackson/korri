import { describe, expect, it, setDefaultTimeout } from "bun:test"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const FLAKE_ROOT = resolve(import.meta.dir, "..", "..", "..")
const FIXTURE_PATH = resolve(
  import.meta.dir,
  "korri-image-outputs-eval.fixture.nix",
)
const HARDWARE_FACT_PATTERN = /SM8550|AYN|Odin|DSI-1|DSI-2|UCM|RockNix/i

setDefaultTimeout(30_000)

type ImageSummary = {
  assertionsPassed: boolean
  assertionMessages: string[]
  serverEnabled: boolean
  clientEnabled: boolean
  kioskEnabled: boolean
  inputdEnabled: boolean
  serverHost: string | null
  serverServiceMode: string | null
  firewallTcpPorts: number[]
  kioskUnitExists: boolean
  inputProviderEnabled: boolean
  kioskAfter: string[]
  kioskUser: string | null
  kioskUserExtraGroups: string[]
  systemName: string
}

type EvalResult = {
  packageAttrs: string[]
  packageDrvPaths: {
    headless: string | null
    kiosk: string | null
  }
  headless: ImageSummary
  kiosk: ImageSummary
  kioskWithExternalPlatform: ImageSummary
  kioskWithPlatformManagedUser: ImageSummary
  kioskWithoutPlatform: ImageSummary
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

describe("Korri Nix image output evaluation", () => {
  const result = evalFixture()

  it("exposes discoverable baseline product system outputs", () => {
    expect(result.packageAttrs).toEqual(
      expect.arrayContaining(["korri-headless-system", "korri-kiosk-system"]),
    )
    expect(result.packageDrvPaths.headless).toContain(".drv")
    expect(result.packageDrvPaths.kiosk).toContain(".drv")
  })

  it("headless composition enables the server without GUI or appliance services", () => {
    expect(result.headless.assertionsPassed).toBe(true)
    expect(result.headless.serverEnabled).toBe(true)
    expect(result.headless.serverServiceMode).toBe("system")
    expect(result.headless.clientEnabled).toBe(false)
    expect(result.headless.kioskEnabled).toBe(false)
    expect(result.headless.inputdEnabled).toBe(false)
    expect(result.headless.kioskUnitExists).toBe(false)
  })

  it("kiosk composition enables kiosk, client, input integration, and local server conservatively", () => {
    expect(result.kiosk.assertionsPassed).toBe(true)
    expect(result.kiosk.serverEnabled).toBe(true)
    expect(result.kiosk.serverHost).toBe("127.0.0.1")
    expect(result.kiosk.serverServiceMode).toBe("system")
    expect(result.kiosk.firewallTcpPorts).toEqual([])
    expect(result.kiosk.kioskEnabled).toBe(true)
    expect(result.kiosk.clientEnabled).toBe(true)
    expect(result.kiosk.inputdEnabled).toBe(true)
    expect(result.kiosk.inputProviderEnabled).toBe(true)
    expect(result.kiosk.kioskUser).toBe("korri-kiosk")
    expect(result.kiosk.kioskUserExtraGroups).toEqual(
      expect.arrayContaining(["input", "render", "seat", "video"]),
    )
  })

  it("accepts externally supplied platform adapter modules at the image boundary", () => {
    expect(result.kioskWithExternalPlatform.assertionsPassed).toBe(true)
    expect(result.kioskWithExternalPlatform.kioskAfter).toContain(
      "external-normalized-input.service",
    )
  })

  it("leaves platform-managed kiosk users under platform ownership", () => {
    expect(result.kioskWithPlatformManagedUser.assertionsPassed).toBe(true)
    expect(result.kioskWithPlatformManagedUser.kioskUser).toBe("platform-kiosk")
    expect(result.kioskWithPlatformManagedUser.kioskUserExtraGroups).toEqual([])
  })

  it("fails clearly when a kiosk image is requested without a platform input adapter", () => {
    expect(result.kioskWithoutPlatform.assertionsPassed).toBe(false)
    expect(result.kioskWithoutPlatform.assertionMessages.join("\n")).toContain(
      "services.korri.kiosk.input.required",
    )
  })

  it("keeps platform-specific facts out of common image modules and x86 defaults", () => {
    for (const relativePath of [
      "nix/images/common.nix",
      "nix/images/headless.nix",
      "nix/images/kiosk.nix",
      "nix/images/platforms/x86.nix",
    ]) {
      const contents = readFileSync(resolve(FLAKE_ROOT, relativePath), "utf8")
      expect(contents).not.toMatch(HARDWARE_FACT_PATTERN)
    }
  })
})
