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
  overlayCount = builtins.length composition.overlays;
  moduleCount = builtins.length composition.nixosModules;
}
`

describe("first-party Nix plugin composition", () => {
  it("exposes Gamescope packages/apps only when the Gamescope plugin is enabled", async () => {
    const enabled = await nixEval(PLUGIN_COMPOSITION_EXPR(true))
    expect(enabled).toEqual({
      ids: ["@korri:gamescope"],
      packages: ["gamescope-korri", "korri-gamescope-control-bridge"],
      apps: [
        "gamescope-control",
        "gamescope-control-bridge",
        "korri-stream-control-bench",
      ],
      overlayCount: 1,
      moduleCount: 1,
    })

    const disabled = await nixEval(PLUGIN_COMPOSITION_EXPR(false))
    expect(disabled).toEqual({
      ids: [],
      packages: [],
      apps: [],
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
