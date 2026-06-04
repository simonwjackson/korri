import { describe, expect, it } from "bun:test"
import { existsSync, readdirSync, statSync } from "node:fs"
import { dirname, extname, join, normalize } from "node:path"
import {
  REPO_ROOT,
  readSource,
  repoRelative,
  sourceFiles,
} from "./source-files"

const PRODUCT_ROOT = join(REPO_ROOT, "product")
const ACQUISITION_ROOT = join(REPO_ROOT, "product", "platform", "acquisition")
const ACQUISITION_PROTOCOL_ROOT = join(
  REPO_ROOT,
  "product",
  "platform",
  "protocol",
  "acquisition",
)
const LIBRARY_ROOT = join(REPO_ROOT, "product", "platform", "library")
const CLI_ROOT = join(REPO_ROOT, "product", "apps", "cli")
const BAZZAR_CLI_ROOT = join(REPO_ROOT, "product", "apps", "cli", "bazzar")
const ACQUISITION_RPC_ROOT = join(
  REPO_ROOT,
  "product",
  "apps",
  "portal",
  "api",
  "acquisition",
)

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

function importsPrivateProductInternals(
  source: string,
  fromFile: string,
): boolean {
  return importSpecifiers(source).some(specifier => {
    if (
      /^(?:@product\/(?:apps|services|systems|themes)\/|product\/(?:apps|services|systems|themes)\/)/.test(
        specifier,
      )
    ) {
      return true
    }

    if (!specifier.startsWith(".")) return false

    return /^product\/(?:apps|services|systems|themes)\//.test(
      resolvedRelativeImport(fromFile, specifier),
    )
  })
}

function importsPlatformModule(
  source: string,
  fromFile: string,
  moduleName: "acquisition" | "library",
): boolean {
  const modulePath = `product/platform/${moduleName}`
  return importSpecifiers(source).some(specifier => {
    if (
      specifier === `@platform/${moduleName}` ||
      specifier.startsWith(`@platform/${moduleName}/`) ||
      specifier === `@product/platform/${moduleName}` ||
      specifier.startsWith(`@product/platform/${moduleName}/`) ||
      specifier === modulePath ||
      specifier.startsWith(`${modulePath}/`)
    ) {
      return true
    }

    return (
      specifier.startsWith(".") &&
      resolvedRelativeImport(fromFile, specifier).startsWith(`${modulePath}/`)
    )
  })
}

function filesImportingPlatformModule(
  roots: readonly string[],
  moduleName: "acquisition" | "library",
) {
  return roots
    .flatMap(root => [...sourceFiles(root)])
    .filter(file => importsPlatformModule(readSource(file), file, moduleName))
    .map(repoRelative)
}

function filesMatching(root: string, predicate: (path: string) => boolean) {
  const matches: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if ([".git", ".worktrees", "node_modules", "out"].includes(entry)) {
        continue
      }
      const path = join(dir, entry)
      const stat = statSync(path)
      if (stat.isDirectory()) {
        walk(path)
        continue
      }
      if (predicate(path)) matches.push(repoRelative(path))
    }
  }
  walk(root)
  return matches.sort()
}

describe("standards: acquisition migration boundaries", () => {
  it("keeps platform acquisition code product-agnostic", () => {
    const violations = sourceFiles(ACQUISITION_ROOT)
      .filter(file => importsPrivateProductInternals(readSource(file), file))
      .map(repoRelative)

    expect(violations).toEqual([])
  })

  it("keeps library and source-aware CLI code independent from acquisition", () => {
    const sourceAwareCliFiles = sourceFiles(CLI_ROOT).filter(file =>
      repoRelative(file).startsWith("product/apps/cli/source-aware-"),
    )
    const violations = [
      ...filesImportingPlatformModule([LIBRARY_ROOT], "acquisition"),
      ...sourceAwareCliFiles
        .filter(file =>
          importsPlatformModule(readSource(file), file, "acquisition"),
        )
        .map(repoRelative),
    ]

    expect(violations).toEqual([])
  })

  it("keeps acquisition code independent from library state modules", () => {
    const violations = filesImportingPlatformModule(
      [ACQUISITION_ROOT],
      "library",
    )

    expect(violations).toEqual([])
  })

  it("keeps Bazzar CLI and RPC acquisition surfaces read-only from library state", () => {
    expect(existsSync(BAZZAR_CLI_ROOT)).toBe(true)
    expect(existsSync(ACQUISITION_RPC_ROOT)).toBe(true)

    const violations = filesImportingPlatformModule(
      [BAZZAR_CLI_ROOT, ACQUISITION_RPC_ROOT],
      "library",
    )

    expect(violations).toEqual([])
  })

  it("keeps acquisition protocol schemas free of Effect RPC transport imports", () => {
    const violations = sourceFiles(ACQUISITION_PROTOCOL_ROOT)
      .filter(file =>
        importSpecifiers(readSource(file)).some(specifier =>
          /^effect\/unstable\/rpc(?:\/|$)/.test(specifier),
        ),
      )
      .map(repoRelative)

    expect(violations).toEqual([])
  })

  it("does not import Bazzar UI/demo API source roots into Korri product code", () => {
    for (const forbiddenRoot of [
      join(REPO_ROOT, "product", "apps", "api"),
      join(REPO_ROOT, "product", "apps", "ui"),
      join(REPO_ROOT, "product", "apps", "bazzar"),
      join(REPO_ROOT, "product", "services", "bazzar"),
    ]) {
      expect(existsSync(forbiddenRoot)).toBe(false)
    }
  })

  it("does not add quarantined .mjs plugins under Korri product roots", () => {
    const quarantinedProviderNames = new Set([
      "coolrom",
      "retrostic",
      "romhustler",
      "steamgriddb",
      "wowroms",
    ])
    const violations = filesMatching(
      PRODUCT_ROOT,
      path =>
        extname(path) === ".mjs" &&
        (path.includes(`${join("product", "platform", "acquisition")}/`) ||
          quarantinedProviderNames.has(
            path
              .split(/[\\/]/)
              .at(-1)
              ?.replace(/\.mjs$/, "") ?? "",
          )),
    )

    expect(violations).toEqual([])
  })
})
