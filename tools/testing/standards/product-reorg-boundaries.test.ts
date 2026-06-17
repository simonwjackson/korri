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

const LEGACY_KORRI_ROOT = join(REPO_ROOT, "korri")
const LEGACY_SHARED_THEME_ROOT = join(REPO_ROOT, "korri", "shared", "themes")
const CURRENT_THEME_ROOTS = [join(REPO_ROOT, "product", "themes")]

const FRAMEWORK_NEUTRAL_PLATFORM_ROOTS = [
  join(REPO_ROOT, "product", "platform", "protocol"),
  join(REPO_ROOT, "product", "platform", "browser"),
  join(REPO_ROOT, "product", "platform", "input"),
  join(REPO_ROOT, "product", "platform", "ui"),
]

const SHIPPED_TOOLS_ALLOWLIST = new Set<string>()

const FINAL_ALIAS_PATH_INVENTORY = {
  "@product/*": "./product/*",
  "@platform/*": "./product/platform/*",
} as const

const LEGACY_ALIAS_NAMES = ["@app/*", "@shared/*", "@korri/*"] as const

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
      specifier.startsWith("@product/apps/portal/") ||
      specifier.startsWith("@product/apps/") ||
      specifier.startsWith("@product/services/") ||
      specifier.startsWith("@product/systems/") ||
      specifier.startsWith("@product/apps/portal/") ||
      specifier.startsWith("@product/deploy/") ||
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

function importsPrivateProductFromPlatform(
  source: string,
  fromFile = join(REPO_ROOT, "product", "platform", "example.ts"),
): boolean {
  return importSpecifiers(source).some(specifier => {
    if (
      /^(?:@app\/|@product\/(?:apps|services|systems|themes|plugins)\/|product\/(?:apps|services|systems|themes|plugins)\/|@korri\/products\/app\/)/.test(
        specifier,
      )
    ) {
      return true
    }

    if (!specifier.startsWith(".")) return false

    const resolved = repoRelative(normalize(join(dirname(fromFile), specifier)))
    return /^product\/(?:apps|services|systems|themes|plugins)\//.test(resolved)
  })
}

function importsVendorDirectly(
  source: string,
  fromFile = join(REPO_ROOT, "product", "apps", "portal", "example.ts"),
): boolean {
  return importSpecifiers(source).some(specifier => {
    if (/^(?:@product\/vendor\/|product\/vendor\/)/.test(specifier)) {
      return true
    }

    if (!specifier.startsWith(".")) return false

    return repoRelative(
      normalize(join(dirname(fromFile), specifier)),
    ).startsWith("product/vendor/")
  })
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
    "product/plugins/gamescope/packages/control-bridge/default.nix",
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
    expect(existsSync(join(REPO_ROOT, "nix"))).toBe(false)
    expect(
      existsSync(join(REPO_ROOT, "tools", "nix", "generated", "bun.nix")),
    ).toBe(true)
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "tools",
          "nix",
          "generated",
          "bun-production-package-names.nix",
        ),
      ),
    ).toBe(true)
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "tools",
          "testing",
          "nix",
          "korri-standard-native-check.nix",
        ),
      ),
    ).toBe(true)
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

  it("removes the legacy Korri source tree after product relocation", () => {
    expect(existsSync(LEGACY_KORRI_ROOT)).toBe(false)
    expect(existsSync(LEGACY_SHARED_THEME_ROOT)).toBe(false)
    expect(
      existsSync(join(REPO_ROOT, "product", "apps", "portal", "api")),
    ).toBe(true)
    expect(existsSync(join(REPO_ROOT, "product", "platform", "library"))).toBe(
      true,
    )
    expect(
      existsSync(join(REPO_ROOT, "product", "platform", "react", "primitives")),
    ).toBe(true)
  })

  it("keeps first-party themes out of legacy shared theme ownership", () => {
    expect(existsSync(LEGACY_SHARED_THEME_ROOT)).toBe(false)
    expect(existsSync(join(REPO_ROOT, "product", "themes", "shift"))).toBe(true)
    expect(existsSync(join(REPO_ROOT, "product", "themes", "evier"))).toBe(true)
  })

  it("keeps carried upstream packages under product vendor unless a plugin owns them", () => {
    expect(existsSync(join(REPO_ROOT, "packages"))).toBe(false)
    expect(existsSync(join(REPO_ROOT, "product", "vendor"))).toBe(true)
    expect(
      existsSync(
        join(REPO_ROOT, "product", "vendor", "moonlight-embedded-korri"),
      ),
    ).toBe(true)
    expect(
      existsSync(join(REPO_ROOT, "product", "vendor", "sunshine-korri")),
    ).toBe(true)
    expect(
      existsSync(join(REPO_ROOT, "product", "vendor", "gamescope-korri")),
    ).toBe(false)
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "product",
          "plugins",
          "gamescope",
          "packages",
          "gamescope-korri",
          "default.nix",
        ),
      ),
    ).toBe(true)
    expect(
      existsSync(
        join(REPO_ROOT, "product", "plugins", "gamescope", "flake.nix"),
      ),
    ).toBe(true)
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "product",
          "plugins",
          "gamescope",
          "packages",
          "gamescope-korri",
          "patches",
        ),
      ),
    ).toBe(true)
    expect(
      existsSync(join(REPO_ROOT, "product", "vendor", "libretro-fake-08")),
    ).toBe(true)
    expect(
      existsSync(join(REPO_ROOT, "product", "vendor", "SDL2-mali-fbdev")),
    ).toBe(true)
  })

  it("keeps Gamescope's downstream package lane under the Gamescope plugin", () => {
    expect(
      existsSync(join(REPO_ROOT, "product", "vendor", "gamescope-korri")),
    ).toBe(false)
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "product",
          "plugins",
          "gamescope",
          "packages",
          "gamescope-korri",
          "default.nix",
        ),
      ),
    ).toBe(true)
    expect(
      existsSync(
        join(REPO_ROOT, "product", "plugins", "gamescope", "flake.nix"),
      ),
    ).toBe(true)
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "product",
          "plugins",
          "gamescope",
          "packages",
          "gamescope-korri",
          "patches",
        ),
      ),
    ).toBe(true)
  })

  it("keeps runtime TypeScript from importing product vendor directly", () => {
    const violations = existingRoots([
      join(REPO_ROOT, "product", "apps"),
      join(REPO_ROOT, "product", "platform"),
      join(REPO_ROOT, "product", "services"),
      join(REPO_ROOT, "product", "themes"),
    ]).flatMap(root =>
      sourceFiles(root)
        .filter(file => importsVendorDirectly(readSource(file), file))
        .map(repoRelative),
    )

    expect(violations).toEqual([])
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
      join(REPO_ROOT, "product", "apps", "portal", "routes"),
      join(REPO_ROOT, "product", "apps", "portal", "themes"),
    ]).flatMap(root =>
      sourceFiles(root)
        .filter(file => importsThemeInternalsDirectly(readSource(file)))
        .map(repoRelative),
    )

    expect(violations).toEqual([])
  })

  it("detects private product imports in theme-source samples", () => {
    expect(
      importsThemePrivateProductInternals(
        'import x from "@product/apps/portal/api"',
      ),
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
      importsThemePrivateProductInternals('import x from "@platform/library"'),
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
        .filter(file =>
          importsPrivateProductFromPlatform(readSource(file), file),
        )
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
    expect(
      importsPrivateProductFromPlatform(
        'import x from "@product/apps/portal/api"',
      ),
    ).toBe(true)
    expect(
      importsPrivateProductFromPlatform('import x from "@product/apps/portal"'),
    ).toBe(true)
    expect(
      importsPrivateProductFromPlatform(
        'import x from "@product/plugins/gamescope"',
      ),
    ).toBe(true)
    expect(
      importsPrivateProductFromPlatform(
        'import x from "@platform/input/types"',
      ),
    ).toBe(false)
    expect(
      importsPrivateProductFromPlatform(
        'import x from "../../../apps/portal/api"',
        join(REPO_ROOT, "product", "platform", "api", "rpc", "client.ts"),
      ),
    ).toBe(true)
  })

  it("keeps shipped runtime entrypoints out of developer-only tools", () => {
    const referenced = buildReferencedToolEntrypoints()
    const missingFromAllowlist = referenced.filter(
      path => !SHIPPED_TOOLS_ALLOWLIST.has(path),
    )

    expect(missingFromAllowlist).toEqual([])
    expect(referenced).toEqual([...SHIPPED_TOOLS_ALLOWLIST].sort())
  })

  it("uses only final public product aliases", () => {
    const tsconfig = JSON.parse(
      readFileSync(join(REPO_ROOT, "tsconfig.json"), "utf8"),
    )
    const aliases = tsconfig.compilerOptions.paths

    for (const alias of LEGACY_ALIAS_NAMES) {
      expect(aliases[alias]).toBeUndefined()
    }

    for (const [alias, target] of Object.entries(FINAL_ALIAS_PATH_INVENTORY)) {
      expect(aliases[alias]).toEqual([target])
    }
  })
})
