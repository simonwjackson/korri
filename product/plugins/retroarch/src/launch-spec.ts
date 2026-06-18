import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
} from "node:path"
import type { LaunchSettingValue, RetroArchPolicy } from "./policy"
import {
  isRetroArchConfigKey,
  isRetroArchPlaintextCredentialSettingKey,
  validateNullableRetroArchHttpsUrl,
} from "./setting-policy"
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
  appendMenuSettings(writer, policy)
  appendSaveSettings(writer, policy)
  appendRewindSettings(writer, policy)
  appendPlaybackSettings(writer, policy)
  appendLatencySettings(writer, policy)
  appendAdvancedSettings(writer, policy)

  const settings = [...writer.settings]
  // Deliberately bypass the typed-key duplicate guard: extraSettings is the
  // permanent break-glass layer and renders last so operators can override
  // typed cfg keys while Korri still validates key shape and secret hazards.
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

type RetroArchVideoPolicy = NonNullable<RetroArchPolicy["video"]>
type RetroArchAudioPolicy = NonNullable<RetroArchPolicy["audio"]>
type RetroArchInputPolicy = NonNullable<RetroArchPolicy["input"]>
type RetroArchMenuPolicy = NonNullable<RetroArchPolicy["menu"]>
type RetroArchSavesPolicy = NonNullable<RetroArchPolicy["saves"]>
type RetroArchRewindPolicy = NonNullable<RetroArchPolicy["rewind"]>
type RetroArchPlaybackPolicy = NonNullable<RetroArchPolicy["playback"]>
type RetroArchLatencyPolicy = NonNullable<RetroArchPolicy["latency"]>
type RetroArchAchievementsPolicy = NonNullable<RetroArchPolicy["achievements"]>
type RetroArchHapticsPolicy = NonNullable<RetroArchPolicy["haptics"]>
type RetroArchPlaylistsPolicy = NonNullable<RetroArchPolicy["playlists"]>
type RetroArchPrivacyPolicy = NonNullable<RetroArchPolicy["privacy"]>
type RetroArchUpdaterPolicy = NonNullable<RetroArchPolicy["updater"]>
type SettingSelector<T> = (source: T) => LaunchSettingValue | null | undefined

type SettingEntry<T> = readonly [string, SettingSelector<T>]

const RETROARCH_ASPECT_RATIO_INDEX: Record<
  RetroArchVideoPolicy["aspectRatio"] & string,
  number
> = {
  config: 20,
  square: 21,
  "core-provided": 22,
  custom: 23,
  full: 24,
}

const RETROARCH_GAMEPAD_COMBO_INDEX: Record<
  RetroArchInputPolicy["menuToggleGamepadCombo"] & string,
  number
> = {
  none: 0,
  "down-y-l-r": 1,
  "l3-r3": 2,
  "l1-r1-start-select": 3,
  "start-select": 4,
  "l3-r": 5,
  "l-r": 6,
  "hold-start": 7,
  "hold-select": 8,
  "down-select": 9,
  "l2-r2": 10,
}

const VIDEO_SETTINGS: readonly SettingEntry<RetroArchVideoPolicy>[] = [
  ["video_fullscreen", video => video.fullscreen],
  ["video_windowed_fullscreen", video => video.windowedFullscreen],
  ["video_fullscreen_x", video => video.fullscreenWidth],
  ["video_fullscreen_y", video => video.fullscreenHeight],
  ["video_refresh_rate", video => video.refreshRate],
  ["video_vsync", video => video.vsync],
  ["aspect_ratio_index", video => mapRetroArchAspectRatio(video.aspectRatio)],
  ["video_aspect_ratio", video => video.aspectRatioValue],
  ["video_force_aspect", video => video.forceAspect],
  ["video_scale", video => video.scale],
  ["video_scale_integer", video => video.integerScale],
  ["video_crop_overscan", video => video.cropOverscan],
  ["video_smooth", video => video.smooth],
  ["video_shader", video => video.shader],
  ["video_shader_enable", video => video.shaderEnable],
  ["video_gpu_screenshot", video => video.gpuScreenshot],
  ["video_shader_watch_files", video => video.shaderWatchFiles],
]

const VIDEO_HDR_SETTINGS: readonly SettingEntry<
  NonNullable<RetroArchVideoPolicy["hdr"]>
>[] = [
  ["video_hdr_enable", hdr => hdr.enable],
  ["video_hdr_max_nits", hdr => hdr.maxNits],
  ["video_hdr_paper_white_nits", hdr => hdr.paperWhiteNits],
  ["video_hdr_contrast", hdr => hdr.contrast],
  ["video_hdr_expand_gamut", hdr => hdr.expandGamut],
]

const VIDEO_RECORDING_SETTINGS: readonly SettingEntry<
  NonNullable<RetroArchVideoPolicy["recording"]>
>[] = [
  ["video_post_filter_record", recording => recording.postFilter],
  ["video_gpu_record", recording => recording.gpu],
]

const VIDEO_SYNC_SETTINGS: readonly SettingEntry<
  NonNullable<RetroArchVideoPolicy["sync"]>
>[] = [
  ["video_hard_sync", sync => sync.hardSync],
  ["video_hard_sync_frames", sync => sync.hardSyncFrames],
  ["video_frame_delay", sync => sync.frameDelay],
  ["video_frame_delay_auto", sync => sync.frameDelayAuto],
]

const AUDIO_SETTINGS: readonly SettingEntry<RetroArchAudioPolicy>[] = [
  ["audio_enable", audio => audio.enable],
  ["audio_enable_menu", audio => audio.menuEnable],
  ["audio_mute_enable", audio => audio.mute],
  ["audio_mixer_mute_enable", audio => audio.mixerMute],
  ["audio_out_rate", audio => audio.outputRate],
  ["audio_device", audio => audio.device],
  ["audio_sync", audio => audio.sync],
  ["audio_latency", audio => audio.latencyMs],
  ["audio_rate_control", audio => audio.rateControl],
  ["audio_rate_control_delta", audio => audio.rateControlDelta],
  ["audio_max_timing_skew", audio => audio.maxTimingSkew],
  ["audio_volume", audio => audio.volumeDb],
  ["audio_mixer_volume", audio => audio.mixerVolumeDb],
  ["audio_resampler_quality", audio => audio.resamplerQuality],
]

const INPUT_SETTINGS: readonly SettingEntry<RetroArchInputPolicy>[] = [
  ["input_autodetect_enable", input => input.autodetect],
  ["input_max_users", input => input.maxUsers],
  ["input_poll_type_behavior", input => input.pollTypeBehavior],
  ["input_axis_threshold", input => input.axisThreshold],
  ["input_analog_deadzone", input => input.analogDeadzone],
  ["input_analog_sensitivity", input => input.analogSensitivity],
  ["input_remap_binds_enable", input => input.remapBinds],
  ["input_auto_game_focus", input => input.autoGameFocus],
  [
    "input_menu_toggle_gamepad_combo",
    input => mapRetroArchGamepadCombo(input.menuToggleGamepadCombo),
  ],
  [
    "input_quit_gamepad_combo",
    input => mapRetroArchGamepadCombo(input.quitGamepadCombo),
  ],
]

const INPUT_DESCRIPTOR_SETTINGS: readonly SettingEntry<
  NonNullable<RetroArchInputPolicy["descriptors"]>
>[] = [
  ["input_descriptor_label_show", descriptors => descriptors.labelShow],
  ["input_descriptor_hide_unbound", descriptors => descriptors.hideUnbound],
]

const INPUT_OVERLAY_SETTINGS: readonly SettingEntry<
  NonNullable<RetroArchInputPolicy["overlay"]>
>[] = [
  ["input_overlay_enable", overlay => overlay.enable],
  ["input_overlay", overlay => overlay.path],
  ["input_overlay_opacity", overlay => overlay.opacity],
  ["input_overlay_scale", overlay => overlay.scale],
  ["input_overlay_behind_menu", overlay => overlay.behindMenu],
  ["input_overlay_hide_in_menu", overlay => overlay.hideInMenu],
]

const MENU_SETTINGS: readonly SettingEntry<RetroArchMenuPolicy>[] = [
  ["menu_show_start_screen", menu => menu.showStartScreen],
  ["menu_pause_libretro", menu => menu.pauseLibretro],
  ["menu_mouse_enable", menu => menu.mouseEnable],
  ["menu_pointer_enable", menu => menu.pointerEnable],
  ["menu_timedate_enable", menu => menu.timedateEnable],
  ["menu_battery_level_enable", menu => menu.batteryLevelEnable],
  ["menu_core_enable", menu => menu.coreEnable],
  ["menu_dynamic_wallpaper_enable", menu => menu.dynamicWallpaper],
  ["menu_wallpaper", menu => menu.wallpaper],
  ["menu_screensaver_timeout", menu => menu.screensaverTimeoutSeconds],
]

const SAVE_SETTINGS: readonly SettingEntry<RetroArchSavesPolicy>[] = [
  ["autosave_interval", saves => saves.autosaveIntervalSeconds],
  ["savestate_auto_load", saves => saves.autoLoadState],
  ["savestate_auto_save", saves => saves.autoSaveState],
  ["savestate_auto_index", saves => saves.autoIndex],
  ["savestate_max_keep", saves => saves.maxKeep],
  ["savestate_thumbnail_enable", saves => saves.thumbnailEnable],
  ["sort_savefiles_enable", saves => saves.sortSavefiles],
  ["sort_savestates_enable", saves => saves.sortSavestates],
  ["savefiles_in_content_dir", saves => saves.savefilesInContentDir],
  ["savestates_in_content_dir", saves => saves.savestatesInContentDir],
  ["systemfiles_in_content_dir", saves => saves.systemfilesInContentDir],
  ["block_sram_overwrite", saves => saves.blockSramOverwrite],
  ["save_file_compression", saves => saves.saveFileCompression],
  ["savestate_file_compression", saves => saves.stateFileCompression],
]

const REWIND_SETTINGS: readonly SettingEntry<RetroArchRewindPolicy>[] = [
  ["rewind_enable", rewind => rewind.enable],
  ["rewind_granularity", rewind => rewind.granularity],
  ["rewind_buffer_size", rewind => rewind.bufferSizeMb],
  ["rewind_buffer_size_step", rewind => rewind.bufferSizeStepMb],
  ["rewind_auto_stride", rewind => rewind.autoStride],
]

const PLAYBACK_SETTINGS: readonly SettingEntry<RetroArchPlaybackPolicy>[] = [
  ["pause_nonactive", playback => playback.pauseNonactive],
  ["pause_on_disconnect", playback => playback.pauseOnDisconnect],
  ["slowmotion_ratio", playback => playback.slowmotionRatio],
  ["fastforward_ratio", playback => playback.fastforwardRatio],
  ["fastforward_frameskip", playback => playback.fastforwardFrameskip],
]

const RUN_AHEAD_SETTINGS: readonly SettingEntry<
  NonNullable<RetroArchLatencyPolicy["runAhead"]>
>[] = [
  ["run_ahead_enabled", runAhead => runAhead.enable],
  ["run_ahead_frames", runAhead => runAhead.frames],
  ["run_ahead_secondary_instance", runAhead => runAhead.secondaryInstance],
  ["run_ahead_hide_warnings", runAhead => runAhead.hideWarnings],
]

const PREEMPTIVE_FRAME_SETTINGS: readonly SettingEntry<
  NonNullable<RetroArchLatencyPolicy["preemptiveFrames"]>
>[] = [
  ["preemptive_frames_enable", preemptiveFrames => preemptiveFrames.enable],
  ["preemptive_frames", preemptiveFrames => preemptiveFrames.frames],
]

const ACHIEVEMENT_SETTINGS: readonly SettingEntry<RetroArchAchievementsPolicy>[] =
  [
    ["cheevos_enable", achievements => achievements.enable],
    ["cheevos_username", achievements => achievements.username],
    ["cheevos_hardcore_mode_enable", achievements => achievements.hardcoreMode],
    ["cheevos_badges_enable", achievements => achievements.badges],
    ["cheevos_richpresence_enable", achievements => achievements.richPresence],
    ["cheevos_test_unofficial", achievements => achievements.testUnofficial],
  ]

const HAPTIC_SETTINGS: readonly SettingEntry<RetroArchHapticsPolicy>[] = [
  ["vibrate_on_keypress", haptics => haptics.vibrateOnKeypress],
  ["enable_device_vibration", haptics => haptics.deviceVibration],
]

const PLAYLIST_SETTINGS: readonly SettingEntry<RetroArchPlaylistsPolicy>[] = [
  ["playlist_use_old_format", playlists => playlists.useOldFormat],
]

const PRIVACY_SETTINGS: readonly SettingEntry<RetroArchPrivacyPolicy>[] = [
  ["camera_device", privacy => privacy.cameraDevice],
  ["camera_allow", privacy => privacy.cameraAllow],
  ["location_allow", privacy => privacy.locationAllow],
]

const UPDATER_SETTINGS: readonly SettingEntry<RetroArchUpdaterPolicy>[] = [
  ["menu_show_online_updater", updater => updater.showOnlineUpdater],
  ["menu_show_core_updater", updater => updater.showCoreUpdater],
  ["core_updater_buildbot_url", updater => updater.buildbotUrl],
  ["core_updater_buildbot_assets_url", updater => updater.buildbotAssetsUrl],
  ["core_updater_auto_extract_archive", updater => updater.autoExtractArchive],
]

function appendVideoSettings(
  writer: TypedSettingsWriter,
  policy: RetroArchPolicy,
) {
  appendOptionalSettings(writer, policy.video, VIDEO_SETTINGS)
  appendOptionalSettings(writer, policy.video?.hdr, VIDEO_HDR_SETTINGS)
  appendOptionalSettings(
    writer,
    policy.video?.recording,
    VIDEO_RECORDING_SETTINGS,
  )
  appendOptionalSettings(writer, policy.video?.sync, VIDEO_SYNC_SETTINGS)
}

function appendAudioSettings(
  writer: TypedSettingsWriter,
  policy: RetroArchPolicy,
) {
  appendOptionalSettings(writer, policy.audio, AUDIO_SETTINGS)
}

function appendInputSettings(
  writer: TypedSettingsWriter,
  policy: RetroArchPolicy,
) {
  appendOptionalSettings(writer, policy.input, INPUT_SETTINGS)
  appendOptionalSettings(
    writer,
    policy.input?.descriptors,
    INPUT_DESCRIPTOR_SETTINGS,
  )
  appendOptionalSettings(writer, policy.input?.overlay, INPUT_OVERLAY_SETTINGS)
  appendInputPortSettings(writer, policy.input?.ports)
}

function appendMenuSettings(
  writer: TypedSettingsWriter,
  policy: RetroArchPolicy,
) {
  appendOptionalSettings(writer, policy.menu, MENU_SETTINGS)
}

function appendSaveSettings(
  writer: TypedSettingsWriter,
  policy: RetroArchPolicy,
) {
  appendOptionalSettings(writer, policy.saves, SAVE_SETTINGS)
}

function appendRewindSettings(
  writer: TypedSettingsWriter,
  policy: RetroArchPolicy,
) {
  appendOptionalSettings(writer, policy.rewind, REWIND_SETTINGS)
}

function appendPlaybackSettings(
  writer: TypedSettingsWriter,
  policy: RetroArchPolicy,
) {
  appendOptionalSettings(writer, policy.playback, PLAYBACK_SETTINGS)
}

function appendLatencySettings(
  writer: TypedSettingsWriter,
  policy: RetroArchPolicy,
) {
  appendOptionalSettings(writer, policy.latency?.runAhead, RUN_AHEAD_SETTINGS)
  appendOptionalSettings(
    writer,
    policy.latency?.preemptiveFrames,
    PREEMPTIVE_FRAME_SETTINGS,
  )
}

function appendAdvancedSettings(
  writer: TypedSettingsWriter,
  policy: RetroArchPolicy,
) {
  appendOptionalSettings(writer, policy.achievements, ACHIEVEMENT_SETTINGS)
  appendOptionalSettings(writer, policy.haptics, HAPTIC_SETTINGS)
  appendOptionalSettings(writer, policy.playlists, PLAYLIST_SETTINGS)
  appendOptionalSettings(writer, policy.privacy, PRIVACY_SETTINGS)
  appendOptionalSettings(writer, policy.updater, UPDATER_SETTINGS)
}

function appendOptionalSettings<T>(
  writer: TypedSettingsWriter,
  source: T | undefined,
  entries: readonly SettingEntry<T>[],
) {
  if (source === undefined) return
  for (const [key, select] of entries)
    pushTypedSetting(writer, key, select(source))
}

function mapRetroArchAspectRatio(
  value: RetroArchVideoPolicy["aspectRatio"] | undefined,
): number | undefined {
  return value === undefined ? undefined : RETROARCH_ASPECT_RATIO_INDEX[value]
}

function mapRetroArchGamepadCombo(
  value: RetroArchInputPolicy["menuToggleGamepadCombo"] | undefined,
): number | undefined {
  return value === undefined ? undefined : RETROARCH_GAMEPAD_COMBO_INDEX[value]
}

function appendInputPortSettings(
  writer: TypedSettingsWriter,
  ports: RetroArchInputPolicy["ports"] | undefined,
) {
  if (ports === undefined) return

  for (const port of Object.keys(ports).sort(compareNumericStrings)) {
    const settings = ports[port]
    if (settings === undefined) continue
    pushTypedSetting(
      writer,
      `input_libretro_device_p${port}`,
      settings.libretroDevice,
    )
    pushTypedSetting(
      writer,
      `input_player${port}_joypad_index`,
      settings.joypadIndex,
    )
    pushTypedSetting(
      writer,
      `input_player${port}_analog_dpad_mode`,
      settings.analogDpadMode,
    )
  }
}

function compareNumericStrings(left: string, right: string): number {
  return Number(left) - Number(right)
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
  for (const [value, label] of [
    [policy.updater?.buildbotUrl, "updater.buildbotUrl"],
    [policy.updater?.buildbotAssetsUrl, "updater.buildbotAssetsUrl"],
  ] as const) {
    const error = validateNullableRetroArchHttpsUrl(value, label)
    if (error !== undefined) throw new Error(`RetroArch ${error}`)
  }
  for (const key of Object.keys(policy.extraSettings ?? {})) {
    if (!isRetroArchConfigKey(key)) {
      throw new Error(`Invalid RetroArch extraSettings key: ${key}`)
    }
    if (isRetroArchPlaintextCredentialSettingKey(key)) {
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
