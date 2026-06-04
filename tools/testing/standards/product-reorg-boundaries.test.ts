import { describe, expect, it } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, normalize } from "node:path"
import {
  existingRoots,
  REPO_ROOT,
  readSource,
  repoRelative,
  sourceFiles,
} from "./source-files"

const LEGACY_SHARED_THEME_ROOT = join(REPO_ROOT, "korri", "shared", "themes")
const CURRENT_THEME_ROOTS = [join(REPO_ROOT, "product", "themes")]

const FRAMEWORK_NEUTRAL_PLATFORM_ROOTS = [
  join(REPO_ROOT, "product", "platform", "protocol"),
  join(REPO_ROOT, "product", "platform", "browser"),
  join(REPO_ROOT, "product", "platform", "input"),
  join(REPO_ROOT, "product", "platform", "ui"),
]

const SHIPPED_TOOLS_ALLOWLIST = new Set<string>()

const CURRENT_ALIAS_PATH_INVENTORY = {
  "@app/*": "./korri/products/app/*",
  "@shared/*": "./korri/shared/*",
  "@korri/*": "./korri/*",
  "@product/*": "./product/*",
  "@platform/*": "./product/platform/*",
} as const

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

function importsThemePrivateProductInternals(
  source: string,
  fromFile = join(REPO_ROOT, "product", "themes", "example", "src", "main.ts"),
): boolean {
  return importSpecifiers(source).some(specifier => {
    if (
      specifier.startsWith("@app/") ||
      specifier.startsWith("@product/apps/") ||
      specifier.startsWith("@product/services/") ||
      specifier.startsWith("@product/systems/") ||
      specifier.startsWith("@korri/products/app/") ||
      specifier.startsWith("@korri/deploy/") ||
      /^product\/(?:apps|services|systems)\//.test(specifier)
    ) {
      return true
    }

    if (!specifier.startsWith(".")) return false

    const resolved = repoRelative(normalize(join(dirname(fromFile), specifier)))
    return /^(?:product\/(?:apps|services|systems)|korri\/(?:products|deploy))\//.test(
      resolved,
    )
  })
}

function importsReact(source: string): boolean {
  return importSpecifiers(source).some(specifier =>
    /^(?:react|react-dom|@effect\/atom-react)(?:\/|$)/.test(specifier),
  )
}

function importsPrivateProductFromPlatform(source: string): boolean {
  return importSpecifiers(source).some(specifier =>
    /^(?:@app\/|@product\/(?:apps|services|systems|themes)\/|product\/(?:apps|services|systems|themes)\/|@korri\/products\/app\/)/.test(
      specifier,
    ),
  )
}

function importsThemeInternalsDirectly(source: string): boolean {
  return importSpecifiers(source).some(specifier => {
    if (/^@product\/themes\/[^/]+\/(?:entry|[^/]+\.css)$/.test(specifier)) {
      return false
    }
    return /^@product\/themes\/[^/]+\//.test(specifier)
  })
}

function buildReferencedToolEntrypoints(): readonly string[] {
  const files = [
    "product/services/server/package.nix",
    "product/services/device/nix/sessiond.nix",
    "product/services/device/nix/inputd.nix",
    "product/services/device/nix/game-stream.nix",
    "product/services/device/nix/gamescope-control-bridge.nix",
    "product/apps/cli/package.nix",
  ]
  const references = new Set<string>()
  for (const file of files) {
    const path = join(REPO_ROOT, file)
    if (!existsSync(path)) continue
    const source = readFileSync(path, "utf8")
    for (const match of source.matchAll(
      /tools\/(?:http|device|cli)\/[A-Za-z0-9_.-]+\.ts/g,
    )) {
      references.add(match[0])
    }
  }
  return [...references].sort()
}

describe("standards: product platform reorganization guardrails", () => {
  it("keeps product-owned package, image, module, and overlay Nix files beside product units", () => {
    expect(existsSync(join(REPO_ROOT, "nix", "korri-portal.nix"))).toBe(false)
    expect(existsSync(join(REPO_ROOT, "nix", "images"))).toBe(false)
    expect(existsSync(join(REPO_ROOT, "nix", "modules"))).toBe(false)
    expect(existsSync(join(REPO_ROOT, "nix", "overlays"))).toBe(false)
    expect(
      existsSync(join(REPO_ROOT, "product", "apps", "portal", "package.nix")),
    ).toBe(true)
    expect(
      existsSync(
        join(REPO_ROOT, "product", "services", "server", "package.nix"),
      ),
    ).toBe(true)
    expect(
      existsSync(
        join(REPO_ROOT, "product", "systems", "nixos", "images", "common.nix"),
      ),
    ).toBe(true)
    expect(
      existsSync(
        join(REPO_ROOT, "product", "systems", "rocknix", "rootfs.nix"),
      ),
    ).toBe(true)
  })

  it("keeps first-party themes out of legacy shared theme ownership", () => {
    expect(existsSync(LEGACY_SHARED_THEME_ROOT)).toBe(false)
    expect(existsSync(join(REPO_ROOT, "product", "themes", "shift"))).toBe(true)
    expect(existsSync(join(REPO_ROOT, "product", "themes", "evier"))).toBe(true)
  })

  it("keeps autonomous themes from importing app, service, system, or deploy internals", () => {
    const violations = existingRoots(CURRENT_THEME_ROOTS).flatMap(root =>
      sourceFiles(root)
        .filter(file =>
          importsThemePrivateProductInternals(readSource(file), file),
        )
        .map(repoRelative),
    )

    expect(violations).toEqual([])
  })

  it("keeps portal routes and shell from importing theme internals directly", () => {
    const violations = existingRoots([
      join(REPO_ROOT, "product", "apps", "portal"),
      join(REPO_ROOT, "korri", "products", "app", "routes"),
    ]).flatMap(root =>
      sourceFiles(root)
        .filter(file => importsThemeInternalsDirectly(readSource(file)))
        .map(repoRelative),
    )

    expect(violations).toEqual([])
  })

  it("detects private product imports in theme-source samples", () => {
    expect(
      importsThemePrivateProductInternals('import x from "@app/api"'),
    ).toBe(true)
    expect(
      importsThemePrivateProductInternals(
        'import x from "product/apps/portal"',
      ),
    ).toBe(true)
    expect(
      importsThemePrivateProductInternals(
        'import x from "@product/apps/portal"',
      ),
    ).toBe(true)
    expect(
      importsThemePrivateProductInternals('import x from "@shared/library"'),
    ).toBe(false)
  })

  it("keeps framework-neutral platform layers free of React dependencies", () => {
    const violations = existingRoots(FRAMEWORK_NEUTRAL_PLATFORM_ROOTS).flatMap(
      root =>
        sourceFiles(root)
          .filter(file => importsReact(readSource(file)))
          .map(repoRelative),
    )

    expect(violations).toEqual([])
  })

  it("detects React imports in framework-neutral platform samples", () => {
    expect(importsReact('import { useEffect } from "react"')).toBe(true)
    expect(
      importsReact('import { RegistryProvider } from "@effect/atom-react"'),
    ).toBe(true)
    expect(importsReact('import { Effect } from "effect"')).toBe(false)
  })

  it("keeps platform layers from importing product internals", () => {
    const violations = existingRoots([
      join(REPO_ROOT, "product", "platform"),
    ]).flatMap(root =>
      sourceFiles(root)
        .filter(file => importsPrivateProductFromPlatform(readSource(file)))
        .map(repoRelative),
    )

    expect(violations).toEqual([])
  })

  it("allows React dependencies only in the platform React adapter", () => {
    const reactFiles = existingRoots([
      join(REPO_ROOT, "product", "platform"),
    ]).flatMap(root =>
      sourceFiles(root)
        .filter(file => importsReact(readSource(file)))
        .map(repoRelative),
    )

    expect(
      reactFiles.filter(file => !file.startsWith("product/platform/react/")),
    ).toEqual([])
  })

  it("detects private product imports in platform-source samples", () => {
    expect(importsPrivateProductFromPlatform('import x from "@app/api"')).toBe(
      true,
    )
    expect(
      importsPrivateProductFromPlatform('import x from "@product/apps/portal"'),
    ).toBe(true)
    expect(
      importsPrivateProductFromPlatform(
        'import x from "@platform/input/types"',
      ),
    ).toBe(false)
  })

  it("keeps shipped runtime entrypoints out of developer-only tools", () => {
    const referenced = buildReferencedToolEntrypoints()
    const missingFromAllowlist = referenced.filter(
      path => !SHIPPED_TOOLS_ALLOWLIST.has(path),
    )

    expect(missingFromAllowlist).toEqual([])
    expect(referenced).toEqual([...SHIPPED_TOOLS_ALLOWLIST].sort())
  })

  it("documents current alias path assumptions for the product reorg", () => {
    const tsconfig = JSON.parse(
      readFileSync(join(REPO_ROOT, "tsconfig.json"), "utf8"),
    )
    const aliases = tsconfig.compilerOptions.paths

    for (const [alias, target] of Object.entries(
      CURRENT_ALIAS_PATH_INVENTORY,
    )) {
      expect(aliases[alias]).toEqual([target])
    }
  })
})
