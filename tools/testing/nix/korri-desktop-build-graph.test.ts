import { describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const FLAKE_ROOT = resolve(import.meta.dir, "..", "..", "..")
const FIXTURE_PATH = resolve(
  import.meta.dir,
  "korri-desktop-build-graph.fixture.nix",
)

interface BuildGraphEval {
  hostUnwrappedDrvPath: string
  deviceUnwrappedDrvPath: string
  unwrappedDrvPath: string
  hostDrvPath: string
  deviceDrvPath: string
  deviceHasPkgs2405Webkit: boolean
  deviceHasPkgs2405Gtk: boolean
  deviceHasPkgs2405Libsoup: boolean
  deviceHasPkgs2405Librsvg: boolean
  deviceHasPkgs2405AtSpi: boolean
  hostHasPkgs2405Webkit: boolean
  hostHasPkgs2405Gtk: boolean
}

function evalBuildGraph(): BuildGraphEval {
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

  return JSON.parse(child.stdout) as BuildGraphEval
}

describe("korri-desktop build graph", () => {
  const result = evalBuildGraph()

  describe("unwrapped sharing", () => {
    it("host wrapper derives from the shared unwrapped", () => {
      expect(result.hostUnwrappedDrvPath).toBe(result.unwrappedDrvPath)
    })

    it("device wrapper derives from the shared unwrapped", () => {
      expect(result.deviceUnwrappedDrvPath).toBe(result.unwrappedDrvPath)
    })

    it("host and device wrappers share the same unwrapped drvPath", () => {
      expect(result.hostUnwrappedDrvPath).toBe(result.deviceUnwrappedDrvPath)
    })
  })

  describe("variant identity", () => {
    it("host and device produce distinct wrapper derivations", () => {
      expect(result.hostDrvPath).not.toBe(result.deviceDrvPath)
    })
  })

  describe("device closure cohesion", () => {
    it("device wrap pins pkgs2405 webkitgtk_4_1", () => {
      expect(result.deviceHasPkgs2405Webkit).toBe(true)
    })

    it("device wrap pins pkgs2405 gtk3", () => {
      expect(result.deviceHasPkgs2405Gtk).toBe(true)
    })

    it("device wrap pins pkgs2405 libsoup_3", () => {
      expect(result.deviceHasPkgs2405Libsoup).toBe(true)
    })

    // Anti-regression for the librsvg + at-spi2-core finding from
    // se-feasibility-reviewer on docs/plans/2026-05-20-005-…-plan.md.
    // Missing these from the callPackage overrides would silently
    // auto-fill from current nixpkgs and break the cohesive WebKitGTK
    // 2.44.3 closure.
    it("device wrap pins pkgs2405 librsvg (anti-regression)", () => {
      expect(result.deviceHasPkgs2405Librsvg).toBe(true)
    })

    it("device wrap pins pkgs2405 at-spi2-core (anti-regression)", () => {
      expect(result.deviceHasPkgs2405AtSpi).toBe(true)
    })
  })

  describe("host variant isolation", () => {
    it("host wrap contains no pkgs2405 webkitgtk_4_1 (no closure leak)", () => {
      expect(result.hostHasPkgs2405Webkit).toBe(false)
    })

    it("host wrap contains no pkgs2405 gtk3 (no closure leak)", () => {
      expect(result.hostHasPkgs2405Gtk).toBe(false)
    })
  })
})
