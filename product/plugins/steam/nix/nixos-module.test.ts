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
      `\${pkgs.systemd}/bin/systemctl is-active --quiet "$service_name"`,
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
      "sway '[class=\"steam\"] fullscreen disable, floating enable, move scratchpad'",
    )
  })

  it("routes AppID launches through the gamescoped Steam Big Picture service", () => {
    expect(moduleSource).toContain(
      `service_name="''\${KORRI_STEAM_SERVICE:-korri-steam-gamescope.service}"`,
    )
    expect(moduleSource).toContain("systemd.services.korri-steam-gamescope")
    expect(moduleSource).toContain("gamescope")
    expect(moduleSource).toContain("-gamepadui")
    expect(moduleSource).toContain("-steamos3")
    expect(moduleSource).toContain("-steampal")
    expect(moduleSource).toContain("-steamdeck")
    expect(moduleSource).not.toContain("starting Steam directly without sudo")
    expect(moduleSource).not.toContain("direct_steam_pid")
  })

  it("requires gamescope and Big Picture evidence before forwarding an AppID", () => {
    expect(moduleSource).toContain("wait_for_gamescoped_steam_ready")
    expect(moduleSource).toContain("GAMESCOPE_WAYLAND_DISPLAY")
    expect(moduleSource).toContain("gamescope-0")
    expect(moduleSource).toContain("steam_big_picture_window_present")
    expect(moduleSource).toContain("Steam Big Picture Mode")
    expect(moduleSource).toContain("Waiting for compat in post-logon")
    expect(moduleSource).not.toContain(
      "Console Log Start|Waiting for compat in post-logon",
    )
    expect(moduleSource).toContain(
      "timed out waiting for gamescoped Steam readiness before AppID launch",
    )
  })

  it("bounds service-control waits before relying on the readiness loop", () => {
    expect(moduleSource).toContain("systemctl --no-block start")
    expect(moduleSource).toContain("KORRI_STEAM_APP_SYSTEMCTL_TIMEOUT")
    expect(moduleSource).toContain("/bin/timeout")
  })

  it("accepts existing readiness evidence for prewarmed gamescoped Steam", () => {
    expect(moduleSource).toContain("service_was_active=0")
    expect(moduleSource).toContain("service_was_active=1")
    expect(moduleSource).toContain(
      "A deliberately prewarmed gamescoped Steam session emits its",
    )
    expect(moduleSource).toContain(
      'ready_log="$(' + "$" + "{pkgs.coreutils}/bin/cat",
    )
  })

  it("lets the gamescoped Big Picture service run first-launch bootstrap repair", () => {
    expect(moduleSource).toContain(
      "Apply\n      # this to explicit gamescoped Big Picture invocations too",
    )
    expect(moduleSource).toContain("set -- \"''" + "$" + '{filtered[@]}"')
    expect(moduleSource).toContain(
      'ExecStart = "' + "$" + "{pkgs.gamescope}/bin/gamescope",
    )
  })

  it("forwards AppIDs into the warm Steam client without a raw applaunch fallback", () => {
    expect(moduleSource).toContain('"steam://rungameid/$appid"')
    expect(moduleSource).not.toContain('-applaunch "$appid"')
  })
})
