import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..")

describe("Bun dependency Nix boundary", () => {
  it("keeps Bun cache policy behind tools/nix/bun-deps", () => {
    const rootFlake = readFileSync(resolve(REPO_ROOT, "flake.nix"), "utf8")
    const systemFlake = readFileSync(
      resolve(REPO_ROOT, "product", "systems", "nixos", "flake", "default.nix"),
      "utf8",
    )

    expect(rootFlake).toContain("import ./product/systems/nixos/flake")
    expect(systemFlake).toContain("import ../../../../tools/nix/bun-deps")
    expect(rootFlake).not.toContain("proseqlOverrideKey")
    expect(rootFlake).not.toContain("forbiddenProductionPackagePatterns")
    expect(rootFlake).not.toContain("pkgs.bun2nix.fetchBunDeps")
  })
})
