import { describe, expect, it } from "bun:test"

const PLUGIN_COMPOSITION_EXPR = (enable: boolean) => `
let
  pkgs = import <nixpkgs> {};
  composition = import ./product/systems/nixos/flake/plugins.nix {
    inherit pkgs;
    enable = ${enable ? "true" : "false"};
    gamescopePackage = "gamescope-korri-package";
    controlBridgePackage = "gamescope-control-bridge-package";
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

describe("first-party Nix plugin composition", () => {
  it("discovers plugin-owned Nix compositions without central plugin imports", async () => {
    const enabled = await nixEval(PLUGIN_COMPOSITION_EXPR(true))
    expect(enabled).toEqual({
      ids: [
        "@korri:fex",
        "@korri:gamescope",
        "@korri:mega-man-arena",
        "@korri:proton-ge",
        "@korri:proton",
        "@korri:psycho-waluigi",
        "@korri:srb2",
      ],
      packages: [
        "gamescope-korri",
        "korri-fex-runtime",
        "korri-gamescope-control-bridge",
        "korri-proton-ge-runtime",
        "korri-proton-runtime",
        "mega-man-arena",
        "psycho-waluigi",
        "srb2",
      ],
      apps: [
        "gamescope-control",
        "gamescope-control-bridge",
        "korri-stream-control-bench",
      ],
      checks: [
        "mega-man-arena-check",
        "proton-ge-runtime-check",
        "psycho-waluigi-check",
        "srb2-check",
      ],
      overlayCount: 1,
      moduleCount: 1,
    })

    const disabled = await nixEval(PLUGIN_COMPOSITION_EXPR(false))
    expect(disabled).toEqual({
      ids: [],
      packages: [],
      apps: [],
      checks: [],
      overlayCount: 0,
      moduleCount: 0,
    })
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
