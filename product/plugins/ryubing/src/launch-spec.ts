import {
  applyArgsOverrides,
  deepMergeConfig,
  parseConfigFragment,
} from "@platform/library/config/apply-overrides"
import type { LaunchOverrides } from "@platform/library/config/records/library-item"
import type { LaunchSpec } from "@platform/library/launcher"
import type { RyubingPolicy } from "./policy"

export const RYUBING_CONFIG_VERSION = 70

export interface ComposeRyubingLaunchSpecOptions {
  readonly command?: string
  readonly policy?: RyubingPolicy
  readonly gamePath: string
  readonly env?: Readonly<Record<string, string>>
  /** Raw argv escape hatch, folded from release.launch.overrides. */
  readonly overrides?: LaunchOverrides
}

export type RyubingConfigObject = Readonly<Record<string, unknown>>

const DEFAULT_RYUBING_COMMAND = "Ryujinx"

export function composeRyubingLaunchSpec(
  options: ComposeRyubingLaunchSpecOptions,
): LaunchSpec {
  const policy = options.policy ?? {}
  const stateRoot = policy.state?.root
  if (!stateRoot) throw new Error("Ryubing launches require state.root")
  if (!options.gamePath) throw new Error("Ryubing launches require a game path")

  const args = applyArgsOverrides({
    leading: ["--no-gui", "--root-data-dir", stateRoot, "--use-main-config"],
    routed: renderTypedHeadlessArgs(policy),
    trailing: [options.gamePath],
    ...(options.overrides?.args !== undefined
      ? { overrides: options.overrides.args }
      : {}),
  })

  const env = mergeEnv(options.env, policy.env)

  return {
    command: options.command ?? DEFAULT_RYUBING_COMMAND,
    args,
    ...(env ? { env } : {}),
  }
}

export function renderRyubingConfig(
  policy: RyubingPolicy = {},
  options: {
    readonly seedVersion?: boolean
    readonly overrides?: LaunchOverrides
  } = {},
): RyubingConfigObject {
  const config: Record<string, unknown> = {}
  if (options.seedVersion !== false) config.version = RYUBING_CONFIG_VERSION

  if (policy.display?.fullscreen !== undefined) {
    config.start_fullscreen = policy.display.fullscreen
  }
  if (policy.display?.["hide-cursor"] !== undefined) {
    config.hide_cursor = hideCursor(policy.display["hide-cursor"])
  }
  if (policy.display?.["show-console"] !== undefined) {
    config.show_console = policy.display["show-console"]
  }
  if (policy.display?.["confirm-exit"] !== undefined) {
    config.confirm_exit = policy.display["confirm-exit"]
  }
  if (policy.display?.["remember-window-state"] !== undefined) {
    config.remember_window_state = policy.display["remember-window-state"]
  }

  if (policy.content?.["game-dirs"] !== undefined) {
    config.game_dirs = policy.content["game-dirs"]
  }
  if (policy.content?.["autoload-dirs"] !== undefined) {
    config.autoload_dirs = policy.content["autoload-dirs"]
  }
  if (policy.content?.["shown-file-types"] !== undefined) {
    config.shown_file_types = policy.content["shown-file-types"]
  }

  if (policy.graphics?.backend !== undefined) {
    config.graphics_backend = graphicsBackend(policy.graphics.backend)
  }
  if (policy.graphics?.["backend-threading"] !== undefined) {
    config.backend_threading = titleEnum(policy.graphics["backend-threading"])
  }
  if (policy.graphics?.pptc !== undefined) {
    config.enable_ptc = policy.graphics.pptc !== "disabled"
  }
  put(config, "resolution_scale", policy.graphics?.["resolution-scale"])
  put(
    config,
    "custom_resolution_scale",
    policy.graphics?.["custom-resolution-scale"],
  )
  put(config, "max_anisotropy", policy.graphics?.["max-anisotropy"])
  put(config, "aspect_ratio", kebabEnum(policy.graphics?.["aspect-ratio"]))
  put(config, "anti_aliasing", kebabEnum(policy.graphics?.["anti-aliasing"]))
  put(config, "scaling_filter", kebabEnum(policy.graphics?.["scaling-filter"]))
  put(config, "scaling_filter_level", policy.graphics?.["scaling-filter-level"])
  put(config, "enable_shader_cache", policy.graphics?.["shader-cache"])
  put(
    config,
    "enable_texture_recompression",
    policy.graphics?.["texture-recompression"],
  )
  put(config, "enable_macro_hle", policy.graphics?.["macro-hle"])

  if (policy.console?.mode !== undefined) {
    config.docked_mode = policy.console.mode === "docked"
  }
  put(config, "system_language", kebabEnum(policy.console?.language))
  put(config, "system_region", kebabEnum(policy.console?.region))
  put(config, "enable_internet_access", policy.console?.["internet-access"])
  put(
    config,
    "enable_fs_integrity_checks",
    policy.console?.["fs-integrity-checks"],
  )
  put(
    config,
    "fs_global_access_log_mode",
    policy.console?.["fs-global-access-log-mode"],
  )
  put(
    config,
    "ignore_missing_services",
    policy.console?.["ignore-missing-services"],
  )
  put(
    config,
    "ignore_controller_applet",
    policy.console?.["ignore-controller-applet"],
  )
  put(
    config,
    "skip_user_profile_manager",
    policy.console?.["skip-user-profile-manager"],
  )

  // Default to OpenAL: Ryujinx's SDL2 backend accumulates an undrainable
  // sample queue whenever emulation runs sub-realtime (boot, shader
  // compile), leaving seconds of permanent audio latency. Validated on
  // bandai/SM8550 2026-06-11 — see
  // docs/solutions/performance-issues/ryubing-sm8550-turnip26-openal-2026-06-11.md.
  put(config, "audio_backend", kebabEnum(policy.audio?.backend) ?? "OpenAl")
  put(config, "audio_volume", policy.audio?.volume)

  put(config, "enable_keyboard", policy.input?.keyboard)
  put(config, "enable_mouse", policy.input?.mouse)
  put(
    config,
    "disable_input_when_out_of_focus",
    policy.input?.["disable-when-out-of-focus"],
  )
  put(config, "input_config", renderInputConfig(policy.input?.controllers))

  put(config, "enable_file_log", policy.logging?.file)
  put(config, "multiplayer_mode", kebabEnum(policy.network?.multiplayer))
  put(config, "lan_interface_id", policy.network?.["lan-interface-id"])
  put(config, "enable_p2p", policy.network?.p2p)
  put(config, "ldn_passphrase", policy.network?.["ldn-passphrase"])
  put(config, "ldn_server", policy.network?.["ldn-server"])

  return applyRyubingConfigOverrides(
    config,
    options.overrides?.config,
  ) as RyubingConfigObject
}

/**
 * Apply the raw `overrides.config` escape hatch (plain-text JSON fragments) to
 * the generated Ryubing config. `prepend`/`append` parse and deep-merge onto the
 * generated object (append wins on conflict); `replace` parses and wins the
 * whole generated config. Empty/whitespace fragments are no-ops.
 */
function applyRyubingConfigOverrides(
  base: Record<string, unknown>,
  overrides: LaunchOverrides["config"] | undefined,
): Record<string, unknown> {
  if (!overrides) return base
  if (overrides.replace !== undefined) {
    return parseConfigFragment(overrides.replace, JSON.parse) ?? {}
  }
  let merged = base
  for (const fragment of [overrides.prepend, overrides.append]) {
    if (fragment === undefined) continue
    const parsed = parseConfigFragment(fragment, JSON.parse)
    if (parsed) merged = deepMergeConfig(merged, parsed)
  }
  return merged
}

function renderTypedHeadlessArgs(policy: RyubingPolicy): string[] {
  const args: string[] = []
  if (policy.display?.fullscreen === true) args.push("--fullscreen")
  if (policy.display?.["hide-cursor"] !== undefined) {
    args.push("--hide-cursor", hideCursor(policy.display["hide-cursor"]))
  }
  if (policy.graphics?.backend !== undefined) {
    args.push("--graphics-backend", graphicsBackend(policy.graphics.backend))
  }
  if (policy.graphics?.["backend-threading"] !== undefined) {
    args.push(
      "--backend-threading",
      titleEnum(policy.graphics["backend-threading"]),
    )
  }
  if (policy.graphics?.pptc === "disabled") args.push("--disable-ptc")
  if (policy.console?.mode === "handheld") args.push("--disable-docked-mode")
  return args
}

function renderInputConfig(
  controllers:
    | NonNullable<NonNullable<RyubingPolicy["input"]>["controllers"]>
    | undefined,
): readonly Record<string, unknown>[] | undefined {
  if (!controllers || controllers.length === 0) return undefined
  return controllers
    .map(controller => {
      const mapping = controller.mapping ?? {}
      return {
        id: controller.id ?? "0",
        name: controller.name ?? "Korri Controller",
        input_backend: inputBackend(controller.backend),
        player_index: playerIndex(controller.player),
        controller_type: controllerType(controller.type),
        left_deadzone: numberField(controller.deadzone, "left"),
        right_deadzone: numberField(controller.deadzone, "right"),
        left_range: numberField(controller.range, "left"),
        right_range: numberField(controller.range, "right"),
        trigger_threshold: controller["trigger-threshold"],
        rumble: controller.rumble,
        motion: controller.motion,
        button_a: control(mapping.a),
        button_b: control(mapping.b),
        button_x: control(mapping.x),
        button_y: control(mapping.y),
        button_plus: control(mapping.plus),
        button_minus: control(mapping.minus),
        button_home: control(mapping.home),
        button_l: control(mapping.l),
        button_r: control(mapping.r),
        button_zl: control(mapping.zl),
        button_zr: control(mapping.zr),
        button_left_stick: control(mapping["left-stick"]),
        button_right_stick: control(mapping["right-stick"]),
        dpad_up: control(mapping["dpad-up"]),
        dpad_down: control(mapping["dpad-down"]),
        dpad_left: control(mapping["dpad-left"]),
        dpad_right: control(mapping["dpad-right"]),
        left_stick_x: control(mapping["left-stick-x"]),
        left_stick_y: control(mapping["left-stick-y"]),
        right_stick_x: control(mapping["right-stick-x"]),
        right_stick_y: control(mapping["right-stick-y"]),
      }
    })
    .map(removeUndefined)
}

function put(target: Record<string, unknown>, key: string, value: unknown) {
  if (value !== undefined) target[key] = value
}

function mergeEnv(
  base: Readonly<Record<string, string>> | undefined,
  extra: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> | undefined {
  if (!base && !extra) return undefined
  return { ...(base ?? {}), ...(extra ?? {}) }
}

function hideCursor(value: string): string {
  if (value === "on-idle") return "OnIdle"
  return titleEnum(value)
}

function graphicsBackend(value: string): string {
  return value === "opengl" ? "OpenGl" : titleEnum(value)
}

function inputBackend(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  if (value === "gamepad-sdl2") return "GamepadSDL2"
  return kebabEnum(value)
}

function playerIndex(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const match = /^player-(\d+)$/.exec(value)
  return match ? `Player${match[1]}` : kebabEnum(value)
}

function controllerType(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  if (value === "pro-controller") return "ProController"
  return kebabEnum(value)
}

function control(value: unknown): string | undefined {
  return typeof value === "string" ? kebabEnum(value) : undefined
}

function kebabEnum(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  return value.split("-").filter(Boolean).map(titleEnum).join("")
}

function titleEnum(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
}

function numberField(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined
  const field = value[key]
  return typeof field === "number" ? field : undefined
}

function removeUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
