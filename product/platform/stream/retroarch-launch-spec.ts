import type { RetroArchPolicy } from "@platform/library/config/inheritable-fields"
import type { LaunchSettingValue } from "@platform/library/config/launch-block"
import type { LaunchSpec } from "@platform/library/launcher"

const DEFAULT_RETROARCH_COMMAND = "retroarch"

const SAFE_LIFECYCLE_DEFAULTS: Required<
  NonNullable<RetroArchPolicy["lifecycle"]>
> = {
  saveOnExit: false,
  autoOverrides: false,
  autoRemaps: false,
  gameSpecificOptions: false,
  autoShaders: false,
}

const DANGEROUS_CORE_ARGS = new Set(["-L", "--libretro"])
const DANGEROUS_CONFIG_ARGS = new Set(["-c", "--config"])
const DANGEROUS_APPEND_CONFIG_ARGS = new Set(["--appendconfig"])
const RETROARCH_CONFIG_KEY_PATTERN = /^[A-Za-z0-9_]+$/

export interface RetroArchLaunchFacts {
  readonly configPath: string
  readonly corePath: string
  readonly contentPath: string
}

export interface ComposeRetroArchLaunchSpecOptions {
  readonly command?: string
  readonly policy?: RetroArchPolicy
  readonly facts: RetroArchLaunchFacts
}

export function composeRetroArchLaunchSpec(
  options: ComposeRetroArchLaunchSpecOptions,
): LaunchSpec {
  const policy = options.policy ?? {}
  validateRetroArchLaunchFacts(options.facts)
  validateRetroArchPolicy(policy)

  return applyEnvironmentOverlay(
    {
      command: options.command ?? DEFAULT_RETROARCH_COMMAND,
      args: renderRetroArchArgs(policy, options.facts),
    },
    policy.environment,
  )
}

export function renderRetroArchConfig(policy: RetroArchPolicy = {}): string {
  validateRetroArchPolicy(policy)
  const settings = renderRetroArchSettings(policy)
  return `${settings
    .map(([key, value]) => `${key} = ${serializeRetroArchValue(value)}`)
    .join("\n")}\n`
}

function renderRetroArchArgs(
  policy: RetroArchPolicy,
  facts: RetroArchLaunchFacts,
): readonly string[] {
  const args: string[] = []

  if (policy.logging?.verbose === true) args.push("-v")
  if (policy.logging?.logFile) args.push(`--log-file=${policy.logging.logFile}`)

  args.push("-c", facts.configPath)

  const append = policy.configFile?.append ?? []
  if (append.length > 0) args.push(`--appendconfig=${append.join("|")}`)

  args.push("-L", facts.corePath)
  if (policy.extraArgs) args.push(...policy.extraArgs)
  args.push(facts.contentPath)

  return args
}

function renderRetroArchSettings(
  policy: RetroArchPolicy,
): readonly (readonly [string, LaunchSettingValue])[] {
  const settings: Array<readonly [string, LaunchSettingValue]> = []
  const lifecycle = { ...SAFE_LIFECYCLE_DEFAULTS, ...policy.lifecycle }

  pushSetting(settings, "config_save_on_exit", lifecycle.saveOnExit)
  pushSetting(settings, "auto_overrides_enable", lifecycle.autoOverrides)
  pushSetting(settings, "auto_remaps_enable", lifecycle.autoRemaps)
  pushSetting(settings, "game_specific_options", lifecycle.gameSpecificOptions)
  pushSetting(settings, "auto_shaders_enable", lifecycle.autoShaders)

  pushSetting(settings, "system_directory", policy.paths?.systemDirectory)
  pushSetting(settings, "savefile_directory", policy.paths?.savefileDirectory)
  pushSetting(settings, "savestate_directory", policy.paths?.savestateDirectory)
  pushSetting(
    settings,
    "screenshot_directory",
    policy.paths?.screenshotDirectory,
  )

  pushSetting(settings, "video_fullscreen", policy.video?.fullscreen)
  pushSetting(
    settings,
    "video_windowed_fullscreen",
    policy.video?.windowedFullscreen,
  )
  pushSetting(settings, "video_vsync", policy.video?.vsync)
  if (policy.video?.aspectRatio === "core-provided") {
    pushSetting(settings, "aspect_ratio_index", 22)
  }

  pushSetting(settings, "audio_enable", policy.audio?.enable)
  pushSetting(settings, "audio_latency", policy.audio?.latencyMs)

  pushSetting(settings, "input_autodetect_enable", policy.input?.autodetect)
  pushSetting(settings, "input_max_users", policy.input?.maxUsers)
  if (policy.input?.menuToggleGamepadCombo === "start-select") {
    pushSetting(settings, "input_menu_toggle_gamepad_combo", 3)
  }

  for (const [key, value] of Object.entries(policy.extraSettings ?? {})) {
    settings.push([key, value])
  }

  return settings
}

function pushSetting(
  settings: Array<readonly [string, LaunchSettingValue]>,
  key: string,
  value: LaunchSettingValue | undefined,
) {
  if (value !== undefined) settings.push([key, value])
}

function applyEnvironmentOverlay(
  spec: LaunchSpec,
  overlay: RetroArchPolicy["environment"],
): LaunchSpec {
  if (overlay === undefined) return spec

  const env = { ...(spec.env ?? {}) }
  const envUnset = new Set(spec.envUnset ?? [])
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
    ...spec,
    env: Object.keys(env).length > 0 ? env : undefined,
    envUnset: envUnset.size > 0 ? [...envUnset].sort() : undefined,
  }
}

function validateRetroArchLaunchFacts(facts: RetroArchLaunchFacts) {
  if (!facts.configPath.trim()) {
    throw new Error("RetroArch generated config path is required")
  }
  if (!facts.corePath.trim()) {
    throw new Error("RetroArch core path is required")
  }
  if (!facts.contentPath.trim()) {
    throw new Error("RetroArch content path is required")
  }
}

function validateRetroArchPolicy(policy: RetroArchPolicy) {
  if (policy.configFile?.mode && policy.configFile.mode !== "generated") {
    throw new Error("RetroArch configFile.mode supports generated only in v1")
  }
  for (const path of policy.configFile?.append ?? []) {
    if (path.includes("|")) {
      throw new Error(
        `RetroArch configFile.append paths must not contain '|': ${path}`,
      )
    }
  }
  for (const key of Object.keys(policy.extraSettings ?? {})) {
    if (!RETROARCH_CONFIG_KEY_PATTERN.test(key)) {
      throw new Error(`Invalid RetroArch extraSettings key: ${key}`)
    }
  }
  for (const arg of policy.extraArgs ?? []) {
    if (
      DANGEROUS_CORE_ARGS.has(arg) ||
      arg.startsWith("--libretro=") ||
      arg.startsWith("-L")
    ) {
      throw new Error(
        `RetroArch extraArgs must not override core selection with ${arg}`,
      )
    }
    if (
      DANGEROUS_CONFIG_ARGS.has(arg) ||
      arg.startsWith("--config=") ||
      arg.startsWith("-c")
    ) {
      throw new Error(
        `RetroArch extraArgs must not override config file selection with ${arg}; use configFile.append for additive config layering`,
      )
    }
    if (
      DANGEROUS_APPEND_CONFIG_ARGS.has(arg) ||
      arg.startsWith("--appendconfig=")
    ) {
      throw new Error(
        `RetroArch extraArgs must not add append configs with ${arg}; use configFile.append`,
      )
    }
  }
}

function serializeRetroArchValue(value: LaunchSettingValue): string {
  if (typeof value === "boolean") return value ? '"true"' : '"false"'
  if (typeof value === "number") return String(value)
  return JSON.stringify(value)
}
