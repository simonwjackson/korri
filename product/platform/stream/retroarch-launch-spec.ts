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
  ["system_directory", "paths.systemDirectory"],
  ["savefile_directory", "paths.savefileDirectory"],
  ["savestate_directory", "paths.savestateDirectory"],
  ["screenshot_directory", "paths.screenshotDirectory"],
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
  value: LaunchSettingValue | undefined,
) {
  if (value === undefined) return
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
