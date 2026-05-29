import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { finalizeRocknixProductPayload } from "./rocknix-product-payload-finalize"

const sourceSha = "a".repeat(64)
const seedSha = "b".repeat(64)
const cleanRevision = "9f0ed234b4eff39f76801c09daedc9795c8b07fb"

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "korri-product-payload-finalize-"))
}

function writeCandidate(dir: string, overrides: Record<string, string> = {}) {
  const fields = {
    PRODUCT_AUTHORITY_REPO: "simonwjackson/korri",
    PRODUCT_REV: cleanRevision,
    PRODUCT_SOURCE_SHA256: "",
    PRODUCT_SOURCE_SUBDIR: ".",
    PRODUCT_BUILD_TARGET:
      ".#nixosConfigurations.korri-rocknix-kiosk-odin2portal.config.system.build.toplevel",
    PRODUCT_ROOTFS_SEED_REV: cleanRevision,
    PRODUCT_ROOTFS_SEED_DEVICE: "odin2portal",
    PRODUCT_ROOTFS_SEED_COMPATIBLE: "ayn,odin2portal",
    PRODUCT_ROOTFS_SEED_ARCHIVE:
      "rocknix-guest-rootfs-odin2portal-9f0ed234b4ef.tar.zst",
    PRODUCT_ROOTFS_SEED_SHA256: seedSha,
    PRODUCT_ROOTFS_SEED_URL: "",
    PRODUCT_ROOTFS_SEED_URLS: "",
    PRODUCT_REV_CLEAN: "1",
    PRODUCT_SUBSTRATE_REV: "fb2518336b1b28d1e6bfffbdc5e3c9d03a43fd76",
    ...overrides,
  }
  const path = join(dir, "candidate-product-payload.lock")
  writeFileSync(
    path,
    Object.entries(fields)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n"),
  )
  return path
}

describe("RockNix product payload finalizer", () => {
  test("emits deterministic sourceable lock and environment files", () => {
    const dir = makeTempDir()
    try {
      const candidateLockPath = writeCandidate(dir)
      const result = finalizeRocknixProductPayload({
        candidateLockPath,
        outputDir: join(dir, "final"),
        sourceSha256: sourceSha,
        productRevision: cleanRevision,
        seedUrls: [
          "https://github.com/simonwjackson/korri/releases/download/product-payload/asset-123.tar.zst",
        ],
      })

      expect(result.lockPath.endsWith("product-payload-odin2portal.lock")).toBe(
        true,
      )
      expect(result.envPath.endsWith("product-payload-odin2portal.env")).toBe(
        true,
      )
      const lock = readFileSync(result.lockPath, "utf8")
      expect(lock).toContain(`PRODUCT_AUTHORITY_REPO="simonwjackson/korri"`)
      expect(lock).toContain(`PRODUCT_REV="${cleanRevision}"`)
      expect(lock).toContain(`PRODUCT_SOURCE_SHA256="${sourceSha}"`)
      expect(lock).toContain(`PRODUCT_ROOTFS_SEED_DEVICE="odin2portal"`)
      expect(lock).toContain(`PRODUCT_ROOTFS_SEED_SHA256="${seedSha}"`)

      const env = readFileSync(result.envPath, "utf8")
      expect(env).toContain(`PKG_NIX_GUEST_AUTHORITY_NAME="korri"`)
      expect(env).toContain(
        `PKG_NIX_GUEST_URL="https://api.github.com/repos/simonwjackson/korri/tarball/${cleanRevision}"`,
      )
      expect(env).toContain(
        `PKG_NIX_GUEST_ROOTFS_SEED_URLS="https://github.com/simonwjackson/korri/releases/download/product-payload/asset-123.tar.zst"`,
      )

      const syntax = spawnSync("bash", ["-n", result.lockPath])
      expect(syntax.status).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("runs through the CLI flags used by the workflow", () => {
    const dir = makeTempDir()
    try {
      const outputDir = join(dir, "final")
      const cli = spawnSync(
        "bun",
        [
          "tools/artifacts/rocknix-product-payload-finalize.ts",
          "--candidate",
          writeCandidate(dir),
          "--out",
          outputDir,
          "--product-rev",
          cleanRevision,
          "--source-sha256",
          sourceSha,
          "--seed-url",
          "https://github.com/simonwjackson/korri/releases/download/product-payload/asset-1.tar.zst",
          "--seed-url",
          "https://github.com/simonwjackson/korri/releases/download/product-payload/asset-2.tar.zst",
        ],
        { cwd: process.cwd() },
      )

      expect(cli.status).toBe(0)
      expect(
        readFileSync(
          join(outputDir, "product-payload-odin2portal.lock"),
          "utf8",
        ),
      ).toContain(
        `PRODUCT_ROOTFS_SEED_URLS="https://github.com/simonwjackson/korri/releases/download/product-payload/asset-1.tar.zst https://github.com/simonwjackson/korri/releases/download/product-payload/asset-2.tar.zst"`,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("preserves ordered multiple seed URLs", () => {
    const dir = makeTempDir()
    try {
      const result = finalizeRocknixProductPayload({
        candidateLockPath: writeCandidate(dir),
        outputDir: join(dir, "final"),
        sourceSha256: sourceSha,
        productRevision: cleanRevision,
        seedUrls: [
          "https://github.com/simonwjackson/korri/releases/download/product-payload/asset-1.tar.zst",
          "https://github.com/simonwjackson/korri/releases/download/product-payload/asset-2.tar.zst",
        ],
      })

      expect(readFileSync(result.lockPath, "utf8")).toContain(
        `PRODUCT_ROOTFS_SEED_URLS="https://github.com/simonwjackson/korri/releases/download/product-payload/asset-1.tar.zst https://github.com/simonwjackson/korri/releases/download/product-payload/asset-2.tar.zst"`,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("rejects missing external source SHA and does not write partial output", () => {
    const dir = makeTempDir()
    try {
      const outputDir = join(dir, "final")
      expect(() =>
        finalizeRocknixProductPayload({
          candidateLockPath: writeCandidate(dir),
          outputDir,
          sourceSha256: "",
          productRevision: cleanRevision,
          seedUrls: [
            "https://github.com/simonwjackson/korri/releases/download/product-payload/asset-123.tar.zst",
          ],
        }),
      ).toThrow("source SHA256")
      expect(() =>
        readFileSync(
          join(outputDir, "product-payload-odin2portal.lock"),
          "utf8",
        ),
      ).toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("requires an explicit clean Korri revision", () => {
    const dir = makeTempDir()
    try {
      expect(() =>
        finalizeRocknixProductPayload({
          candidateLockPath: writeCandidate(dir),
          outputDir: join(dir, "final"),
          sourceSha256: sourceSha,
          productRevision: "",
          seedUrls: [
            "https://github.com/simonwjackson/korri/releases/download/product-payload/asset-123.tar.zst",
          ],
        }),
      ).toThrow("clean Korri revision")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("rejects a dirty or mismatched candidate revision", () => {
    const dir = makeTempDir()
    try {
      expect(() =>
        finalizeRocknixProductPayload({
          candidateLockPath: writeCandidate(dir, {
            PRODUCT_REV: `${cleanRevision}-dirty`,
            PRODUCT_ROOTFS_SEED_REV: `${cleanRevision}-dirty`,
            PRODUCT_REV_CLEAN: "0",
          }),
          outputDir: join(dir, "final"),
          sourceSha256: sourceSha,
          productRevision: cleanRevision,
          seedUrls: [
            "https://github.com/simonwjackson/korri/releases/download/product-payload/asset-123.tar.zst",
          ],
        }),
      ).toThrow("clean Korri revision")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("emits device-named lock and environment files for Thor", () => {
    const dir = makeTempDir()
    try {
      const result = finalizeRocknixProductPayload({
        candidateLockPath: writeCandidate(dir, {
          PRODUCT_BUILD_TARGET:
            ".#nixosConfigurations.korri-rocknix-kiosk-thor.config.system.build.toplevel",
          PRODUCT_ROOTFS_SEED_DEVICE: "thor",
          PRODUCT_ROOTFS_SEED_COMPATIBLE: "ayn,thor",
          PRODUCT_ROOTFS_SEED_ARCHIVE:
            "rocknix-guest-rootfs-thor-9f0ed234b4ef.tar.zst",
        }),
        outputDir: join(dir, "final"),
        sourceSha256: sourceSha,
        productRevision: cleanRevision,
        seedUrls: [
          "https://github.com/simonwjackson/korri/releases/download/product-payload/thor-asset.tar.zst",
        ],
      })

      expect(result.lockPath.endsWith("product-payload-thor.lock")).toBe(true)
      expect(result.envPath.endsWith("product-payload-thor.env")).toBe(true)
      expect(readFileSync(result.lockPath, "utf8")).toContain(
        `PRODUCT_ROOTFS_SEED_DEVICE="thor"`,
      )
      expect(readFileSync(result.envPath, "utf8")).toContain(
        `PKG_NIX_GUEST_ROOTFS_SEED_COMPATIBLE="ayn,thor"`,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("rejects a seed archive whose device prefix does not match the declared device", () => {
    const dir = makeTempDir()
    try {
      expect(() =>
        finalizeRocknixProductPayload({
          candidateLockPath: writeCandidate(dir, {
            PRODUCT_ROOTFS_SEED_DEVICE: "thor",
            PRODUCT_ROOTFS_SEED_COMPATIBLE: "ayn,thor",
            PRODUCT_ROOTFS_SEED_ARCHIVE:
              "rocknix-guest-rootfs-odin2portal-9f0ed234b4ef.tar.zst",
          }),
          outputDir: join(dir, "final"),
          sourceSha256: sourceSha,
          productRevision: cleanRevision,
          seedUrls: [
            "https://github.com/simonwjackson/korri/releases/download/product-payload/asset-123.tar.zst",
          ],
        }),
      ).toThrow("device prefix")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("rejects release URLs outside the Korri authority repository", () => {
    const dir = makeTempDir()
    try {
      expect(() =>
        finalizeRocknixProductPayload({
          candidateLockPath: writeCandidate(dir),
          outputDir: join(dir, "final"),
          sourceSha256: sourceSha,
          productRevision: cleanRevision,
          seedUrls: [
            "https://github.com/simonwjackson/nix-on-rocks/releases/download/product-payload/asset-123.tar.zst",
          ],
        }),
      ).toThrow("release URL")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
