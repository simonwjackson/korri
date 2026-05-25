import { describe, expect, it, setDefaultTimeout } from "bun:test"
// This file is already module-load batched: `evalFixture()` runs once at
// the `describe()` body, and every `it()` reads from the shared `result`.
// Per-test reported ms is ~0; the whole file runs in one nix eval. See
// docs/plans/2026-05-24-006-refactor-nix-test-harness-plan.md U5 and the
// exemplar in tools/testing/nix/korri-desktop-build-graph.test.ts.
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
  firewallUdpPorts: number[]
  kioskUnitExists: boolean
  inputProviderEnabled: boolean
  kioskAfter: string[]
  kioskUser: string | null
  kioskUserExtraGroups: string[]
  kioskEnvironment: Record<string, string>
  kioskPath: string[]
  clientMainProgram: string | null
  systemName: string
}

type EvalResult = {
  packageAttrs: string[]
  checkAttrs: string[]
  appAttrs: string[]
  packageDrvPaths: {
    headless: string | null
    kiosk: string | null
    liveIso: string | null
    liveDeveloperIso: string | null
  }
  checkDrvPaths: {
    liveConfig: string | null
    liveDeveloperConfig: string | null
    vmSmoke: string | null
  }
  headless: ImageSummary
  kiosk: ImageSummary
  liveUsb: ImageSummary & {
    imageFileName: string | null
    makeUsbBootable: boolean
    makeEfiBootable: boolean
    persistenceArtifact: "product" | "developer" | null
    persistenceScope: "product-allowlist" | "developer-broad" | null
  }
  liveUsbDeveloper: ImageSummary & {
    imageFileName: string | null
    makeUsbBootable: boolean
    makeEfiBootable: boolean
    persistenceArtifact: "product" | "developer" | null
    persistenceScope: "product-allowlist" | "developer-broad" | null
  }
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

  it("exposes flake-native live USB validation surfaces", () => {
    expect(result.checkAttrs).toContain("korri-live-usb-config")
    expect(result.checkAttrs).toContain("korri-live-usb-developer-config")
    expect(result.checkAttrs).toContain("korri-live-usb-vm-smoke")
    expect(result.checkDrvPaths.liveConfig).toContain(".drv")
    expect(result.checkDrvPaths.liveDeveloperConfig).toContain(".drv")
    expect(result.checkDrvPaths.vmSmoke).toContain(".drv")
    expect(result.appAttrs).toEqual(
      expect.arrayContaining([
        "korri-live-usb-vm",
        "korri-live-usb-qemu",
        "korri-live-usb-qemu-persistence",
        "korri-live-usb-developer-qemu",
        "korri-live-usb-developer-qemu-persistence",
      ]),
    )
  })

  it("exposes a bootable x86 live USB ISO kiosk image", () => {
    expect(result.packageAttrs).toContain("korri-kiosk-live-iso")
    expect(result.packageAttrs).toContain("korri-kiosk-live-developer-iso")
    expect(result.packageDrvPaths.liveIso).toContain(".drv")
    expect(result.packageDrvPaths.liveDeveloperIso).toContain(".drv")
    expect(result.liveUsb.assertionsPassed).toBe(true)
    expect(result.liveUsb.kioskEnabled).toBe(true)
    expect(result.liveUsb.clientEnabled).toBe(true)
    expect(result.liveUsb.inputdEnabled).toBe(true)
    expect(result.liveUsb.inputProviderEnabled).toBe(true)
    expect(result.liveUsb.clientMainProgram).toBe("korri-desktop-x86-kiosk")
    expect(result.liveUsb.kioskEnvironment.KORRI_DESKTOP_INPUTD_URL).toBe(
      "ws://127.0.0.1:3002",
    )
    expect(result.liveUsb.kioskEnvironment.KORRI_MOONLIGHT_COMMAND).toMatch(
      /moonlight-embedded.*\/bin\/moonlight/,
    )
    expect(result.liveUsb.kioskEnvironment.KORRI_MOONLIGHT_CLIENT).toBe(
      "embedded",
    )
    expect(
      result.liveUsb.kioskEnvironment.KORRI_MOONLIGHT_STARTUP_OBSERVE_MS,
    ).toBe("750")
    expect(result.liveUsb.kioskPath.join("\n")).toMatch(/moonlight-embedded/)
    expect(result.liveUsb.kioskPath.join("\n")).not.toMatch(/moonlight-qt/)
    expect(result.liveUsb.firewallUdpPorts).toContain(5353)
    expect(result.liveUsb.firewallTcpPorts).toEqual([])
    expect(result.liveUsb.makeUsbBootable).toBe(true)
    expect(result.liveUsb.makeEfiBootable).toBe(true)
    expect(result.liveUsb.imageFileName).toContain("korri-kiosk")
    expect(result.liveUsb.imageFileName).not.toContain("developer")
    expect(result.liveUsb.persistenceArtifact).toBe("product")
    expect(result.liveUsb.persistenceScope).toBe("product-allowlist")
    expect(result.liveUsbDeveloper.assertionsPassed).toBe(true)
    expect(result.liveUsbDeveloper.imageFileName).toContain("developer")
    expect(result.liveUsbDeveloper.persistenceArtifact).toBe("developer")
    expect(result.liveUsbDeveloper.persistenceScope).toBe("developer-broad")
    expect(
      result.liveUsbDeveloper.kioskEnvironment.KORRI_LIVE_USB_ARTIFACT,
    ).toBe("developer")
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
