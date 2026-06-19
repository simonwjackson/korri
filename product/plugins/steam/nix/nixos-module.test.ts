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
    expect(moduleSource).toContain(
      "systemd.user.services.korrid.environment.KORRI_STEAM_APP_INSTALL_HELPER",
    )
  })

  it("keeps Steam visible only through an explicit launch-debug switch", () => {
    expect(moduleSource).toContain("keepVisibleDuringLaunch")
    expect(moduleSource).toContain("KORRI_STEAM_KEEP_VISIBLE")
    expect(moduleSource).toContain('if [ "$keep_steam_visible" != "0" ]; then')
    expect(moduleSource).toContain(
      "korri-steam-app: leaving Steam visible for Steam launch debugging",
    )
    expect(moduleSource).toContain(
      'sway \'[class="steam"] fullscreen disable, floating enable, move scratchpad\'',
    )
  })
})
