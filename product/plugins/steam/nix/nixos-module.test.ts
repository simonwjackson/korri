import { describe, expect, it } from "bun:test"

const moduleSource = await Bun.file(
  "product/plugins/steam/nix/nixos-module.nix",
).text()

describe("Steam plugin Nix module", () => {
  it("uses the Nix-provided systemctl in the AppID launcher", () => {
    expect(moduleSource).not.toContain(
      'if /bin/systemctl is-active --quiet "$service_name"',
    )
    expect(moduleSource).toContain(
      `if \${pkgs.systemd}/bin/systemctl is-active --quiet "$service_name"`,
    )
  })

  it("exposes a narrow Steam AppID install helper", () => {
    expect(moduleSource).toContain(
      'pkgs.writeShellScriptBin "korri-steam-app-install"',
    )
    expect(moduleSource).toContain(
      'korri-steam-guest -console +app_install "$appid"',
    )
    expect(moduleSource).toContain("KORRI_STEAM_APP_INSTALL_HELPER")
  })
})
