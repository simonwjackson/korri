import { describe, expect, it } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..")
const NIX_TEST_DIR = resolve(REPO_ROOT, "tools/testing/nix")

/**
 * Asks `just` itself what command(s) a recipe would actually run, then
 * strips comment lines so the assertion only sees executable commands.
 */
function resolveRecipe(name: string): string {
  const child = Bun.spawnSync(["just", "--dry-run", name], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  })
  if (child.exitCode !== 0) {
    throw new Error(
      `just --dry-run ${name} failed (exit ${child.exitCode}):\n${child.stderr.toString()}`,
    )
  }

  const combined = `${child.stdout.toString()}\n${child.stderr.toString()}`
  return combined
    .split("\n")
    .filter(line => !line.trimStart().startsWith("#"))
    .join("\n")
}

describe("test-suite partitioning", () => {
  it("does not keep the retired Nix-through-Bun test directory", () => {
    expect(existsSync(NIX_TEST_DIR)).toBe(false)
  })

  it("test-unit recipe runs Bun tests without Nix-specific discovery ignores", () => {
    const resolved = resolveRecipe("test-unit")

    expect(resolved).toContain("bun test")
    expect(resolved).not.toContain("--path-ignore-patterns")
    expect(resolved).not.toContain("tools/testing/nix")
  })

  it("test-nix recipe runs native Nix commands, not Bun", () => {
    const resolved = resolveRecipe("test-nix")

    expect(resolved).toContain("nix build")
    expect(resolved).toContain(".#checks.x86_64-linux.korri-image-outputs")
    expect(resolved).toContain(
      ".#checks.x86_64-linux.korri-rocknix-sm8550-config",
    )
    expect(resolved).toContain(
      ".#checks.x86_64-linux.korri-live-usb-persistence-resolver",
    )
    expect(resolved).not.toContain("bun test")
    expect(resolved).not.toContain("tools/testing/nix")
  })

  it("check recipe actually runs both the TypeScript suite and native Nix suite", () => {
    const resolved = resolveRecipe("check")

    expect(resolved).toContain("bun test")
    expect(resolved).toContain("nix build")
    expect(resolved).toContain(".#checks.x86_64-linux.korri-image-outputs")
    expect(resolved).not.toContain("bun test tools/testing/nix")
  })

  it("test alias still resolves to the TypeScript unit suite", () => {
    const resolved = resolveRecipe("test")

    expect(resolved).toContain("bun test")
    expect(resolved).not.toContain("tools/testing/nix")
  })

  it("package test script delegates to the repo test-unit recipe", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> }

    expect(packageJson.scripts?.test).toBe("just test-unit")
  })
})
