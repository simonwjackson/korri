import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..")

describe("desktop Nix boundary", () => {
  it("keeps root flake wiring behind the desktop app public interface", () => {
    const rootFlake = readFileSync(resolve(REPO_ROOT, "flake.nix"), "utf8")
    const systemFlake = readFileSync(
      resolve(REPO_ROOT, "product", "systems", "nixos", "flake", "default.nix"),
      "utf8",
    )

    expect(rootFlake).toContain("import ./product/systems/nixos/flake")
    expect(systemFlake).toContain("import ../../../../product/apps/desktop")
    expect(rootFlake).not.toContain("./product/apps/desktop/nix/")
  })
})
