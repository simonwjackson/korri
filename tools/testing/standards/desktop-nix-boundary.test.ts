import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..")

describe("desktop Nix boundary", () => {
  it("keeps root flake wiring behind the desktop app public interface", () => {
    const flake = readFileSync(resolve(REPO_ROOT, "flake.nix"), "utf8")

    expect(flake).toContain("import ./product/apps/desktop")
    expect(flake).not.toContain("./product/apps/desktop/nix/")
  })
})
