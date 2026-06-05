import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..")

describe("Bun dependency Nix boundary", () => {
  it("keeps Bun cache policy behind tools/nix/bun-deps", () => {
    const flake = readFileSync(resolve(REPO_ROOT, "flake.nix"), "utf8")

    expect(flake).toContain("import ./tools/nix/bun-deps")
    expect(flake).not.toContain("proseqlOverrideKey")
    expect(flake).not.toContain("forbiddenProductionPackagePatterns")
    expect(flake).not.toContain("pkgs.bun2nix.fetchBunDeps")
  })
})
