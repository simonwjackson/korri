import type { LaunchCompanionMap } from "@platform/library/config/inheritable-fields"
import { decodeLaunchSpec, type LaunchSpec } from "@platform/library/launcher"
import { Effect, Schema } from "effect"
import type { PluginHandler, ProviderId } from "./index"
import { runPluginHandler } from "./index"
import type { LaunchMetadata } from "./launch-metadata"
import type { PluginRegistry } from "./registry"

export const LAUNCH_COMPOSE_OPERATION = "launch.compose" as const
export const LAUNCH_COMPOSE_CAPABILITY = "launch.compose" as const

const LaunchCompanionDiagnosticTag = Schema.Literals([
  "PluginMissing",
  "PluginDisabled",
  "CapabilityMissing",
  "OperationFailed",
  "InvalidOperationResult",
])

export const LaunchCompanionDiagnostic = Schema.Struct({
  _tag: LaunchCompanionDiagnosticTag,
  provider: Schema.String,
  operation: Schema.Literal(LAUNCH_COMPOSE_OPERATION),
  capability: Schema.Literal(LAUNCH_COMPOSE_CAPABILITY),
  phase: Schema.Literal("preflight"),
  recoverable: Schema.Boolean,
  message: Schema.String,
})
export type LaunchCompanionDiagnostic = Schema.Schema.Type<
  typeof LaunchCompanionDiagnostic
>

export interface LaunchCompanionComposeOptions {
  readonly launchMetadata?: LaunchMetadata
  readonly launchId?: string
}

export type LaunchCompanionCompositionResult =
  | { readonly _tag: "LaunchCompanionsComposed"; readonly spec: LaunchSpec }
  | {
      readonly _tag: "LaunchCompanionDiagnostics"
      readonly diagnostics: readonly LaunchCompanionDiagnostic[]
    }

export interface ComposeLaunchCompanionsInput {
  readonly spec: LaunchSpec
  readonly launchCompanions?: LaunchCompanionMap
  readonly registry: PluginRegistry
  readonly options?: LaunchCompanionComposeOptions
}

export function composeLaunchCompanions(
  input: ComposeLaunchCompanionsInput,
): Effect.Effect<LaunchCompanionCompositionResult, never> {
  const companionEntries = Object.entries(
    input.launchCompanions ?? {},
  ) as Array<[ProviderId, unknown]>
  if (companionEntries.length === 0) {
    return Effect.succeed({
      _tag: "LaunchCompanionsComposed" as const,
      spec: input.spec,
    })
  }

  return Effect.gen(function* () {
    let spec = input.spec
    const diagnostics: LaunchCompanionDiagnostic[] = []

    for (const [provider, policy] of companionEntries) {
      if (isDisabledLaunchCompanionPolicy(policy)) continue
      const plugin = input.registry.get(provider)
      if (plugin === undefined) {
        diagnostics.push(
          launchDiagnostic(
            "PluginMissing",
            provider,
            `Launch companion provider ${provider} is not registered`,
          ),
        )
        continue
      }
      if (!input.registry.enabledPluginIds.has(provider)) {
        diagnostics.push(
          launchDiagnostic(
            "PluginDisabled",
            provider,
            `Launch companion provider ${provider} is registered but not enabled`,
          ),
        )
        continue
      }

      const handler = plugin.handlers.find(isLaunchComposeHandler) as
        | PluginHandler<typeof LAUNCH_COMPOSE_OPERATION, unknown, unknown>
        | undefined
      if (handler === undefined) {
        diagnostics.push(
          launchDiagnostic(
            "CapabilityMissing",
            provider,
            `Launch companion provider ${provider} does not expose ${LAUNCH_COMPOSE_OPERATION}`,
          ),
        )
        continue
      }

      const result = yield* runPluginHandler(handler, {
        operation: LAUNCH_COMPOSE_OPERATION,
        provider,
        input: {
          spec,
          policy,
          ...(input.options ? { options: input.options } : {}),
        },
      }).pipe(
        Effect.match({
          onSuccess: value => ({ _tag: "Success" as const, value }),
          onFailure: error => ({ _tag: "Failure" as const, error }),
        }),
      )

      if (result._tag === "Failure") {
        diagnostics.push(
          launchDiagnostic(
            "OperationFailed",
            provider,
            `Launch companion provider ${provider} failed: ${errorMessage(result.error)}`,
          ),
        )
        continue
      }

      try {
        spec = decodeLaunchSpec(result.value)
      } catch (error) {
        diagnostics.push(
          launchDiagnostic(
            "InvalidOperationResult",
            provider,
            `Launch companion provider ${provider} returned an invalid launch spec: ${errorMessage(error)}`,
          ),
        )
      }
    }

    if (diagnostics.length > 0) {
      return {
        _tag: "LaunchCompanionDiagnostics" as const,
        diagnostics,
      }
    }

    return { _tag: "LaunchCompanionsComposed" as const, spec }
  })
}

export function launchCompanionDiagnosticSummary(
  diagnostics: readonly LaunchCompanionDiagnostic[],
): string {
  return diagnostics.map(diagnostic => diagnostic.message).join("; ")
}

function isDisabledLaunchCompanionPolicy(policy: unknown): boolean {
  return isRecord(policy) && policy.enable === false
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isLaunchComposeHandler(handler: PluginHandler): boolean {
  return (
    handler.operation === LAUNCH_COMPOSE_OPERATION &&
    (handler.capabilities === undefined ||
      handler.capabilities.includes(LAUNCH_COMPOSE_CAPABILITY))
  )
}

function launchDiagnostic(
  tag: LaunchCompanionDiagnostic["_tag"],
  provider: ProviderId,
  message: string,
): LaunchCompanionDiagnostic {
  return {
    _tag: tag,
    provider,
    operation: LAUNCH_COMPOSE_OPERATION,
    capability: LAUNCH_COMPOSE_CAPABILITY,
    phase: "preflight",
    recoverable: true,
    message,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
