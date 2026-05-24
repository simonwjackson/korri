import { describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"

const REPO_ROOT = process.cwd()
const NIX_TEST_GLOB = "tools/testing/nix/"

/**
 * Asks `just` itself what command(s) a recipe would actually run, then
 * strips comment lines so the assertion only sees executable commands.
 * Using `--dry-run` keeps the assertion grounded in the resolved-recipe
 * shell the user would actually invoke. Stripping `#`-prefixed lines
 * defends against the failure mode of a substring (`--path-ignore-patterns`,
 * `tools/testing/nix/`) living in a comment while the real command line
 * has been flipped back to `bun test`.
 */
function resolveRecipe(name: string): string {
  const child = spawnSync("just", ["--dry-run", name], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
  if (child.status !== 0) {
    throw new Error(
      `just --dry-run ${name} failed (exit ${child.status}):\n${child.stderr}`,
    )
  }
  // `just --dry-run` writes the resolved commands to stderr (so the
  // recipe's own stdout stays clean); combine both streams to keep the
  // assertion robust to future `just` output-channel changes.
  const combined = `${child.stdout}\n${child.stderr}`
  return combined
    .split("\n")
    .filter(line => !line.trimStart().startsWith("#"))
    .join("\n")
}

describe("test-suite partitioning", () => {
  it("test-unit recipe excludes nix-evaluation tests via --path-ignore-patterns", () => {
    const resolved = resolveRecipe("test-unit")
    expect(resolved).toContain("--path-ignore-patterns")
    expect(resolved).toContain(NIX_TEST_GLOB)
    expect(resolved).toContain("bun test")
  })

  it("test-nix recipe targets the nix-evaluation directory with bun test", () => {
    const resolved = resolveRecipe("test-nix")
    expect(resolved).toContain("bun test")
    expect(resolved).toContain(NIX_TEST_GLOB)
  })

  it("check recipe actually runs both the fast suite and the nix suite", () => {
    const resolved = resolveRecipe("check")
    // Both bodies must appear in the resolved dependency chain. A
    // comment-only mention would not survive `just --dry-run`.
    expect(resolved).toContain(
      '--path-ignore-patterns "**/tools/testing/nix/**"',
    )
    expect(resolved).toContain("bun test tools/testing/nix/")
  })

  it("test alias still resolves to the fast suite (test-unit) body", () => {
    // `test` is `test: test-unit` -- its dry-run body should match
    // test-unit's exactly, so the fast-suite assertion holds.
    const resolved = resolveRecipe("test")
    expect(resolved).toContain(
      '--path-ignore-patterns "**/tools/testing/nix/**"',
    )
  })
})
