import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const REPO_ROOT = process.cwd()
const JUSTFILE = readFileSync(join(REPO_ROOT, "justfile"), "utf8")
const NIX_TEST_GLOB = "tools/testing/nix/"

/**
 * Reads a single `just` recipe (header line + indented body) from the justfile
 * by name. Returns the full recipe text so substring assertions can match
 * either dependencies listed on the header or commands in the body.
 *
 * Recipe shapes we care about:
 *
 *     # Doc comment.
 *     recipe-name: dep-a dep-b
 *       <body line 1>
 *       <body line 2>
 *
 *     # Aliases / dependency-only recipes also use the header line:
 *     test: test-unit
 */
function recipeText(name: string): string {
  const lines = JUSTFILE.split("\n")
  const headerIndex = lines.findIndex(line => {
    const trimmed = line.replace(/^\s+/, "")
    return trimmed === `${name}:` || trimmed.startsWith(`${name}:`) ||
      trimmed.startsWith(`${name} `) && trimmed.includes(":")
  })
  if (headerIndex === -1) {
    throw new Error(
      `recipe "${name}" not found in justfile (looked for "${name}:" or "${name} <args>:")`,
    )
  }
  const out: string[] = [lines[headerIndex] ?? ""]
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? ""
    if (line === "" || (line.length > 0 && !/^\s/.test(line))) {
      break
    }
    out.push(line)
  }
  return out.join("\n")
}

describe("test-suite partitioning", () => {
  it("test-unit recipe excludes nix-evaluation tests via --path-ignore-patterns", () => {
    const text = recipeText("test-unit")
    expect(text).toContain("--path-ignore-patterns")
    expect(text).toContain(NIX_TEST_GLOB)
  })

  it("test-nix recipe exists and targets the nix-evaluation directory", () => {
    const text = recipeText("test-nix")
    expect(text).toContain(NIX_TEST_GLOB)
  })

  it("check recipe runs both the fast suite and the nix suite", () => {
    const text = recipeText("check")
    expect(text).toContain("test-unit")
    expect(text).toContain("test-nix")
  })

  it("test alias still points at the fast suite (test-unit)", () => {
    const text = recipeText("test")
    expect(text).toContain("test-unit")
  })
})
