import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
} from "node:path"
import type { RetroArchPolicy } from "@platform/library/config/inheritable-fields"
import type { LaunchSettingValue } from "@platform/library/config/launch-block"
import type { LaunchSpec } from "@platform/library/launcher"

const DEFAULT_RETROARCH_COMMAND = "retroarch"

type SafeRetroArchLifecycleDefaults = Required<
  Pick<
    NonNullable<RetroArchPolicy["lifecycle"]>,
    | "saveOnExit"
    | "autoOverrides"
    | "autoRemaps"
    | "gameSpecificOptions"
    | "autoShaders"
  >
>

const SAFE_LIFECYCLE_DEFAULTS: SafeRetroArchLifecycleDefaults = {
  saveOnExit: false,
  autoOverrides: false,
  autoRemaps: false,
  gameSpecificOptions: false,
  autoShaders: false,
}

const DANGEROUS_CORE_ARGS = new Set(["-L", "--libretro"])
const DANGEROUS_CONFIG_ARGS = new Set(["-c", "--config"])
const DANGEROUS_APPEND_CONFIG_ARGS = new Set(["--appendconfig"])
const DANGEROUS_LOG_FILE_ARGS = new Set(["--log-file"])
const RETROARCH_CONFIG_KEY_PATTERN = /^[A-Za-z0-9_]+$/
const RETROARCH_PLAINTEXT_CREDENTIAL_SETTING_KEYS = new Set([
  "cheevos_password",
  "cheevos_token",
  "network_cmd_password",
])

const RETROARCH_TYPED_CONFIG_KEYS = [
  ["config_save_on_exit", "lifecycle.saveOnExit"],
  ["auto_overrides_enable", "lifecycle.autoOverrides"],
  ["auto_remaps_enable", "lifecycle.autoRemaps"],
  ["game_specific_options", "lifecycle.gameSpecificOptions"],
  ["auto_shaders_enable", "lifecycle.autoShaders"],
  ["show_hidden_files", "lifecycle.showHiddenFiles"],
  ["load_dummy_on_core_shutdown", "lifecycle.loadDummyOnCoreShutdown"],
  ["history_list_enable", "lifecycle.historyListEnable"],
  ["perfcnt_enable", "lifecycle.performanceCounters"],
  ["all_users_control_menu", "lifecycle.allUsersControlMenu"],
  ["suspend_screensaver_enable", "lifecycle.suspendScreensaver"],
  ["sustained_performance_mode", "lifecycle.sustainedPerformanceMode"],
  ["gamemode_enable", "lifecycle.gameMode"],
  ["log_verbosity", "logging.verbosity"],
  ["libretro_log_level", "logging.libretroLogLevel"],
  ["fps_show", "logging.fpsShow"],
  ["memory_show", "logging.memoryShow"],
  ["framecount_show", "logging.framecountShow"],
  ["input_driver", "drivers.input"],
  ["input_joypad_driver", "drivers.joypad"],
  ["video_driver", "drivers.video"],
  ["audio_driver", "drivers.audio"],
  ["audio_resampler", "drivers.resampler"],
  ["menu_driver", "drivers.menu"],
  ["camera_driver", "drivers.camera"],
  ["location_driver", "drivers.location"],
  ["record_driver", "drivers.record"],
  ["system_directory", "paths.systemDirectory"],
  ["savefile_directory", "paths.savefileDirectory"],
  ["savestate_directory", "paths.savestateDirectory"],
  ["screenshot_directory", "paths.screenshotDirectory"],
  ["content_directory", "paths.contentDirectory"],
  ["cache_directory", "paths.cacheDirectory"],
  ["assets_directory", "paths.assetsDirectory"],
  ["thumbnails_directory", "paths.thumbnailsDirectory"],
  ["playlist_directory", "paths.playlistDirectory"],
  ["libretro_directory", "paths.libretroDirectory"],
  ["libretro_info_path", "paths.libretroInfoPath"],
  ["core_assets_directory", "paths.coreAssetsDirectory"],
  ["core_options_path", "paths.coreOptionsPath"],
  ["joypad_autoconfig_dir", "paths.joypadAutoconfigDirectory"],
  ["input_remapping_directory", "paths.inputRemappingDirectory"],
  ["overlay_directory", "paths.overlayDirectory"],
  ["video_shader_dir", "paths.videoShaderDirectory"],
  ["cheat_database_path", "paths.cheatDatabasePath"],
  ["content_database_path", "paths.contentDatabasePath"],
  ["content_runtime_log", "paths.contentRuntimeLog"],
  ["recording_output_directory", "paths.recordingOutputDirectory"],
  ["video_fullscreen", "video.fullscreen"],
  ["video_windowed_fullscreen", "video.windowedFullscreen"],
  ["video_vsync", "video.vsync"],
  ["aspect_ratio_index", "video.aspectRatio"],
  ["audio_enable", "audio.enable"],
  ["audio_latency", "audio.latencyMs"],
  ["input_autodetect_enable", "input.autodetect"],
  ["input_max_users", "input.maxUsers"],
  ["input_menu_toggle_gamepad_combo", "input.menuToggleGamepadCombo"],
] as const

assertUniqueRetroArchTypedConfigKeys(RETROARCH_TYPED_CONFIG_KEYS)

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
  const logFile = resolveRetroArchLogFile(policy.logging?.logFile, facts)
  if (logFile) args.push(`--log-file=${logFile}`)

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
  const writer = createTypedSettingsWriter()

  appendLifecycleSettings(writer, policy)
  appendLoggingSettings(writer, policy)
  appendDriverSettings(writer, policy)
  appendPathSettings(writer, policy)
  appendVideoSettings(writer, policy)
  appendAudioSettings(writer, policy)
  appendInputSettings(writer, policy)

  const settings = [...writer.settings]
  for (const [key, value] of Object.entries(policy.extraSettings ?? {})) {
    settings.push([key, value])
  }

  return settings
}

interface TypedSettingsWriter {
  readonly settings: Array<readonly [string, LaunchSettingValue]>
  readonly seenKeys: Set<string>
}

function createTypedSettingsWriter(): TypedSettingsWriter {
  return { settings: [], seenKeys: new Set() }
}

function appendLifecycleSettings(
  writer: TypedSettingsWriter,
  policy: RetroArchPolicy,
) {
  const lifecycle = { ...SAFE_LIFECYCLE_DEFAULTS, ...policy.lifecycle }

  pushTypedSetting(writer, "config_save_on_exit", lifecycle.saveOnExit)
  pushTypedSetting(writer, "auto_overrides_enable", lifecycle.autoOverrides)
  pushTypedSetting(writer, "auto_remaps_enable", lifecycle.autoRemaps)
  pushTypedSetting(
    writer,
    "game_specific_options",
    lifecycle.gameSpecificOptions,
  )
  pushTypedSetting(writer, "auto_shaders_enable", lifecycle.autoShaders)
  pushTypedSetting(
    writer,
    "show_hidden_files",
    policy.lifecycle?.showHiddenFiles,
  )
  pushTypedSetting(
    writer,
    "load_dummy_on_core_shutdown",
    policy.lifecycle?.loadDummyOnCoreShutdown,
  )
  pushTypedSetting(
    writer,
    "history_list_enable",
    policy.lifecycle?.historyListEnable,
  )
  pushTypedSetting(
    writer,
    "perfcnt_enable",
    policy.lifecycle?.performanceCounters,
  )
  pushTypedSetting(
    writer,
    "all_users_control_menu",
    policy.lifecycle?.allUsersControlMenu,
  )
  pushTypedSetting(
    writer,
    "suspend_screensaver_enable",
    policy.lifecycle?.suspendScreensaver,
  )
  pushTypedSetting(
    writer,
    "sustained_performance_mode",
    policy.lifecycle?.sustainedPerformanceMode,
  )
  pushTypedSetting(writer, "gamemode_enable", policy.lifecycle?.gameMode)
}

function appendLoggingSettings(
  writer: TypedSettingsWriter,
  policy: RetroArchPolicy,
) {
  pushTypedSetting(writer, "log_verbosity", policy.logging?.verbosity)
  pushTypedSetting(
    writer,
    "libretro_log_level",
    policy.logging?.libretroLogLevel,
  )
  pushTypedSetting(writer, "fps_show", policy.logging?.fpsShow)
  pushTypedSetting(writer, "memory_show", policy.logging?.memoryShow)
  pushTypedSetting(writer, "framecount_show", policy.logging?.framecountShow)
}

function appendDriverSettings(
  writer: TypedSettingsWriter,
  policy: RetroArchPolicy,
) {
  pushTypedSetting(writer, "input_driver", policy.drivers?.input)
  pushTypedSetting(writer, "input_joypad_driver", policy.drivers?.joypad)
  pushTypedSetting(writer, "video_driver", policy.drivers?.video)
  pushTypedSetting(writer, "audio_driver", policy.drivers?.audio)
  pushTypedSetting(writer, "audio_resampler", policy.drivers?.resampler)
  pushTypedSetting(writer, "menu_driver", policy.drivers?.menu)
  pushTypedSetting(writer, "camera_driver", policy.drivers?.camera)
  pushTypedSetting(writer, "location_driver", policy.drivers?.location)
  pushTypedSetting(writer, "record_driver", policy.drivers?.record)
}

function appendPathSettings(
  writer: TypedSettingsWriter,
  policy: RetroArchPolicy,
) {
  pushTypedSetting(writer, "system_directory", policy.paths?.systemDirectory)
  pushTypedSetting(
    writer,
    "savefile_directory",
    policy.paths?.savefileDirectory,
  )
  pushTypedSetting(
    writer,
    "savestate_directory",
    policy.paths?.savestateDirectory,
  )
  pushTypedSetting(
    writer,
    "screenshot_directory",
    policy.paths?.screenshotDirectory,
  )
  pushTypedSetting(writer, "content_directory", policy.paths?.contentDirectory)
  pushTypedSetting(writer, "cache_directory", policy.paths?.cacheDirectory)
  pushTypedSetting(writer, "assets_directory", policy.paths?.assetsDirectory)
  pushTypedSetting(
    writer,
    "thumbnails_directory",
    policy.paths?.thumbnailsDirectory,
  )
  pushTypedSetting(
    writer,
    "playlist_directory",
    policy.paths?.playlistDirectory,
  )
  pushTypedSetting(
    writer,
    "libretro_directory",
    policy.paths?.libretroDirectory,
  )
  pushTypedSetting(writer, "libretro_info_path", policy.paths?.libretroInfoPath)
  pushTypedSetting(
    writer,
    "core_assets_directory",
    policy.paths?.coreAssetsDirectory,
  )
  pushTypedSetting(writer, "core_options_path", policy.paths?.coreOptionsPath)
  pushTypedSetting(
    writer,
    "joypad_autoconfig_dir",
    policy.paths?.joypadAutoconfigDirectory,
  )
  pushTypedSetting(
    writer,
    "input_remapping_directory",
    policy.paths?.inputRemappingDirectory,
  )
  pushTypedSetting(writer, "overlay_directory", policy.paths?.overlayDirectory)
  pushTypedSetting(
    writer,
    "video_shader_dir",
    policy.paths?.videoShaderDirectory,
  )
  pushTypedSetting(
    writer,
    "cheat_database_path",
    policy.paths?.cheatDatabasePath,
  )
  pushTypedSetting(
    writer,
    "content_database_path",
    policy.paths?.contentDatabasePath,
  )
  pushTypedSetting(
    writer,
    "content_runtime_log",
    policy.paths?.contentRuntimeLog,
  )
  pushTypedSetting(
    writer,
    "recording_output_directory",
    policy.paths?.recordingOutputDirectory,
  )
}

function appendVideoSettings(
  writer: TypedSettingsWriter,
  policy: RetroArchPolicy,
) {
  pushTypedSetting(writer, "video_fullscreen", policy.video?.fullscreen)
  pushTypedSetting(
    writer,
    "video_windowed_fullscreen",
    policy.video?.windowedFullscreen,
  )
  pushTypedSetting(writer, "video_vsync", policy.video?.vsync)
  if (policy.video?.aspectRatio === "core-provided") {
    pushTypedSetting(writer, "aspect_ratio_index", 22)
  }
}

function appendAudioSettings(
  writer: TypedSettingsWriter,
  policy: RetroArchPolicy,
) {
  pushTypedSetting(writer, "audio_enable", policy.audio?.enable)
  pushTypedSetting(writer, "audio_latency", policy.audio?.latencyMs)
}

function appendInputSettings(
  writer: TypedSettingsWriter,
  policy: RetroArchPolicy,
) {
  pushTypedSetting(writer, "input_autodetect_enable", policy.input?.autodetect)
  pushTypedSetting(writer, "input_max_users", policy.input?.maxUsers)
  if (policy.input?.menuToggleGamepadCombo === "start-select") {
    pushTypedSetting(writer, "input_menu_toggle_gamepad_combo", 4)
  }
}

export function assertUniqueRetroArchTypedConfigKeys(
  entries: readonly (readonly [string, string])[],
) {
  const seen = new Map<string, string>()
  for (const [cfgKey, fieldPath] of entries) {
    const previous = seen.get(cfgKey)
    if (previous !== undefined) {
      throw new Error(
        `Duplicate RetroArch typed cfg key ${cfgKey} registered by ${previous} and ${fieldPath}`,
      )
    }
    seen.set(cfgKey, fieldPath)
  }
}

function pushTypedSetting(
  writer: TypedSettingsWriter,
  key: string,
  value: LaunchSettingValue | null | undefined,
) {
  if (value === undefined || value === null) return
  if (writer.seenKeys.has(key)) {
    throw new Error(`Duplicate RetroArch typed cfg key rendered: ${key}`)
  }
  writer.seenKeys.add(key)
  writer.settings.push([key, value])
}

function resolveRetroArchLogFile(
  logFile: NonNullable<RetroArchPolicy["logging"]>["logFile"] | undefined,
  facts: RetroArchLaunchFacts,
): string | undefined {
  if (logFile === undefined || logFile === null) return undefined
  if (isAbsolute(logFile)) {
    throw new Error(
      "RetroArch logging.logFile must be a relative log name; absolute log paths are not supported",
    )
  }

  if (logFile !== basename(logFile)) {
    throw new Error(
      "RetroArch logging.logFile must be a relative log name inside the launch artifacts logs directory",
    )
  }

  const logsDir = join(dirname(facts.configPath), "logs")
  const resolved = normalize(join(logsDir, logFile))
  const relativeToLogs = relative(logsDir, resolved)
  if (relativeToLogs === "" || relativeToLogs.startsWith("..")) {
    throw new Error(
      "RetroArch logging.logFile must resolve inside the launch artifacts logs directory",
    )
  }
  return resolved
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
    if (RETROARCH_PLAINTEXT_CREDENTIAL_SETTING_KEYS.has(key)) {
      throw new Error(
        `RetroArch extraSettings must not contain plaintext credential key: ${key}`,
      )
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
    if (DANGEROUS_LOG_FILE_ARGS.has(arg) || arg.startsWith("--log-file=")) {
      throw new Error(
        `RetroArch extraArgs must not override log file selection with ${arg}; use logging.logFile`,
      )
    }
  }
}

function serializeRetroArchValue(value: LaunchSettingValue): string {
  if (typeof value === "boolean") return value ? '"true"' : '"false"'
  if (typeof value === "number") return String(value)
  return JSON.stringify(value)
}
