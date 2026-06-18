import { decodeLaunchSpec, type LaunchSpec } from "@platform/library/launcher"
import { plugin } from "@platform/plugin"
import {
  composeGamescopeLaunchSpec,
  decodeGamescopePolicy,
  type GamescopePolicyValue,
} from "./launch-companion"
import {
  applyGamescopeStreamControl,
  describeGamescopeStreamControl,
  type GamescopeStreamControlApplyInput,
  type GamescopeStreamControlDescribeInput,
} from "./stream-control"

export const KORRI_GAMESCOPE_PLUGIN_ID = "@korri:gamescope" as const

export interface GamescopeLaunchComposeInput {
  readonly spec: LaunchSpec
  readonly policy: GamescopePolicyValue
  readonly options?: {
    readonly appIntegration?: string
    readonly steamSession?: boolean
  }
}

export interface GamescopePluginDiagnostic {
  readonly provider: typeof KORRI_GAMESCOPE_PLUGIN_ID
  readonly status: "ok"
}

export const gamescopePlugin = plugin({
  namespace: "@korri",
  name: "gamescope",
  title: "Gamescope",
  description:
    "Contributes Korri's first-party Gamescope launch, runtime-control, stream-control, session, CLI, and package capabilities.",
  contributes: {
    config: {
      modules: {
        "launch-wrapper": {
          id: "launch-wrapper",
          kind: "launch-wrapper",
          supports: { systems: ["*"] },
          capabilities: ["launch.compose", "launch.wrapper"],
        },
        "gamescope-korri-package": {
          id: "gamescope-korri-package",
          kind: "nix-package",
          package: "gamescope-korri",
          path: "product/plugins/gamescope/packages/gamescope-korri",
          capabilities: ["package.expose", "launch.wrapper"],
        },
        "control-bridge-package": {
          id: "control-bridge-package",
          kind: "nix-package",
          package: "korri-gamescope-control-bridge",
          path: "product/plugins/gamescope/packages/control-bridge",
          capabilities: ["package.expose", "runtime-control.gamescope"],
        },
        "stream-control": {
          id: "stream-control",
          kind: "control-surface",
          capabilities: ["stream-control.apply", "stream-control.describe"],
        },
        "session-cleanup": {
          id: "session-cleanup",
          kind: "session-hook",
          capabilities: ["session.cleanup"],
        },
        cli: {
          id: "cli",
          kind: "cli",
          binaries: [
            "korri-gamescope-control",
            "korri-gamescope-control-bridge",
          ],
          capabilities: ["cli.expose", "runtime-control.gamescope"],
        },
      },
    },
    handlers: [
      {
        id: "gamescope.launch-compose",
        operation: "launch.compose",
        capabilities: ["launch.compose", "launch.wrapper"],
        run: context => {
          const input = decodeLaunchComposeInput(context.input)
          return composeGamescopeLaunchSpec(
            input.spec,
            input.policy,
            input.options,
          )
        },
      },
      {
        id: "gamescope.stream-control-describe",
        operation: "stream-control.describe",
        capabilities: ["stream-control.describe"],
        run: context =>
          describeGamescopeStreamControl({
            provider: context.provider,
            ...(isRecord(context.input) &&
            typeof context.input.socketPath === "string"
              ? {
                  socketPath: context.input
                    .socketPath as GamescopeStreamControlDescribeInput["socketPath"],
                }
              : {}),
          }),
      },
      {
        id: "gamescope.stream-control-apply",
        operation: "stream-control.apply",
        capabilities: ["stream-control.apply"],
        run: context => {
          const input = decodeStreamControlApplyInput(context.input)
          return applyGamescopeStreamControl({
            provider: context.provider,
            action: input.action,
            payload: input.payload,
            ...(input.socketPath ? { socketPath: input.socketPath } : {}),
          })
        },
      },
      {
        id: "gamescope.session-cleanup",
        operation: "session.cleanup",
        capabilities: ["session.cleanup"],
        run: context => ({ provider: context.provider, input: context.input }),
      },
      {
        id: "gamescope.package-expose",
        operation: "package.expose",
        capabilities: ["package.expose"],
        run: context => ({ provider: context.provider, input: context.input }),
      },
      {
        id: "gamescope.cli-expose",
        operation: "cli.expose",
        capabilities: ["cli.expose"],
        run: context => ({ provider: context.provider, input: context.input }),
      },
      {
        id: "gamescope.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["launch.wrapper", "runtime-control.gamescope"],
        run: (): GamescopePluginDiagnostic => ({
          provider: KORRI_GAMESCOPE_PLUGIN_ID,
          status: "ok",
        }),
      },
    ],
  },
})

function decodeStreamControlApplyInput(
  input: unknown,
): GamescopeStreamControlApplyInput {
  if (!isRecord(input)) {
    throw new Error("Gamescope stream-control.apply input must be an object")
  }
  if (typeof input.action !== "string") {
    throw new Error("Gamescope stream-control.apply input.action is required")
  }
  if (!isRecord(input.payload)) {
    throw new Error("Gamescope stream-control.apply input.payload is required")
  }
  return {
    action: input.action,
    payload: input.payload,
    ...(typeof input.socketPath === "string"
      ? { socketPath: input.socketPath }
      : {}),
  }
}

function decodeLaunchComposeInput(input: unknown): GamescopeLaunchComposeInput {
  if (!isRecord(input)) {
    throw new Error("Gamescope launch.compose input must be an object")
  }
  const spec = decodeHandlerLaunchSpec(input.spec)
  return {
    spec,
    policy: decodeGamescopePolicy(input.policy ?? {}),
    options: isRecord(input.options)
      ? {
          steamSession:
            optionalBoolean(input.options.steamSession) ??
            input.options.appIntegration === "steam",
          ...(typeof input.options.appIntegration === "string"
            ? { appIntegration: input.options.appIntegration }
            : {}),
        }
      : undefined,
  }
}

function decodeHandlerLaunchSpec(value: unknown): LaunchSpec {
  try {
    return decodeLaunchSpec(value)
  } catch (error) {
    throw new Error(
      `Gamescope launch.compose input.spec must be a launch spec: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
