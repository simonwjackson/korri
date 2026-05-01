import { beforeAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const repoRoot = path.join(import.meta.dir, "..", "..")
const demoRoot = path.join(repoRoot, "out", "generated", "bdd", "argo")

function readDemoNames(): string[] {
  if (!existsSync(demoRoot)) return []
  return readdirSync(demoRoot)
    .filter(fileName => fileName.endsWith(".scenes.json"))
    .map(fileName => fileName.replace(/\.scenes\.json$/, ""))
    .sort()
}

function readManifest(demoName: string) {
  const manifestPath = path.join(demoRoot, `${demoName}.scenes.json`)
  return JSON.parse(readFileSync(manifestPath, "utf8")) as Array<{
    scene?: unknown
    text?: unknown
  }>
}

function readScriptScenes(demoName: string) {
  const scriptPath = path.join(demoRoot, `${demoName}.demo.ts`)
  const source = readFileSync(scriptPath, "utf8")
  const staticMarks = Array.from(
    source.matchAll(/narration\.mark\("([^"]+)"\)/g),
  ).map(match => match[1])

  if (staticMarks.length > 0) return staticMarks

  return Array.from(source.matchAll(/scene: "([^"]+)"/g)).map(match => match[1])
}

function readManifestScenes(demoName: string): string[] {
  return readManifest(demoName).map(entry => {
    if (typeof entry.scene !== "string") {
      throw new Error("Manifest entry missing string scene")
    }
    return entry.scene
  })
}

function duplicates(values: ReadonlyArray<string>) {
  const seen = new Set<string>()
  const duplicateValues = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicateValues.add(value)
    seen.add(value)
  }
  return Array.from(duplicateValues)
}

describe("Argo demo contracts", () => {
  beforeAll(() => {
    const result = spawnSync(
      "bun",
      ["run", "tools/scripts/generate-bdd-playwright-tests.ts"],
      { cwd: repoRoot, encoding: "utf8" },
    )

    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout)
    }
  })

  test("all generated demo scenes match script scene declarations", () => {
    for (const demoName of readDemoNames()) {
      const manifestScenes = readManifestScenes(demoName)
      const scriptScenes = readScriptScenes(demoName)

      expect(duplicates(manifestScenes)).toEqual([])
      expect(duplicates(scriptScenes)).toEqual([])
      expect(scriptScenes).toEqual(manifestScenes)
    }
  })

  test("all generated demos enable cursor visibility", () => {
    for (const demoName of readDemoNames()) {
      const source = readFileSync(
        path.join(demoRoot, `${demoName}.demo.ts`),
        "utf8",
      )

      expect(source).toContain("cursorHighlight(page")
    }
  })

  test("generated demos do not own browser behavior", () => {
    for (const demoName of readDemoNames()) {
      const source = readFileSync(
        path.join(demoRoot, `${demoName}.demo.ts`),
        "utf8",
      )

      expect(source).toContain("executeScenarioWithCallbacks")
      expect(source).not.toMatch(
        /page\.goto|page\.locator|getByRole|getByText|expect\(/,
      )
    }
  })

  test("all generated demo narration stays local-demo safe", () => {
    for (const demoName of readDemoNames()) {
      const manifest = readManifest(demoName)
      const narrationText = manifest
        .map(entry => (typeof entry.text === "string" ? entry.text : ""))
        .join("\n")

      expect(narrationText).not.toMatch(/api[_-]?key|secret|token/i)
      expect(narrationText).not.toMatch(/tenant/i)
      expect(narrationText).not.toMatch(/customer/i)
    }
  })

  test("contract iterates over the live demo corpus", () => {
    // Korri currently has no @demo(...) scenarios in product BDD; once a
    // future product PR tags an executable scenario, the contract above
    // begins enforcing behavior automatically. This assertion documents the
    // current state so the test is self-explanatory rather than vacuous.
    expect(readDemoNames()).toEqual([])
  })
})
