import { describe, expect, it } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"

import {
  REPO_ROOT,
  readSource,
  repoRelative,
  sourceFiles,
} from "../../../../tools/testing/standards/source-files"

const RETIRED_GENERIC_STEAM_IMPLEMENTATION_FILES = [
  "product/platform/stream/steam-launch-spec.ts",
  "product/platform/stream/steam-launch-spec.test.ts",
  "product/platform/library/config/steam-state-materializer.ts",
  "product/platform/library/config/steam-state-materializer.test.ts",
  "product/services/device/steam-evidence-sanitizer.ts",
  "product/services/device/steam-foreground-processes.ts",
  "product/services/device/steam-foreground-processes.test.ts",
  "product/services/device/steam-launch-state.ts",
  "product/services/device/steam-log-observer.ts",
  "product/services/device/steam-log-signals.ts",
  "product/services/device/steam-log-tailer.ts",
  "product/apps/portal/api/steam/status.rpc.ts",
  "product/apps/portal/api/steam/status.rpc-handler.ts",
  "product/systems/nixos/modules/korri-steam.nix",
  "product/vendor/steam-korri",
]

const REQUIRED_PLUGIN_OWNED_STEAM_FILES = [
  "product/plugins/steam/src/launch-spec.ts",
  "product/plugins/steam/src/state-materializer.ts",
  "product/plugins/steam/src/materializer.ts",
  "product/plugins/steam/src/session/foreground-processes.ts",
  "product/plugins/steam/src/session/lifecycle-hook.ts",
  "product/plugins/steam/src/observability/log-observer.ts",
  "product/plugins/steam/src/observability/install-state.ts",
  "product/plugins/steam/src/observability/install-api.ts",
  "product/plugins/steam/src/app-control/install-trigger.ts",
  "product/plugins/steam/src/app-control/install-request-ledger.ts",
  "product/plugins/steam/nix/nixos-module.nix",
  "product/plugins/steam/packages/steam-korri/package.nix",
]

const GENERIC_TYPESCRIPT_ROOTS = [
  join(REPO_ROOT, "product", "platform"),
  join(REPO_ROOT, "product", "services"),
  join(REPO_ROOT, "product", "apps", "portal", "api"),
]

function importsSteamPlugin(source: string): boolean {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")

  return [
    ...withoutComments.matchAll(
      /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g,
    ),
  ].some(match => {
    const specifier = match[1] ?? match[2] ?? ""
    return /^(?:@product\/plugins\/steam(?:\/|$)|product\/plugins\/steam(?:\/|$))/.test(
      specifier,
    )
  })
}

describe("Steam plugin boundary", () => {
  it("keeps retired Steam implementation files out of generic core locations", () => {
    expect(
      RETIRED_GENERIC_STEAM_IMPLEMENTATION_FILES.filter(path =>
        existsSync(join(REPO_ROOT, path)),
      ),
    ).toEqual([])
  })

  it("keeps Steam launch, lifecycle, observability, and Nix ownership inside the plugin", () => {
    expect(
      REQUIRED_PLUGIN_OWNED_STEAM_FILES.filter(
        path => !existsSync(join(REPO_ROOT, path)),
      ),
    ).toEqual([])
  })

  it("keeps generic TypeScript implementation files from importing the Steam plugin directly", () => {
    const directImports = GENERIC_TYPESCRIPT_ROOTS.flatMap(root =>
      sourceFiles(root)
        .filter(file => !/\.(?:test|spec)\.tsx?$/.test(file))
        .filter(file => importsSteamPlugin(readSource(file)))
        .map(repoRelative),
    )

    expect(directImports).toEqual([])
  })
})
