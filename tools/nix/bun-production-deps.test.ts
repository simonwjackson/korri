import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import {
  parseBunLock,
  productionBunLock,
  productionBunPackageNames,
  productionPackageJson,
  productionRootDependencyNames,
} from "./bun-production-deps"

const packageJsonText = readFileSync("package.json", "utf8")
const lock = parseBunLock(readFileSync("bun.lock", "utf8"))
const hasVersionedName = (names: string[], packageName: string) =>
  names.some(name => name.startsWith(`${packageName}@`))

describe("production Bun dependency selection", () => {
  it("keeps production build roots and removes repo-wide dev/test roots", () => {
    const names = productionBunPackageNames(
      lock,
      productionRootDependencyNames(packageJsonText),
    )

    expect(hasVersionedName(names, "vite")).toBe(true)
    expect(hasVersionedName(names, "@vitejs/plugin-react")).toBe(true)
    expect(hasVersionedName(names, "electrobun")).toBe(true)
    expect(hasVersionedName(names, "effect")).toBe(true)

    for (const forbidden of [
      "playwright",
      "storybook",
      "@cucumber/",
      "@vitest/",
      "@testing-library/",
      "fallow",
      "@argo-video/cli",
      "@tiptap/",
      "@xyflow/",
    ]) {
      expect(names.filter(name => name.includes(forbidden))).toEqual([])
    }
  })

  it("renders production package and lock manifests without devDependencies", () => {
    const manifest = JSON.parse(productionPackageJson(packageJsonText))
    const productionLock = JSON.parse(
      productionBunLock(readFileSync("bun.lock", "utf8"), packageJsonText),
    )

    expect(manifest.dependencies.vite).toBeDefined()
    expect(manifest.dependencies["@vitejs/plugin-react"]).toBeDefined()
    expect(manifest.dependencies["@playwright/test"]).toBeUndefined()
    expect(manifest.dependencies.storybook).toBeUndefined()
    expect(manifest.devDependencies).toBeUndefined()

    expect(productionLock.workspaces[""].dependencies.vite).toBeDefined()
    expect(
      productionLock.workspaces[""].dependencies["@vitejs/plugin-react"],
    ).toBeDefined()
    expect(productionLock.workspaces[""].devDependencies).toBeUndefined()
    expect(Object.keys(productionLock.packages).length).toBe(
      Object.keys(lock.packages).length,
    )
  })

  it("throws when a required dependency resolves to multiple candidates", () => {
    expect(() =>
      productionBunPackageNames(
        {
          workspaces: { "": { dependencies: { root: "1.0.0" } } },
          packages: {
            root: ["root@1.0.0", "", { dependencies: { ambiguous: "*" } }],
            "parent-a/ambiguous": ["ambiguous@1.0.0", ""],
            "parent-b/ambiguous": ["ambiguous@2.0.0", ""],
          },
        },
        ["root"],
      ),
    ).toThrow("Could not resolve required dependency ambiguous from root")
  })

  it("skips optional dependencies that resolve to multiple candidates", () => {
    const names = productionBunPackageNames(
      {
        workspaces: { "": { dependencies: { root: "1.0.0" } } },
        packages: {
          root: [
            "root@1.0.0",
            "",
            { optionalDependencies: { ambiguous: "*" } },
          ],
          "parent-a/ambiguous": ["ambiguous@1.0.0", ""],
          "parent-b/ambiguous": ["ambiguous@2.0.0", ""],
        },
      },
      ["root"],
    )

    expect(names).toEqual(["root@1.0.0"])
  })
})
