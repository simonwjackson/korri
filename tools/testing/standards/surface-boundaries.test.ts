import { describe, expect, it } from "bun:test"
import { dirname, join, normalize } from "node:path"
import { REPO_ROOT, readSource, repoRelative, sourceFiles } from "./source-files"

const SURFACES_ROOT = join(REPO_ROOT, "product", "surfaces")
const WEB_SURFACES_ROOT = join(SURFACES_ROOT, "web")

function importSpecifiers(source: string): readonly string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
  const specifiers: string[] = []
  for (const match of withoutComments.matchAll(
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g,
  )) {
    const specifier = match[1] ?? match[2]
    if (specifier) specifiers.push(specifier)
  }
  return specifiers
}

function resolvedRelativeImport(fromFile: string, specifier: string): string {
  return repoRelative(normalize(join(dirname(fromFile), specifier)))
}

function surfaceRootFor(file: string): string {
  const parts = repoRelative(file).split("/")
  return parts.slice(0, 4).join("/")
}

function isTestOrStory(file: string): boolean {
  return /\.(?:test|story|stories|story\.e2e)\.tsx?$/.test(file)
}

function forbiddenSurfaceImport(file: string, specifier: string): string | undefined {
  if (/^(?:@product\/|product\/)(?:apps|services|systems)\//.test(specifier)) {
    return specifier
  }
  if (/^(?:@product\/|product\/)surfaces\//.test(specifier)) return specifier
  if (!specifier.startsWith(".")) return undefined

  const resolved = resolvedRelativeImport(file, specifier)
  if (/^product\/(?:apps|services|systems)\//.test(resolved)) return specifier
  if (
    resolved.startsWith("product/surfaces/") &&
    !resolved.startsWith(`${surfaceRootFor(file)}/`)
  ) {
    return specifier
  }
  return undefined
}

describe("standards: surface boundaries", () => {
  it("keeps web surfaces as leaves over platform APIs", () => {
    const violations = sourceFiles(WEB_SURFACES_ROOT)
      .filter(file => !isTestOrStory(file))
      .flatMap(file =>
        importSpecifiers(readSource(file))
          .map(specifier => forbiddenSurfaceImport(file, specifier))
          .filter((specifier): specifier is string => specifier !== undefined)
          .map(specifier => `${repoRelative(file)} -> ${specifier}`),
      )

    expect(violations).toEqual([])
  })

  it("proves the surface-to-surface guard catches synthetic violations", () => {
    const fromFile = join(
      SURFACES_ROOT,
      "web",
      "shift",
      "synthetic-boundary-fixture.ts",
    )

    expect(
      forbiddenSurfaceImport(fromFile, "@product/surfaces/web/evier/entry"),
    ).toBe("@product/surfaces/web/evier/entry")
    expect(forbiddenSurfaceImport(fromFile, "@product/apps/portal/main")).toBe(
      "@product/apps/portal/main",
    )
  })
})
