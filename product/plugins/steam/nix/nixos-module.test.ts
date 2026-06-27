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

  it("adds Steam materializer probe tools to the korrid service PATH", () => {
    expect(moduleSource).toContain("steamMaterializerProbePath = [")
    expect(moduleSource).toContain("pkgs.coreutils")
    expect(moduleSource).toContain("pkgs.procps")
    expect(moduleSource).toContain("pkgs.systemd")
    expect(moduleSource).toContain("systemd.user.services.korrid =")
    expect(moduleSource).toContain("systemd.services.korrid =")
    expect(moduleSource).toContain("path = steamMaterializerProbePath")
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
      "environment.KORRI_STEAM_APP_INSTALL_HELPER",
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

  it("routes AppID launches through the gamescoped SteamOS desktop client", () => {
    expect(moduleSource).toContain(
      `service_name="''\${KORRI_STEAM_SERVICE:-korri-steam-gamescope.service}"`,
    )
    expect(moduleSource).toContain("systemd.services.korri-steam-gamescope")
    expect(moduleSource).toContain("systemd.services.korri-steam")
    expect(moduleSource).toContain("-steamos3")
    expect(moduleSource).toContain("-steampal")
    expect(moduleSource).toContain("-steamdeck")
    expect(moduleSource).toContain("-silent")
    expect(moduleSource).toContain("useGamepadUi")
    expect(moduleSource).toContain('lib.optional cfg.useGamepadUi "-gamepadui"')
    expect(moduleSource).toContain("steamClientArgs")
    expect(moduleSource).not.toContain("starting Steam directly without sudo")
    expect(moduleSource).not.toContain("direct_steam_pid")
  })

  it("keeps Gamescope output selection device-configurable", () => {
    expect(moduleSource).toContain("gamescopePreferOutput")
    expect(moduleSource).toContain("types.nullOr types.str")
    expect(moduleSource).toContain('cfg.gamescopePreferOutput != null')
    expect(moduleSource).toContain('"-O"')
    expect(moduleSource).not.toContain("-O DSI-")
    expect(moduleSource).not.toContain("focus output")
    expect(moduleSource).not.toContain("move to output")
  })

  it("scopes Steam Input devices away from generic app input", () => {
    expect(moduleSource).toContain('steamInputGroup = "korri-steam-input"')
    expect(moduleSource).toContain("users.groups.${steamInputGroup}")
    expect(moduleSource).toContain("services.udev.extraRules = lib.mkAfter")
    expect(moduleSource).toContain('KERNEL=="uinput"')
    expect(moduleSource).toContain('ATTRS{id/vendor}=="28de"')
    expect(moduleSource).toContain('ATTRS{id/product}=="11ff"')
    expect(moduleSource).toContain('TAG-="uaccess"')
    expect(moduleSource).toContain("setfacl -b $env{DEVNAME}")
    expect(moduleSource).toContain("SupplementaryGroups = [ steamInputGroup ]")
  })

  it("requires gamescoped Steam readiness before forwarding an AppID", () => {
    expect(moduleSource).toContain("wait_for_steam_ready")
    expect(moduleSource).toContain("GAMESCOPE_WAYLAND_DISPLAY")
    expect(moduleSource).toContain("gamescope-0")
    expect(moduleSource).toContain('[ -S "$gamescope_socket" ]')
    expect(moduleSource).toContain("Waiting for compat in post-logon")
    expect(moduleSource).toContain("Loaded Config for Local Selection Path")
    expect(moduleSource).not.toContain("steam_big_picture_window_present")
    expect(moduleSource).not.toContain("Steam Big Picture Mode")
    expect(moduleSource).not.toContain(
      "Console Log Start|Waiting for compat in post-logon",
    )
    expect(moduleSource).toContain(
      "timed out waiting for gamescoped Steam readiness before AppID launch",
    )
  })

  it("treats cold and warm gamescoped Steam startup as one idempotent ensure", () => {
    expect(moduleSource).toContain("request_steam_service_start()")
    expect(moduleSource).toContain("service_start_attempted_at=0")
    expect(moduleSource).toContain("systemctl reset-failed korri-steam-gamescope.service")
    expect(moduleSource).toContain("systemctl --user restart korri-steam-warm.service")
    expect(moduleSource).toContain('inactive)')
    expect(moduleSource).toContain("if ! request_steam_service_start; then")
    expect(moduleSource).toContain("RemainAfterExit = false")
  })

  it("bounds service-control waits before relying on the readiness loop", () => {
    expect(moduleSource).toContain("systemctl --no-block start")
    expect(moduleSource).toContain("KORRI_STEAM_APP_SYSTEMCTL_TIMEOUT")
    expect(moduleSource).toContain(
      "timeout 5 " + "$" + "{pkgs.systemd}/bin/systemctl is-active",
    )
    expect(moduleSource).toContain("steam_service_state")
    expect(moduleSource).not.toMatch(
      /\n\s+if ! \$\{pkgs\.systemd\}\/bin\/systemctl is-active --quiet/,
    )
    expect(moduleSource).not.toContain(
      "Steam service is not active after start",
    )
  })

  it("bounds AppID URL forwarding before launch observation", () => {
    expect(moduleSource).toContain("KORRI_STEAM_APP_FORWARD_TIMEOUT")
    expect(moduleSource).toContain(
      "timed out forwarding AppID $appid to Steam",
    )
  })

  it("accepts existing readiness evidence for prewarmed gamescoped Steam", () => {
    expect(moduleSource).toContain("service_was_active=0")
    expect(moduleSource).toContain("service_was_active=1")
    expect(moduleSource).toContain(
      "A deliberately prewarmed gamescoped Steam session emits its",
    )
    expect(moduleSource).toContain(
      "existing evidence as long as the gamescope socket is present",
    )
    expect(moduleSource).toContain(
      'ready_log="$(' + "$" + "{pkgs.coreutils}/bin/cat",
    )
  })

  it("lets managed Steam services run first-launch bootstrap repair", () => {
    expect(moduleSource).toContain(
      "Apply\n      # this to explicit Steam client invocations too",
    )
    expect(moduleSource).toContain("set -- \"''" + "$" + '{filtered[@]}"')
    expect(moduleSource).toContain(
      'ExecStart = "' + "$" + "{pkgs.gamescope}/bin/gamescope " + "$" + "{gamescopeArgs}",
    )
  })

  it("declares a stable ARM64 Steam tracking channel", () => {
    expect(moduleSource).toContain("betaChannel = mkOption")
    expect(moduleSource).toContain('default = "steamdeck_stable"')
    expect(moduleSource).toContain("STEAM_BETA = cfg.betaChannel")
    expect(moduleSource).not.toContain('STEAM_BETA = "publicbeta"')
  })

  it("checks first-launch markers for the configured channel only", () => {
    expect(moduleSource).toContain(
      "steam_client_${cfg.betaChannel}_linuxarm64.installed",
    )
    expect(moduleSource).not.toContain("-name 'steam_client_*_linuxarm64.installed'")
  })

  it("does not run Steam-owned runtime prep in normal launch ordering", () => {
    expect(moduleSource).not.toContain("systemd.paths.korri-steam-runtime-prep")
    expect(moduleSource).not.toContain('"korri-steam-runtime-prep.service"')
    expect(moduleSource).not.toContain("steam-guest-runtime-prep --apply")
    expect(moduleSource).not.toContain("SteamLinuxRuntime_sniper/pressure-vessel")
  })

  it("exposes a backup-first Steam recovery helper", () => {
    expect(moduleSource).toContain('pkgs.writeShellScriptBin "korri-steam-recover"')
    expect(moduleSource).toContain("steam_client_${cfg.betaChannel}_linuxarm64")
    expect(moduleSource).toContain("must run as root")
    expect(moduleSource).toContain("refusing package repair while $service is $state")
    expect(moduleSource).toContain("cp -a \"$package_dir\" \"$backup_dir\"")
    expect(moduleSource).toContain("rm -f \"$pending_marker\"")
    expect(moduleSource).toContain("u${toString runtime.uid}-ValveIPCSharedObj-Steam")
    expect(moduleSource).not.toContain("/dev/shm/u*-ValveIPCSharedObj-Steam")
  })

  it("makes Steam update relaunch exits explicit and restartable", () => {
    expect(moduleSource).toContain('RestartForceExitStatus = [ 42 ]')
    expect(moduleSource).toContain('startLimitBurst = 30')
    expect(moduleSource).toContain('startLimitIntervalSec = "5min"')
  })

  it("recognizes Steam process removal log lines", () => {
    expect(moduleSource).toContain("Game process removed: AppID $appid")
    expect(moduleSource).toContain("Game process removed : AppID $appid")
  })

  it("interrupts best-effort launch focus and audio waits when Steam reports exit", () => {
    expect(moduleSource).toContain("app_removed_since_mark()")
    expect(moduleSource).toContain("if app_removed_since_mark; then")
    expect(moduleSource).toContain("if ! focus_game; then")
    expect(moduleSource).toContain("if ! repair_game_audio; then")
  })

  it("forwards AppIDs into the warm Steam client without a raw applaunch fallback", () => {
    expect(moduleSource).toContain('"steam://rungameid/$appid"')
    expect(moduleSource).not.toContain('-applaunch "$appid"')
  })
})
