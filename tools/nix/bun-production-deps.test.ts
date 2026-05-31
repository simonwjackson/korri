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

describe("production Bun dependency selection", () => {
  it("keeps production build roots and removes repo-wide dev/test roots", () => {
    const names = productionBunPackageNames(
      lock,
      productionRootDependencyNames(packageJsonText),
    )

    expect(names).toContain("vite@6.4.2")
    expect(names).toContain("@vitejs/plugin-react@4.7.0")
    expect(names).toContain("electrobun@1.16.0")
    expect(names).toContain("effect@4.0.0-beta.60")

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
  })
})
