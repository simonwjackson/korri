import type { GamescopePolicy } from "@platform/library/config/inheritable-fields"
import { normalizeGamescopePolicy } from "@platform/library/config/inheritable-fields"
import type { LaunchSpec } from "@platform/library/launcher"

const DEFAULT_GAMESCOPE_COMMAND = "gamescope"

type ArgList = string[]
type EnvironmentOverlay = NonNullable<GamescopePolicy["environment"]>
type AppEnvironmentOverlay = NonNullable<
  NonNullable<GamescopePolicy["app"]>["environment"]
>

export function composeGamescopeLaunchSpec(
  game: LaunchSpec,
  policy: GamescopePolicy,
): LaunchSpec {
  if (policy.enable === false) return game

  const normalized = normalizeGamescopePolicy(policy)
  validateDimensionPairs(normalized)

  return {
    command: normalized.command ?? DEFAULT_GAMESCOPE_COMMAND,
    args: [
      ...renderGamescopeArgs(normalized),
      ...(normalized.extraArgs ?? []),
      "--",
      ...renderAppCommand(game, normalized.app?.environment),
    ],
    ...applyEnvironmentOverlay(game, normalized.environment),
    cwd: game.cwd,
  }
}

function renderGamescopeArgs(policy: GamescopePolicy): readonly string[] {
  const args: ArgList = []

  renderBackendArgs(args, policy.backend)
  renderWindowArgs(args, policy.window)
  renderDisplayArgs(args, policy.display)
  renderScalingArgs(args, policy.scaling)
  renderCursorArgs(args, policy.cursor)
  renderInputArgs(args, policy.input)
  renderSchedulingArgs(args, policy.scheduling)
  renderStatsArgs(args, policy.stats)
  renderSteamArgs(args, policy.steam)
  renderEmbeddedArgs(args, policy.embedded)
  renderHdrArgs(args, policy.hdr)
  renderVrArgs(args, policy.vr)
  renderReshadeArgs(args, policy.reshade)
  renderSteamDeckArgs(args, policy.steamDeck)
  renderDebugArgs(args, policy.debug)

  return args
}

function renderBackendArgs(args: ArgList, backend: GamescopePolicy["backend"]) {
  pushValue(args, "--backend", backend?.type)
  pushBoolean(args, "--allow-deferred-backend", backend?.allowDeferred)
  pushValue(args, "--prefer-vk-device", backend?.preferVkDevice)
}

function renderWindowArgs(args: ArgList, window: GamescopePolicy["window"]) {
  pushBoolean(args, "-f", window?.fullscreen)
  pushBoolean(args, "-b", window?.borderless)
  pushBoolean(args, "-g", window?.grabKeyboard)
  pushBoolean(args, "--force-grab-cursor", window?.forceGrabCursor)
  pushValue(args, "--display-index", window?.displayIndex)
  pushBoolean(
    args,
    "--force-windows-fullscreen",
    window?.forceWindowsFullscreen,
  )
  pushBoolean(args, "--expose-wayland", window?.exposeWayland)
  pushValue(args, "--xwayland-count", window?.xwaylandCount)
  pushValue(args, "--fade-out-duration", window?.fadeOutDuration)
}

function renderDisplayArgs(args: ArgList, display: GamescopePolicy["display"]) {
  pushValue(args, "-W", display?.output?.width)
  pushValue(args, "-H", display?.output?.height)
  for (const connector of display?.output?.preferredConnectors ?? []) {
    pushValue(args, "-O", connector)
  }

  pushValue(args, "-w", display?.nested?.width)
  pushValue(args, "-h", display?.nested?.height)
  pushValue(args, "-r", display?.nested?.refresh)
  pushValue(args, "-o", display?.nested?.unfocusedRefresh)
  pushValue(args, "-m", display?.scale?.max)
  pushValue(args, "--force-orientation", display?.orientation)
  pushBoolean(args, "--adaptive-sync", display?.adaptiveSync)
  pushValue(args, "--framerate-limit", display?.framerateLimit)
}

function renderScalingArgs(args: ArgList, scaling: GamescopePolicy["scaling"]) {
  pushValue(args, "-S", scaling?.scaler)
  pushValue(args, "-F", scaling?.filter)
  pushValue(args, "--sharpness", scaling?.sharpness)
}

function renderCursorArgs(args: ArgList, cursor: GamescopePolicy["cursor"]) {
  pushValue(args, "--cursor", cursor?.image)
  pushValue(args, "--cursor-hotspot", cursor?.hotspot)
  pushValue(args, "-C", cursor?.hideDelay)
  pushValue(args, "--cursor-scale-height", cursor?.scaleHeight)
}

function renderInputArgs(args: ArgList, input: GamescopePolicy["input"]) {
  pushValue(args, "-s", input?.mouseSensitivity)
  pushValue(args, "--default-touch-mode", input?.defaultTouchMode)
}

function renderSchedulingArgs(
  args: ArgList,
  scheduling: GamescopePolicy["scheduling"],
) {
  pushBoolean(args, "--rt", scheduling?.realtime)
  pushValue(args, "-R", scheduling?.readyFd)
  pushBoolean(args, "--keep-alive", scheduling?.keepAlive)
}

function renderStatsArgs(args: ArgList, stats: GamescopePolicy["stats"]) {
  pushValue(args, "-T", stats?.path)
}

function renderSteamArgs(args: ArgList, steam: GamescopePolicy["steam"]) {
  pushBoolean(args, "-e", steam?.enableIntegration)
  pushBoolean(args, "--mangoapp", steam?.mangoapp)
}

function renderEmbeddedArgs(
  args: ArgList,
  embedded: GamescopePolicy["embedded"],
) {
  pushValue(args, "--generate-drm-mode", embedded?.generateDrmMode)
  pushBoolean(args, "--immediate-flips", embedded?.immediateFlips)
  pushValue(
    args,
    "--virtual-connector-strategy",
    embedded?.virtualConnectorStrategy,
  )
}

function renderHdrArgs(args: ArgList, hdr: GamescopePolicy["hdr"]) {
  pushBoolean(args, "--hdr-enabled", hdr?.enable)
  pushValue(args, "--sdr-gamut-wideness", hdr?.sdrGamutWideness)
  pushValue(args, "--hdr-sdr-content-nits", hdr?.sdrContentNits)
  pushBoolean(args, "--hdr-itm-enabled", hdr?.inverseToneMapping?.enable)
  pushValue(args, "--hdr-itm-sdr-nits", hdr?.inverseToneMapping?.sdrNits)
  pushValue(args, "--hdr-itm-target-nits", hdr?.inverseToneMapping?.targetNits)
  pushBoolean(args, "--hdr-debug-force-support", hdr?.debug?.forceSupport)
  pushBoolean(args, "--hdr-debug-force-output", hdr?.debug?.forceOutput)
  pushBoolean(args, "--hdr-debug-heatmap", hdr?.debug?.heatmap)
}

function renderVrArgs(args: ArgList, vr: GamescopePolicy["vr"]) {
  pushValue(args, "--vr-overlay-key", vr?.overlayKey)
  pushValue(args, "--vr-app-overlay-key", vr?.appOverlayKey)
  pushValue(args, "--vr-overlay-explicit-name", vr?.explicitName)
  pushValue(args, "--vr-overlay-default-name", vr?.defaultName)
  pushValue(args, "--vr-overlay-icon", vr?.icon)
  pushBoolean(args, "--vr-overlay-show-immediately", vr?.showImmediately)
  pushBoolean(args, "--vr-overlay-modal", vr?.modal)
  pushValue(args, "--vr-overlay-physical-width", vr?.physicalWidth)
  pushValue(args, "--vr-overlay-physical-curvature", vr?.physicalCurvature)
  pushValue(
    args,
    "--vr-overlay-physical-pre-curve-pitch",
    vr?.physicalPreCurvePitch,
  )
  pushValue(args, "--vr-scroll-speed", vr?.scrollSpeed)
  pushBoolean(args, "--vr-session-manager", vr?.sessionManager)
  pushBoolean(args, "--vr-overlay-enable-control-bar", vr?.controlBar?.enable)
  pushBoolean(
    args,
    "--vr-overlay-enable-control-bar-keyboard",
    vr?.controlBar?.keyboard,
  )
  pushBoolean(
    args,
    "--vr-overlay-enable-control-bar-close",
    vr?.controlBar?.close,
  )
  pushBoolean(
    args,
    "--vr-overlay-enable-click-stabilization",
    vr?.clickStabilization,
  )
}

function renderReshadeArgs(args: ArgList, reshade: GamescopePolicy["reshade"]) {
  pushValue(args, "--reshade-effect", reshade?.effect)
  pushValue(args, "--reshade-technique-idx", reshade?.techniqueIndex)
}

function renderSteamDeckArgs(
  args: ArgList,
  steamDeck: GamescopePolicy["steamDeck"],
) {
  pushValue(args, "--mura-map", steamDeck?.muraMap)
}

function renderDebugArgs(args: ArgList, debug: GamescopePolicy["debug"]) {
  pushBoolean(args, "--disable-layers", debug?.disableLayers)
  pushBoolean(args, "--debug-layers", debug?.layers)
  pushBoolean(args, "--debug-focus", debug?.focus)
  pushBoolean(args, "--synchronous-x11", debug?.synchronousX11)
  pushBoolean(args, "--debug-hud", debug?.hud)
  pushBoolean(args, "--debug-events", debug?.events)
  pushBoolean(args, "--force-composition", debug?.forceComposition)
  pushBoolean(args, "--composite-debug", debug?.compositeMarkers)
  pushBoolean(args, "--disable-color-management", debug?.disableColorManagement)
  pushBoolean(args, "--disable-xres", debug?.disableXres)
}

function renderAppCommand(
  game: LaunchSpec,
  environment: AppEnvironmentOverlay | undefined,
): readonly string[] {
  const operations = renderAppEnvironmentOperations(environment)
  if (operations.length === 0) return [game.command, ...game.args]
  return ["env", ...operations, game.command, ...game.args]
}

function renderAppEnvironmentOperations(
  environment: AppEnvironmentOverlay | undefined,
): readonly string[] {
  if (environment === undefined) return []

  const entries = Object.entries(environment).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  const unsetArgs = entries.flatMap(([name, value]) =>
    value === null ? ["-u", name] : [],
  )
  const setArgs = entries.flatMap(([name, value]) =>
    value === null ? [] : [`${name}=${value}`],
  )

  return [...unsetArgs, ...setArgs]
}

function applyEnvironmentOverlay(
  base: Pick<LaunchSpec, "env" | "envUnset">,
  overlay: EnvironmentOverlay | undefined,
): Pick<LaunchSpec, "env" | "envUnset"> {
  if (overlay === undefined) {
    return {
      ...(base.env ? { env: base.env } : {}),
      ...(base.envUnset ? { envUnset: base.envUnset } : {}),
    }
  }

  const env: Record<string, string> = { ...(base.env ?? {}) }
  const envUnset = new Set(base.envUnset ?? [])
  for (const [key, value] of Object.entries(overlay)) {
    if (value === null) {
      delete env[key]
      envUnset.add(key)
    } else {
      env[key] = value
      envUnset.delete(key)
    }
  }

  return {
    ...(Object.keys(env).length > 0 ? { env } : {}),
    ...(envUnset.size > 0 ? { envUnset: [...envUnset].sort() } : {}),
  }
}

function validateDimensionPairs(policy: GamescopePolicy) {
  validateDimensionPair(
    "display.output",
    policy.display?.output?.width,
    policy.display?.output?.height,
  )
  validateDimensionPair(
    "display.nested",
    policy.display?.nested?.width,
    policy.display?.nested?.height,
  )
}

function validateDimensionPair(
  label: string,
  width: number | undefined,
  height: number | undefined,
) {
  if ((width === undefined) !== (height === undefined)) {
    throw new Error(`${label} width and height must be provided together`)
  }
}

function pushBoolean(
  args: ArgList,
  flag: string,
  enabled: boolean | undefined,
) {
  if (enabled === true) args.push(flag)
}

function pushValue(
  args: ArgList,
  flag: string,
  value: number | string | undefined,
) {
  if (value !== undefined) args.push(flag, String(value))
}
