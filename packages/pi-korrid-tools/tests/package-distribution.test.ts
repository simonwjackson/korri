import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const packageRoot = join(import.meta.dir, "..")

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"))
}

describe("pi-korrid-tools package distribution", () => {
  it("declares a publishable Pi package manifest", () => {
    const manifest = readJson(join(packageRoot, "package.json"))

    expect(manifest.name).toBe("@korri/pi-korrid-tools")
    expect(manifest.private).toBeUndefined()
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(manifest.keywords).toContain("pi-package")
    expect(manifest.files).toEqual(
      expect.arrayContaining(["extensions", "skills", "src", "README.md"]),
    )
    expect(manifest.pi).toEqual({
      extensions: ["./extensions"],
      skills: ["./skills"],
    })
    expect(manifest.peerDependencies).toMatchObject({
      "@mariozechner/pi-coding-agent": "*",
    })
  })

  it("keeps repo Pi settings as a consumer of the distributable package", () => {
    const settings = readJson(
      join(packageRoot, "..", "..", ".pi", "settings.json"),
    )

    expect(settings.packages).toContain("../packages/pi-korrid-tools")
    expect(settings.packages).not.toContain("./packages/korrid-tools")
  })

  it("ships parseable skill frontmatter", () => {
    const skill = readFileSync(
      join(packageRoot, "skills", "korrid-tools", "SKILL.md"),
      "utf8",
    )
    const [, frontmatter] = skill.split("---")

    expect(frontmatter).toContain("name:")
    expect(frontmatter).toContain("description:")
    expect(frontmatter).toContain('description: "')
  })
})
