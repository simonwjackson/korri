import { describe, expect, it } from "bun:test"

const PLUGIN_COMPOSITION_EXPR = (enable: boolean) => `
let
  pkgs = import <nixpkgs> {};
  composition = import ./product/systems/nixos/flake/plugins.nix {
    inherit pkgs;
    enable = ${enable ? "true" : "false"};
    pluginArgs = {
      gamescopePackage = "gamescope-korri-package";
      controlBridgePackage = "gamescope-control-bridge-package";
      fake-08-src = ./.;
      nixpkgs-godot = { legacyPackages = {}; };
      nixpkgs-mesa = { legacyPackages = {}; };
    };
  };
in {
  ids = composition.enabledPluginIds;
  packages = builtins.attrNames composition.packages;
  apps = builtins.attrNames composition.apps;
  checks = builtins.attrNames composition.checks;
  overlayCount = builtins.length composition.overlays;
  moduleCount = builtins.length composition.nixosModules;
}
`

const DISABLED_DEFAULT_ARGS_EXPR = `
let
  pkgs = import <nixpkgs> {};
  composition = import ./product/systems/nixos/flake/plugins.nix {
    inherit pkgs;
    enable = false;
  };
in composition.enabledPluginIds
`

type CompositionSummary = {
  readonly ids: readonly string[]
  readonly packages: readonly string[]
  readonly apps: readonly string[]
  readonly checks: readonly string[]
  readonly overlayCount: number
  readonly moduleCount: number
}

describe("first-party Nix plugin composition", () => {
  it("discovers plugin-owned Nix compositions without central plugin imports", async () => {
    const enabled = (await nixEval(
      PLUGIN_COMPOSITION_EXPR(true),
    )) as CompositionSummary

    expect(enabled.ids).toEqual(
      expect.arrayContaining([
        "@korri:gamescope",
        "@korri:pico8",
        "@korri:portmaster",
        "@korri:retroarch",
        "@korri:ryubing",
      ]),
    )
    expect(enabled.packages).toEqual(
      expect.arrayContaining([
        "gamescope-korri",
        "korri-gamescope-control-bridge",
        "libretro-fake-08",
        "portmaster",
        "ryubing-korri",
      ]),
    )
    expect(enabled.apps).toEqual([
      "gamescope-control",
      "gamescope-control-bridge",
      "korri-stream-control-bench",
    ])
    expect(enabled.moduleCount).toBeGreaterThan(2)
    expect(enabled.ids.length).toBeGreaterThan(1)
    expect(enabled.packages.length).toBeGreaterThan(2)
    expect(enabled.checks).toEqual(
      expect.arrayContaining(["libretro-fake-08-check", "portmaster-check"]),
    )
    expect(enabled.checks.length).toBeGreaterThan(0)
    expect(enabled.overlayCount).toBeGreaterThan(0)

    const disabled = await nixEval(PLUGIN_COMPOSITION_EXPR(false))
    expect(disabled).toEqual({
      ids: [],
      packages: [],
      apps: [],
      checks: [],
      overlayCount: 0,
      moduleCount: 0,
    })

    expect(await nixEval(DISABLED_DEFAULT_ARGS_EXPR)).toEqual([])
  })
})

async function nixEval(expr: string): Promise<unknown> {
  const proc = Bun.spawn(
    ["nix", "eval", "--impure", "--json", "--expr", expr],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `nix eval exited ${exitCode}`)
  }
  return JSON.parse(stdout)
}
