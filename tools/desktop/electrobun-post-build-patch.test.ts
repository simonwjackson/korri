import { describe, expect, test } from "bun:test"
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PatchDeps } from "./electrobun-patcher"
import { runPostBuildPatch } from "./electrobun-post-build-patch"

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "korri-electrobun-post-build-"))
}

function writeElf(path: string, body = "original") {
  writeFileSync(
    path,
    Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from(body)]),
  )
}

function depsForMutatingPatch(
  filesToMutate: string[],
  calls: string[][] = [],
): PatchDeps {
  return {
    spawnSync(command, args) {
      calls.push([command, ...args])
      const filePath = args.at(-1)
      if (filePath) {
        writeElf(filePath, `patched-${filesToMutate.indexOf(filePath)}`)
      }
      return { exitCode: 0, stdout: "", stderr: "" }
    },
  }
}

describe("post-build electrobun patch", () => {
  test("patches ELF files, skips non-ELF files, and writes a manifest", () => {
    const dir = makeTempDir()
    try {
      const app = join(dir, "app")
      const helper = join(dir, "nested-helper")
      const shim = join(dir, "electrobun.cjs")
      writeElf(app, "app")
      writeElf(helper, "helper")
      writeFileSync(shim, "#!/usr/bin/env node\n")
      const calls: string[][] = []

      const report = runPostBuildPatch(
        { buildRoot: dir, interpreter: "/ld", libraryPath: "/lib" },
        depsForMutatingPatch([app, helper], calls),
      )

      expect(report.ok).toBe(true)
      expect(calls).toHaveLength(2)
      expect(
        report.files.filter(file => file.status === "applied"),
      ).toHaveLength(2)
      expect(
        report.files.some(file => file.path.endsWith("electrobun.cjs")),
      ).toBe(false)
      const manifest = JSON.parse(
        readFileSync(join(dir, ".patched-manifest.json"), "utf8"),
      )
      expect(Object.keys(manifest.files).sort()).toEqual([
        "app",
        "nested-helper",
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("skips unchanged files on re-run", () => {
    const dir = makeTempDir()
    try {
      const app = join(dir, "app")
      writeElf(app, "app")
      const firstCalls: string[][] = []
      const first = runPostBuildPatch(
        { buildRoot: dir, interpreter: "/ld", libraryPath: "/lib" },
        depsForMutatingPatch([app], firstCalls),
      )
      expect(first.ok).toBe(true)
      expect(firstCalls).toHaveLength(1)

      const secondCalls: string[][] = []
      const second = runPostBuildPatch(
        { buildRoot: dir, interpreter: "/ld", libraryPath: "/lib" },
        depsForMutatingPatch([app], secondCalls),
      )

      expect(second.ok).toBe(true)
      expect(secondCalls).toHaveLength(0)
      expect(second.files).toContainEqual({
        path: app,
        status: "skipped",
        message: "already patched",
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("repatches a file when its content changes", () => {
    const dir = makeTempDir()
    try {
      const app = join(dir, "app")
      writeElf(app, "app")
      runPostBuildPatch(
        { buildRoot: dir, interpreter: "/ld", libraryPath: "/lib" },
        depsForMutatingPatch([app]),
      )

      writeElf(app, "new-build-output")
      const calls: string[][] = []
      const report = runPostBuildPatch(
        { buildRoot: dir, interpreter: "/ld", libraryPath: "/lib" },
        depsForMutatingPatch([app], calls),
      )

      expect(report.ok).toBe(true)
      expect(calls).toHaveLength(1)
      expect(report.files[0]?.status).toBe("applied")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("treats a missing build root as a successful no-op", () => {
    const dir = join(makeTempDir(), "missing")
    const report = runPostBuildPatch({
      buildRoot: dir,
      interpreter: "/ld",
      libraryPath: "/lib",
    })

    expect(report.ok).toBe(true)
    expect(report.files).toEqual([])
    expect(report.messages).toContain("nothing to patch")
  })

  test("continues patching after one file fails", () => {
    const dir = makeTempDir()
    try {
      const bad = join(dir, "bad")
      const good = join(dir, "good")
      writeElf(bad, "bad")
      writeElf(good, "good")
      const calls: string[][] = []
      const report = runPostBuildPatch(
        { buildRoot: dir, interpreter: "/ld", libraryPath: "/lib" },
        {
          spawnSync(command, args) {
            calls.push([command, ...args])
            const filePath = args.at(-1)
            if (filePath === bad) {
              return { exitCode: 1, stdout: "", stderr: "bad binary" }
            }
            if (filePath) {
              writeElf(filePath, "patched-good")
            }
            return { exitCode: 0, stdout: "", stderr: "" }
          },
        },
      )

      expect(report.ok).toBe(false)
      expect(calls).toHaveLength(2)
      expect(report.files.find(file => file.path === bad)?.status).toBe(
        "failed",
      )
      expect(report.files.find(file => file.path === good)?.status).toBe(
        "applied",
      )
      expect(existsSync(join(dir, ".patched-manifest.json"))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
