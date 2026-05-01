import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  applyPatchPlan,
  buildPatchInputFromFile,
  type PatchDeps,
  planPatch,
  readPatchMarker,
} from "./electrobun-patcher"

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "korri-electrobun-patcher-"))
}

function writeElf(path: string, body = "original") {
  writeFileSync(
    path,
    Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from(body)]),
  )
}

describe("electrobun patcher", () => {
  test("plans a patch for an ELF with env paths and no marker", () => {
    const plan = planPatch({
      filePath: "/repo/node_modules/electrobun/bin/electrobun",
      fileExists: true,
      isElf: true,
      fileSha: "before",
      interpreter: "/nix/store/ld-linux-x86-64.so.2",
      libraryPath: "/nix/store/gtk/lib:/nix/store/webkit/lib",
    })

    expect(plan.status).toBe("patch")
    if (plan.status !== "patch") {
      throw new Error("expected patch plan")
    }
    expect(plan.args).toEqual([
      "--set-interpreter",
      "/nix/store/ld-linux-x86-64.so.2",
      "/repo/node_modules/electrobun/bin/electrobun",
    ])
  })

  test("skips when marker sha matches the current file", () => {
    const plan = planPatch({
      filePath: "/repo/out/build/electrobun/app",
      fileExists: true,
      isElf: true,
      fileSha: "same",
      marker: {
        sha: "same",
        patchedAt: "2026-05-01T00:00:00.000Z",
        interpreter: "/ld",
        rpath: "/lib",
      },
      interpreter: "/ld",
      libraryPath: "/lib",
    })

    expect(plan.status).toBe("skip")
    if (plan.status !== "skip") {
      throw new Error("expected skip plan")
    }
    expect(plan.reason).toBe("already patched")
  })

  test("repatches when marker sha does not match the current file", () => {
    const plan = planPatch({
      filePath: "/repo/out/build/electrobun/app",
      fileExists: true,
      isElf: true,
      fileSha: "new",
      marker: {
        sha: "old",
        patchedAt: "2026-05-01T00:00:00.000Z",
        interpreter: "/ld",
        rpath: "/lib",
      },
      interpreter: "/ld",
      libraryPath: "/lib",
    })

    expect(plan.status).toBe("patch")
    if (plan.status !== "patch") {
      throw new Error("expected patch plan")
    }
    expect(plan.reason).toBe("binary changed since last patch")
  })

  test("skips non-ELF files and missing files", () => {
    expect(
      planPatch({
        filePath: "/repo/node_modules/electrobun/bin/electrobun.cjs",
        fileExists: true,
        isElf: false,
        fileSha: "sha",
        interpreter: "/ld",
        libraryPath: "/lib",
      }),
    ).toMatchObject({ status: "skip", reason: "not an ELF file" })

    expect(
      planPatch({
        filePath: "/repo/missing",
        fileExists: false,
        isElf: false,
        interpreter: "/ld",
        libraryPath: "/lib",
      }),
    ).toMatchObject({ status: "skip", reason: "file not found" })
  })

  test("errors when patcher env vars are absent", () => {
    const plan = planPatch({
      filePath: "/repo/node_modules/electrobun/bin/electrobun",
      fileExists: true,
      isElf: true,
      fileSha: "before",
      interpreter: "",
      libraryPath: "/lib",
    })

    expect(plan.status).toBe("error")
    if (plan.status !== "error") {
      throw new Error("expected error plan")
    }
    expect(plan.recommendations).toContain(
      "Run inside nix develop; the dev shell exposes patchelf inputs.",
    )
  })

  test("applies patchelf and writes a marker with the post-patch sha", () => {
    const dir = makeTempDir()
    try {
      const filePath = join(dir, "electrobun")
      writeElf(filePath)
      const calls: string[][] = []
      const deps: PatchDeps = {
        spawnSync(command, args) {
          calls.push([command, ...args])
          writeElf(filePath, "patched")
          return { exitCode: 0, stdout: "", stderr: "" }
        },
      }

      const input = buildPatchInputFromFile(filePath, {
        interpreter: "/ld",
        libraryPath: "/lib",
      })
      const plan = planPatch(input)
      const result = applyPatchPlan(plan, deps)

      expect(result.ok).toBe(true)
      expect(calls).toEqual([
        ["patchelf", "--set-interpreter", "/ld", filePath],
      ])
      const marker = readPatchMarker(`${filePath}.patched`)
      expect(marker?.sha).toBe(
        buildPatchInputFromFile(filePath, {
          interpreter: "/ld",
          libraryPath: "/lib",
        }).fileSha,
      )
      expect(marker?.interpreter).toBe("/ld")
      expect(marker?.rpath).toBe("/lib")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("surfaces patchelf failures and does not write a marker", () => {
    const dir = makeTempDir()
    try {
      const filePath = join(dir, "electrobun")
      writeElf(filePath)
      const input = buildPatchInputFromFile(filePath, {
        interpreter: "/ld",
        libraryPath: "/lib",
      })
      const result = applyPatchPlan(planPatch(input), {
        spawnSync() {
          return { exitCode: 1, stdout: "", stderr: "bad interpreter" }
        },
      })

      expect(result.ok).toBe(false)
      expect(result.messages.join("\n")).toContain("bad interpreter")
      expect(readPatchMarker(`${filePath}.patched`)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("plans rpath-only patches for shared objects", () => {
    const plan = planPatch({
      filePath: "/repo/out/build/electrobun/libNativeWrapper.so",
      fileExists: true,
      isElf: true,
      elfKind: "shared-object",
      fileSha: "before",
      interpreter: "/ld",
      libraryPath: "/lib",
    })

    expect(plan.status).toBe("patch")
    if (plan.status !== "patch") {
      throw new Error("expected patch plan")
    }
    expect(plan.args).toEqual([
      "--set-rpath",
      "/lib",
      "/repo/out/build/electrobun/libNativeWrapper.so",
    ])
  })

  test("builds file input from ELF and non-ELF files", () => {
    const dir = makeTempDir()
    try {
      const elfPath = join(dir, "app")
      const cjsPath = join(dir, "app.cjs")
      writeElf(elfPath)
      writeFileSync(cjsPath, "#!/usr/bin/env node\n")

      expect(
        buildPatchInputFromFile(elfPath, {
          interpreter: "/ld",
          libraryPath: "/lib",
        }).isElf,
      ).toBe(true)
      expect(
        buildPatchInputFromFile(cjsPath, {
          interpreter: "/ld",
          libraryPath: "/lib",
        }).isElf,
      ).toBe(false)
      expect(readFileSync(elfPath).subarray(0, 4)).toEqual(
        Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
