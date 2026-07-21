import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "bun:test"

const moduleSource = await Bun.file(
  "product/plugins/steam/nix/nixos-module.nix",
).text()

function generatedShellFunction(name: string): string {
  const start = moduleSource.indexOf(`    ${name}() {`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = moduleSource.indexOf("\n    }\n\n", start)
  expect(end).toBeGreaterThan(start)
  return moduleSource
    .slice(start, end + "\n    }".length)
    .replace(/^    /gm, "")
}

async function runGeneratedServiceFailureClassifier(input: {
  readonly active: string
  readonly result: string
  readonly status: string
}) {
  const dir = await mkdtemp(join(tmpdir(), "korri-steam-classifier-"))
  const scriptPath = join(dir, "classify.sh")
  const classifier = generatedShellFunction(
    "service_failure_classification",
  ).replaceAll(
    "${pkgs.coreutils}/bin/timeout 5 ${pkgs.systemd}/bin/systemctl",
    "systemctl",
  )
  await writeFile(
    scriptPath,
    `#!/usr/bin/env bash
set -eu
service_name=korri-steam-gamescope.service
systemctl() {
  case "$1" in
    is-active) printf '%s\\n' "$TEST_ACTIVE" ;;
    show)
      case "$4" in
        Result) printf '%s\\n' "$TEST_RESULT" ;;
        ExecMainStatus) printf '%s\\n' "$TEST_STATUS" ;;
      esac
      ;;
  esac
}
${classifier}
if failure_kind="$(service_failure_classification)"; then
  printf '%s\\n' "$failure_kind"
  exit 126
fi
printf 'no-failure\\n'
`,
  )
  const proc = Bun.spawn(["bash", scriptPath], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      TEST_ACTIVE: input.active,
      TEST_RESULT: input.result,
      TEST_STATUS: input.status,
    },
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  await rm(dir, { recursive: true, force: true })
  return { stdout: stdout.trim(), stderr, exitCode }
}

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
      'policy_stamp="$STEAM_HOME/.korri/install-policy-prepared/$appid"',
    )
    expect(moduleSource).toContain("Steam install policy has not been prepared")
    expect(moduleSource).toContain(
      'korri-steam-guest ${steamClientArgs} -console +app_install "$appid"',
    )
    expect(moduleSource).not.toContain(
      'korri-steam-guest -console +app_install "$appid"',
    )
    expect(moduleSource).toContain("KORRI_STEAM_APP_INSTALL_HELPER")
    expect(moduleSource).toContain("environment.KORRI_STEAM_APP_INSTALL_HELPER")
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

  it("routes all managed Steam launches through the managed Steam service", () => {
    expect(moduleSource).toContain(
      'service_name="korri-steam-gamescope.service"',
    )
    expect(moduleSource).not.toContain("KORRI_STEAM_SERVICE")
    expect(moduleSource).toContain("systemd.services.korri-steam-gamescope")
    expect(moduleSource).toContain(
      'type = types.enum [ "gamescope" "desktop" ]',
    )
    expect(moduleSource).toContain('default = "gamescope"')
    expect(moduleSource).toContain('cfg.presentationMode == "gamescope"')
    expect(moduleSource).not.toMatch(/systemd\.services\.korri-steam\s*=/)
    expect(moduleSource).not.toContain('conflicts = [ "korri-steam.service" ]')
    expect(moduleSource).not.toContain('"-steamos3"')
    expect(moduleSource).not.toContain('"-steampal"')
    expect(moduleSource).not.toContain('"-steamdeck"')
    expect(moduleSource).not.toContain('"-silent"')
    expect(moduleSource).toContain("useGamepadUi")
    expect(moduleSource).toContain('lib.optional cfg.useGamepadUi "-gamepadui"')
    expect(moduleSource).toContain('"-clientbeta"')
    expect(moduleSource).toContain("cfg.betaChannel")
    expect(moduleSource).toContain("steamClientArgs")
    expect(moduleSource).toContain("steamServiceExec")
    expect(moduleSource).toContain("XDG_CURRENT_DESKTOP=sway")
    expect(moduleSource).not.toContain("starting Steam directly without sudo")
    expect(moduleSource).not.toContain("direct_steam_pid")
  })

  it("presents through the plugin-owned patched gamescope-korri package", () => {
    // Touch delivery and nested-presentation fixes live in gamescope-korri's
    // patch series. Steam must not silently fall back to an unpatched nixpkgs
    // gamescope: the wrapper is the only touch-facing gamescope surface, so a
    // raw pkgs.gamescope reference reintroduces the dropped-touch regression.
    expect(moduleSource).toContain("gamescopePackage = mkOption")
    expect(moduleSource).toContain(
      "default = pkgs.gamescope-korri or pkgs.gamescope",
    )
    expect(moduleSource).toContain("${cfg.gamescopePackage}/bin/gamescope")
    expect(moduleSource).not.toContain("${pkgs.gamescope}/bin/gamescope")
  })

  it("keeps Gamescope output selection device-configurable without SteamOS integration", () => {
    expect(moduleSource).toContain("gamescopePreferOutput")
    expect(moduleSource).toContain("types.nullOr types.str")
    expect(moduleSource).toContain("cfg.gamescopePreferOutput != null")
    expect(moduleSource).toContain('"-O"')
    expect(moduleSource).not.toContain('"-e"')
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

  it("guards Home/Guide at the Steam process boundary", () => {
    expect(moduleSource).toContain("steamInputGuardEnv = lib.escapeShellArgs")
    expect(moduleSource).toContain('"KORRI_STEAM_INPUT_GUARD=1"')
    expect(moduleSource).toContain(
      '"LD_PRELOAD=${cfg.package}/lib/libkorri-steam-input-guard.so"',
    )
    expect(moduleSource).toContain(
      "XDG_CURRENT_DESKTOP=sway ${steamInputGuardEnv} ${steamLauncher}/bin/korri-steam-guest",
    )
    expect(moduleSource).toContain(
      "${pkgs.coreutils}/bin/env ${steamInputGuardEnv} ${steamLauncher}/bin/korri-steam-guest",
    )
    expect(moduleSource).toContain(
      "direct install/forward stubs inherit the same policy",
    )
    expect(moduleSource).toContain(
      "export KORRI_STEAM_INPUT_GUARD=\"''${KORRI_STEAM_INPUT_GUARD:-1}\"",
    )
    expect(moduleSource).toContain("EVIOCGRAB attempts")
    expect(moduleSource).not.toContain("gamepad:\n        button: Guide")
  })

  it("requires managed Steam readiness before forwarding an AppID", () => {
    expect(moduleSource).toContain("wait_for_steam_ready")
    expect(moduleSource).toContain("GAMESCOPE_WAYLAND_DISPLAY")
    expect(moduleSource).toContain("gamescope-0")
    expect(moduleSource).toContain("require_gamescope_socket")
    expect(moduleSource).toContain("steam_surface_ready")
    expect(moduleSource).toContain("steam_desktop_ui_ready")
    expect(moduleSource).toContain("steam_service_control_group")
    expect(moduleSource).toContain("pid_in_service_control_group")
    expect(moduleSource).toContain(
      "KORRI_STEAM_APP_DESKTOP_UI_READY_STABLE_SECONDS",
    )
    expect(moduleSource).toContain("KORRI_STEAM_APP_SERVICE_READY_TIMEOUT:-600")
    expect(moduleSource).toContain(
      "KORRI_STEAM_APP_STARTUP_UPDATE_TIMEOUT:-900",
    )
    expect(moduleSource).toContain("desktop_ready_since=0")
    expect(moduleSource).toContain("steam_ready_log_present")
    expect(moduleSource).toContain("steam_startup_update_active")
    expect(moduleSource).toContain(
      "observed Steam startup self-update; deferring AppID forward until it completes",
    )
    // Readiness must not be accepted while a Steam startup update is active.
    expect(moduleSource).toContain("update_active=1")
    expect(moduleSource).toContain(
      'if [ "$update_active" -eq 0 ] && steam_surface_ready && steam_desktop_ui_ready; then',
    )
    expect(moduleSource).toContain('*steamwebhelper*" -uimode=7"*) return 0')
    expect(moduleSource).toContain("big_picture_surface_present")
    expect(moduleSource).toContain(
      'note_big_picture_surface "managed Steam readiness"',
    )
    expect(moduleSource).toContain(
      'note_big_picture_surface "AppID $appid launch forwarding"',
    )
    expect(moduleSource).toContain(
      'note_big_picture_surface "AppID $appid launch observation"',
    )
    expect(moduleSource).toContain(
      '[ "$require_gamescope_socket" != "1" ] || [ -S "$gamescope_socket" ]',
    )
    expect(moduleSource).toContain(
      'if [ "$update_active" -eq 0 ] && steam_surface_ready && steam_desktop_ui_ready; then',
    )
    expect(moduleSource).toContain(
      'if [ "$update_active" -eq 0 ] && steam_surface_ready \\\n          && { [ "$desktop_ui_ready" -eq 1 ] || steam_ready_log_present',
    )
    expect(moduleSource).not.toContain(
      'if [ -S "$gamescope_socket" ] \\\n          && printf',
    )
    expect(moduleSource).toContain("Waiting for compat in post-logon")
    expect(moduleSource).toContain("Loaded Config for Local Selection Path")
    expect(moduleSource).not.toContain("steam_big_picture_window_present")
    expect(moduleSource).not.toContain(
      "Console Log Start|Waiting for compat in post-logon",
    )
    expect(moduleSource).toContain(
      "timed out waiting for managed Steam readiness before AppID launch",
    )
  })

  it("treats cold and warm gamescoped Steam startup as one idempotent ensure", () => {
    expect(moduleSource).toContain("request_steam_service_start()")
    expect(moduleSource).toContain("service_start_attempted_at=0")
    expect(moduleSource).toContain(
      "systemctl reset-failed korri-steam-gamescope.service",
    )
    // Start is routed through the always-present user-manager ensure unit, which
    // reliably elevates where the transient sessiond launch child cannot.
    expect(moduleSource).toContain(
      "systemctl --user start korri-steam-ensure.service",
    )
    expect(moduleSource).not.toContain(
      "systemctl --user restart korri-steam-warm.service",
    )
    expect(moduleSource).not.toContain("overridden service $service_name")
    expect(moduleSource).toContain("inactive)")
    expect(moduleSource).toContain("if ! request_steam_service_start; then")
    expect(moduleSource).toContain("RemainAfterExit = false")
  })

  it("provides an always-present on-demand ensure unit for AppID launches", () => {
    // Unlike korri-steam-warm (gated on keepWarm), the ensure unit must always
    // exist so keepWarm = false hosts can still start managed Steam on a
    // launch, and it must not auto-start at boot (no wantedBy) to preserve the
    // no-warm-Steam-at-boot policy.
    expect(moduleSource).toContain(
      "systemd.user.services.korri-steam-ensure = {",
    )
    const ensureBlock = moduleSource.match(
      /systemd\.user\.services\.korri-steam-ensure = \{[\s\S]*?\n    \};/,
    )?.[0]
    expect(ensureBlock).toBeDefined()
    expect(ensureBlock).not.toContain("wantedBy")
    expect(ensureBlock).not.toContain("lib.mkIf cfg.keepWarm")
    expect(ensureBlock).toContain(
      'ExecStart = "${steamWarmup}/bin/korri-steam-warm"',
    )
  })

  it("re-forwards the AppID when gamescope aborts before the game launches", () => {
    // Upstream gamescope Wayland-backend abort race (#1456) restarts the managed
    // Steam service with a new InvocationID before the game appears, killing the
    // forwarded -applaunch. The wrapper must detect the restart and re-forward
    // to the recovered client instead of waiting out the launch timeout.
    expect(moduleSource).toContain("steam_service_invocation()")
    expect(moduleSource).toContain("launch_invocation=")
    expect(moduleSource).toContain("reforward_limit=")
    expect(moduleSource).toContain("KORRI_STEAM_APP_REFORWARD_LIMIT:-3")
    // The re-forward path waits for readiness and re-issues the launch, bounded
    // by the limit so a persistent crash still terminates rather than looping.
    expect(moduleSource).toContain(
      "if wait_for_steam_ready && forward_appid; then",
    )
    expect(moduleSource).toContain(
      "giving up after $reforward_limit re-forwards",
    )
    // The restart is detected by a changed systemd InvocationID.
    expect(moduleSource).toContain(
      'current_invocation="$(steam_service_invocation)"',
    )
    expect(moduleSource).toContain(
      '[ "$current_invocation" != "$launch_invocation" ]',
    )
  })

  it("exposes explicit service drain and reset operations for AppID handoff", () => {
    expect(moduleSource).toContain(
      "usage: korri-steam-service-control <start|stop|drain|reset>",
    )
    expect(moduleSource).toContain("drain) drain_service ;;")
    expect(moduleSource).toContain("reset) reset_service ;;")
    expect(moduleSource).toContain(
      "systemctl show korri-steam-gamescope.service",
    )
    expect(moduleSource).toContain("InvocationID")
    expect(moduleSource).toContain("NRestarts")
    expect(moduleSource).toContain(
      "systemctl kill -s SIGKILL --kill-whom=all korri-steam-gamescope.service",
    )
    expect(moduleSource).not.toContain("pkill -f gamescope")
    expect(moduleSource).not.toContain("pkill -f steam")
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

  it("resets stale Steam AppID foreground state before marking the new launch", () => {
    expect(moduleSource).toContain("active_steam_appids()")
    expect(moduleSource).toContain("SteamLaunch AppId=")
    expect(moduleSource).toContain(
      "active_steam_appids|grep|gawk|awk|sed|korri-steam-app",
    )
    expect(moduleSource).toContain("reset_for_exclusive_appid_handoff")
    expect(moduleSource).toContain("control_steam_service reset")
    expect(moduleSource).toContain("mark_current_console_log")
    expect(
      moduleSource.indexOf("reset_for_exclusive_appid_handoff"),
    ).toBeLessThan(moduleSource.indexOf("mark_current_console_log"))
    expect(moduleSource).toContain("SteamLaunch AppId=")
  })

  it("bounds AppID URL forwarding before launch observation", () => {
    expect(moduleSource).toContain("KORRI_STEAM_APP_FORWARD_TIMEOUT")
    expect(moduleSource).toContain(
      'korri-steam-guest ${steamClientArgs} -applaunch "$appid"',
    )
    expect(moduleSource).not.toContain('korri-steam-guest -applaunch "$appid"')
    expect(moduleSource).toContain("timed out forwarding AppID $appid to Steam")
  })

  it("accepts existing readiness evidence for prewarmed managed Steam", () => {
    expect(moduleSource).toContain("service_was_active=0")
    expect(moduleSource).toContain("service_was_active=1")
    expect(moduleSource).toContain(
      "A deliberately prewarmed Steam session emits its readiness lines",
    )
    expect(moduleSource).toContain(
      "presentation surface for the configured mode is present",
    )
    expect(moduleSource).toContain(
      'ready_log="$(' + "$" + "{pkgs.coreutils}/bin/cat",
    )
  })

  it("lets managed Steam self-update instead of suppressing bootstrap", () => {
    const defaultArgs = moduleSource.match(
      /defaultSteamArgs = \[([\s\S]*?)\n  \];/,
    )?.[1]
    expect(defaultArgs).toBeDefined()
    expect(defaultArgs).toContain("-nobigpicture")
    expect(defaultArgs).not.toContain("-vgui")
    expect(defaultArgs).not.toContain("-noverifyfiles")
    expect(defaultArgs).not.toContain("-nobootstrapupdate")
    expect(defaultArgs).not.toContain("-skipinitialbootstrap")
    expect(defaultArgs).not.toContain("-norepairfiles")
    expect(moduleSource).toContain("Keep managed Steam self-updating")
    expect(moduleSource).toContain("set -- \"''" + "$" + '{filtered[@]}"')
    expect(moduleSource).toContain(
      'ExecStart = "${steamServiceRunner}/bin/korri-steam-service-run"',
    )
    expect(moduleSource).toContain(
      '"' +
        "$" +
        "{cfg.gamescopePackage}/bin/gamescope " +
        "$" +
        "{gamescopeArgs}",
    )
    expect(moduleSource).toContain(
      "-- ${pkgs.coreutils}/bin/env -u GAMESCOPE_WAYLAND_DISPLAY -u LIBEI_SOCKET -u STEAM_GAME_DISPLAY_0 -u ENABLE_GAMESCOPE_WSI -u WAYLAND_DISPLAY XDG_CURRENT_DESKTOP=sway",
    )
    expect(moduleSource).toContain("korri-steam-service-run")
    expect(moduleSource).not.toContain("set_guide_intercept")
    expect(moduleSource).not.toContain('InterceptMode u \"$mode\"')
    expect(moduleSource).toContain('steam_workspace=\"')
    expect(moduleSource).toContain("KORRI_STEAM_WORKSPACE:-korri:steam-debug")
    // Placement must be a continuous reconcile, not one-shot. Gamescope
    // recreates its surface when the game starts rendering, so Sway remaps the
    // window onto the focused hub workspace after the initial move; a latched
    // placement (workspace_placed) never corrected that and left the running
    // game invisibly behind the Korri GUI.
    expect(moduleSource).not.toContain("workspace_placed")
    expect(moduleSource).toContain(
      'reconcile_gamescope_workspace "$gamescope_pid"',
    )
    const reconcileBlock = moduleSource.match(
      /reconcile_gamescope_workspace\(\) \{[\s\S]*?\n    \}/,
    )?.[0]
    expect(reconcileBlock).toBeDefined()
    // Idempotent: once the window is already on the managed workspace, do
    // nothing and do NOT steal focus, so Home+L1/R1 can leave the user on the
    // Korri GUI while the game keeps running there.
    expect(reconcileBlock).toContain('[ "$current_ws" = "$steam_workspace" ]')
    // On drift (initial hub map or a post-launch surface remap), move it back
    // fullscreen AND reveal it by switching Sway to the managed workspace.
    expect(reconcileBlock).toContain('"[pid=$pid] move container to workspace')
    expect(reconcileBlock).toContain('"workspace \\"$steam_workspace\\""')
    expect(moduleSource).toContain('accepted_ui_pid=\"\"')
    expect(moduleSource).toContain("while true; do")
    expect(moduleSource).toContain("guard_status=77")
    expect(moduleSource).toContain('steamwebhelper*\" -uimode=4\"*')
    expect(moduleSource).toContain('stop_gamescope \"$gamescope_pid\"')
  })

  it("declares a stable ARM64 Steam tracking channel", () => {
    expect(moduleSource).toContain("betaChannel = mkOption")
    expect(moduleSource).toContain('default = "steamdeck_stable"')
    expect(moduleSource).toContain("STEAM_BETA = cfg.betaChannel")
    expect(moduleSource).not.toContain('STEAM_BETA = "publicbeta"')
  })

  it("checks first-launch markers for the configured channel only", () => {
    expect(moduleSource).toContain(
      "steam_client_''${STEAM_BETA}_linuxarm64.installed",
    )
    expect(moduleSource).not.toContain(
      "-name 'steam_client_*_linuxarm64.installed'",
    )
  })

  it("adopts the current server ARM64 client manifest instead of pinning the stale installed version", () => {
    expect(moduleSource).toContain("repair_arm64_client_manifest()")
    expect(moduleSource).toContain(
      "steam_client_''${STEAM_BETA}_linuxarm64.manifest",
    )
    expect(moduleSource).toContain("${pkgs.curl}/bin/curl -fsSL")
    expect(moduleSource).toContain(
      "https://client-update.fastly.steamstatic.com/steam_client_''${STEAM_BETA}_linuxarm64",
    )
    // Online: adopt the server manifest verbatim so Steam can self-update and
    // converge on the current client version.
    expect(moduleSource).toContain(
      'mv -f "$downloaded_manifest" "$manifest_file"',
    )
    // The stale version-pinning rewrite must be gone: it caused the perpetual
    // updater loop by forcing Steam back to the seeded client version.
    expect(moduleSource).not.toContain('!replaced && $1 == "\\"version\\""')
    // Offline fallback still writes a minimal beta-channel manifest to avoid the
    // generic linuxarm64 404 loop.
    expect(moduleSource).toContain("Offline fallback only")
    expect(moduleSource).toContain('"linuxarm64"')
    expect(moduleSource).not.toContain("steam_client_linuxarm64.manifest")
  })

  it("keeps recovery from mutating Steam Runtime helper files", () => {
    expect(moduleSource).not.toContain(
      "steam-guest-runtime-prep --repair-runtime-helpers",
    )
    expect(moduleSource).toContain(
      "korri-steam-recover: leaving Steam Runtime helper files Steam-owned",
    )
  })

  it("treats Big Picture-titled desktop surfaces as diagnostic-only", () => {
    expect(moduleSource).toContain("has_big_picture_surface()")
    expect(moduleSource).toContain("Steam Big Picture")
    expect(moduleSource).toContain("Steam Deck")
    expect(moduleSource).toContain(
      "observed Steam Big Picture-titled surface while Steam remains managed; continuing unless uimode=4 appears",
    )
    expect(moduleSource).toContain(
      "korri-steam-app: observed Steam Big Picture-titled surface during $phase; continuing unless uimode=4 appears",
    )
    expect(moduleSource).toContain('steamwebhelper*" -uimode=4"*')
    expect(moduleSource).toContain("refusing Steam Gamepad UI descendant")
  })

  it("does not run Steam-owned runtime prep in normal launch ordering", () => {
    expect(moduleSource).not.toContain("systemd.paths.korri-steam-runtime-prep")
    expect(moduleSource).not.toContain('"korri-steam-runtime-prep.service"')
    expect(moduleSource).not.toContain("steam-guest-runtime-prep --apply")
    expect(moduleSource).not.toContain(
      "SteamLinuxRuntime_sniper/pressure-vessel",
    )
  })

  it("exposes a backup-first Steam recovery helper", () => {
    expect(moduleSource).toContain(
      'pkgs.writeShellScriptBin "korri-steam-recover"',
    )
    expect(moduleSource).toContain("steam_client_${cfg.betaChannel}_linuxarm64")
    expect(moduleSource).toContain("must run as root")
    expect(moduleSource).toContain(
      "refusing package repair while $service is $state",
    )
    expect(moduleSource).toContain('cp -a "$package_dir" "$backup_dir"')
    expect(moduleSource).toContain('rm -f "$pending_marker"')
    expect(moduleSource).toContain(
      "u${toString runtime.uid}-ValveIPCSharedObj-Steam",
    )
    expect(moduleSource).not.toContain("/dev/shm/u*-ValveIPCSharedObj-Steam")
  })

  it("lets cold AppID launch waits survive Steam startup self-update", () => {
    expect(moduleSource).toContain(
      'bootstrap_log="$STEAM_HOME/logs/bootstrap_log.txt"',
    )
    expect(moduleSource).toContain("bootstrap_mark=0")
    expect(moduleSource).toContain("steam_log_since_mark")
    expect(moduleSource).toContain("Found pending update")
    expect(moduleSource).toContain("Extracting package")
    // The update gate must NOT match Steam's benign background update checks,
    // or AppID readiness would block forever while the client is stable.
    expect(moduleSource).not.toContain(
      "Checking for available updates|Downloading manifest",
    )
    expect(moduleSource).toContain(
      "ready_deadline=$((now + startup_update_timeout))",
    )
    expect(moduleSource).toContain(
      "leaving managed Steam running to finish startup self-update",
    )
    expect(moduleSource).toContain(
      'if [ "$steam_launch_forwarded" -eq 0 ] && steam_startup_update_active; then',
    )
  })

  it("makes Steam update relaunch exits explicit and restartable", () => {
    expect(moduleSource).toContain(
      'Restart = if cfg.keepWarm then "always" else "on-failure"',
    )
    expect(moduleSource).toContain("RestartForceExitStatus = [ 42 ]")
    expect(moduleSource).toContain("RestartPreventExitStatus = [ 77 ]")
    expect(moduleSource).toContain("startLimitBurst = 30")
    expect(moduleSource).toContain("startLimitIntervalSec = 300")
  })

  it("recognizes Steam process removal log lines", () => {
    expect(moduleSource).toContain("Game process removed: AppID $appid")
    expect(moduleSource).toContain("Game process removed : AppID $appid")
  })

  it("treats Steam wrapper handoff as non-terminal while AppID evidence is live", () => {
    expect(moduleSource).toContain("app_running_evidence_present()")
    expect(moduleSource).toContain("app_exit_confirmed_after_removal()")
    expect(moduleSource).toContain("service_failure_classification()")
    expect(moduleSource).toContain(
      "korri-steam-app: Steam reported AppID $appid process removal; waiting for corroborating stopped evidence",
    )
    expect(moduleSource).toContain(
      "korri-steam-app: SteamLaunch wrapper for AppID $appid is gone; continuing while AppID evidence remains live",
    )
    expect(moduleSource).toContain(
      "korri-steam-app: SteamLaunch wrapper for AppID $appid is gone and no AppID evidence remains; treating as game exit",
    )
    expect(moduleSource).toContain("if app_running_evidence_present; then")
    expect(moduleSource).not.toContain('*"/steamapps/"*".exe"*) return 0')
    expect(moduleSource).not.toContain(
      'grep -F "SteamLaunch AppId=$appid" | ${pkgs.gnugrep}/bin/grep -v -F "grep -F" >/dev/null; then\n          hide_steam_hat\n          exit 0',
    )
  })

  it("interrupts best-effort launch focus and audio waits only after corroborated game exit", () => {
    expect(moduleSource).toContain("app_removed_since_mark()")
    expect(moduleSource).toContain("if app_exit_confirmed_after_removal; then")
    expect(moduleSource).toContain("if ! focus_game; then")
    expect(moduleSource).toContain("if ! repair_game_audio; then")
  })

  it("reveals the running game by switching to the managed Gamescope workspace", () => {
    // The game renders inside the nested Gamescope surface, so Sway cannot see
    // the inner steam_app_$appid window; focus_game must switch to the managed
    // Steam workspace (the container Sway can actually address) rather than
    // relying on a steam_app_$appid selector, which never matched.
    const focusBlock = moduleSource.match(
      /focus_game\(\) \{[\s\S]*?\n    \}/,
    )?.[0]
    expect(focusBlock).toBeDefined()
    expect(focusBlock).toContain('sway "workspace \\"$steam_workspace\\""')
    expect(focusBlock).toContain("if app_running_evidence_present; then")
    // The invisible inner-window selector must no longer be the focus mechanism.
    expect(focusBlock).not.toContain("move to workspace 1")
    expect(focusBlock).not.toContain(
      '[class=\\"steam_app_$appid\\"] scratchpad show',
    )
  })

  it("resolves the canonical sway-ipc socket so wrapper sway commands are not no-ops", () => {
    // The sessiond-spawned wrapper has no SWAYSOCK, and the compositor's socket
    // is $XDG_RUNTIME_DIR/sway-ipc.sock (single dot). The old glob
    // 'sway-ipc.*.sock' never matched it, so every sway() call silently did
    // nothing. find_sway_sock must resolve the canonical single-dot path.
    const sockBlock = moduleSource.match(
      /find_sway_sock\(\) \{[\s\S]*?\n    \}/,
    )?.[0]
    expect(sockBlock).toBeDefined()
    expect(sockBlock).toContain('[ -S "$XDG_RUNTIME_DIR/sway-ipc.sock" ]')
    expect(sockBlock).toContain("-name 'sway-ipc.sock'")
  })

  it("classifies post-running service failures as non-successful terminal states", () => {
    expect(moduleSource).toContain("service_failure_classification()")
    expect(moduleSource).toContain(
      "77) printf '%s\\n' \"gamepad-ui-guard\"; return 0",
    )
    expect(moduleSource).toContain(
      "134) printf '%s\\n' \"gamescope-abort\"; return 0",
    )
    expect(moduleSource).toContain(
      "failed:*|*:core-dump|*:signal|*:exit-code) printf '%s\\n' \"service-failed\"; return 0",
    )
    expect(moduleSource).toContain(
      "korri-steam-app: managed Steam service failed during AppID $appid observation: $failure_kind",
    )
    expect(moduleSource).toContain("exit 126")
  })

  it("executes generated service failure classification branches", async () => {
    const cases = [
      {
        input: { active: "active", result: "success", status: "77" },
        stdout: "gamepad-ui-guard",
        exitCode: 126,
      },
      {
        input: { active: "active", result: "success", status: "134" },
        stdout: "gamescope-abort",
        exitCode: 126,
      },
      {
        input: { active: "failed", result: "exit-code", status: "1" },
        stdout: "service-failed",
        exitCode: 126,
      },
      {
        input: { active: "active", result: "success", status: "0" },
        stdout: "no-failure",
        exitCode: 0,
      },
    ]

    for (const item of cases) {
      const result = await runGeneratedServiceFailureClassifier(item.input)
      expect(result.stderr).toBe("")
      expect(result.stdout).toBe(item.stdout)
      expect(result.exitCode).toBe(item.exitCode)
    }
  })

  it("keeps the 30XX PipeWire repair loop scoped to the 30XX AppID", () => {
    expect(moduleSource).toContain('[ "$appid" = "1029210" ] || return 0')
  })

  it("forwards AppIDs into the warm Steam client with the working applaunch shape", () => {
    expect(moduleSource).toContain('-applaunch "$appid"')
    expect(moduleSource).not.toContain('"steam://rungameid/$appid"')
  })
})
