import { describe, expect, it, setDefaultTimeout } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const FLAKE_ROOT = resolve(import.meta.dir, "..", "..", "..")
const FIXTURE_PATH = resolve(
  import.meta.dir,
  "korri-live-usb-safety-eval.fixture.nix",
)
const RESOLVER_PATH = resolve(
  FLAKE_ROOT,
  "nix/images/live-usb-persistence-resolver.sh",
)

setDefaultTimeout(30_000)

type SafetyEvalResult = {
  persistence: {
    enabled: boolean
    root: string | null
    bootMountPoint: string | null
    label: string | null
    markerPersistent: string | null
    markerEphemeral: string | null
  }
  kioskState: {
    home: string
    stateHome: string
    dataHome: string
    configHome: string
    environment: Record<string, string>
    wants: string[]
    requires: string[]
    after: string[]
  }
  persistenceService: {
    exists: boolean
    wantedBy: string[]
    before: string[]
    after: string[]
    path: string[]
  }
  safety: {
    fileSystems: string[]
    swapDevices: unknown[]
    services: string[]
    udisks2Enabled: boolean
    gvfsEnabled: boolean
  }
}

function evalFixture(): SafetyEvalResult {
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

  return JSON.parse(child.stdout) as SafetyEvalResult
}

describe("Korri live USB safety evaluation", () => {
  const result = evalFixture()

  it("routes Korri and moonlight client state under USB-scoped persistence", () => {
    expect(result.persistence.enabled).toBe(true)
    expect(result.persistence.root).toBe("/persist/korri-live-usb")
    expect(result.kioskState.home).toBe("/persist/korri-live-usb/home")
    expect(result.kioskState.configHome).toBe(
      "/persist/korri-live-usb/home/.config",
    )
    expect(result.kioskState.dataHome).toBe(
      "/persist/korri-live-usb/home/.local/share",
    )
    expect(result.kioskState.stateHome).toBe(
      "/persist/korri-live-usb/home/.local/state",
    )
    expect(result.kioskState.environment.XDG_CACHE_HOME).toBe(
      "/persist/korri-live-usb/home/.cache",
    )
    expect(result.kioskState.environment.KORRI_MOONLIGHT_STATE_HOME).toBe(
      "/persist/korri-live-usb/home/.cache/moonlight",
    )
  })

  it("orders kiosk startup after the persistence resolver", () => {
    expect(result.persistenceService.exists).toBe(true)
    expect(result.persistenceService.wantedBy).toContain("multi-user.target")
    expect(result.persistenceService.before).toContain("korri-kiosk.service")
    expect(result.kioskState.wants).toContain("korri-live-usb-persistence.service")
    expect(result.kioskState.requires).toContain(
      "korri-live-usb-persistence.service",
    )
    expect(result.kioskState.after).toContain("korri-live-usb-persistence.service")
  })

  it("keeps internal disk mutation surfaces disabled", () => {
    expect(result.safety.fileSystems).not.toContain("/mnt")
    expect(result.safety.fileSystems).not.toContain("/home")
    expect(result.safety.swapDevices).toEqual([])
    expect(result.safety.udisks2Enabled).toBe(false)
    expect(result.safety.gvfsEnabled).toBe(false)
    expect(result.safety.services.join("\n")).not.toMatch(
      /install|partition|repartition|growfs|udisks/i,
    )
  })

  it("uses a runtime sibling-of-boot-device resolver instead of a generic label mount", () => {
    expect(existsSync(RESOLVER_PATH)).toBe(true)
    const resolver = readFileSync(RESOLVER_PATH, "utf8")
    expect(resolver).toContain("findmnt")
    expect(resolver).toContain("lsblk")
    expect(resolver).toContain("PKNAME")
    expect(resolver).toContain("blkid")
    expect(resolver).toContain("KORRI_LIVE_USB_BOOT_MOUNT")
    expect(resolver).not.toContain("/dev/disk/by-label")
  })
})
