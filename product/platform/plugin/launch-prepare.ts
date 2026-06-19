import { decodeLaunchSpec, type LaunchSpec } from "@platform/library/launcher"
import { Effect, Schema } from "effect"
import type { PluginHandler, ProviderId } from "./index"
import { runPluginHandler } from "./index"
import type { LaunchMetadata } from "./launch-metadata"
import type { PluginRegistry } from "./registry"

export const LAUNCH_PREPARE_OPERATION = "launch.prepare" as const
export const LAUNCH_PREPARE_CAPABILITY = "launch.prepare" as const

export type LaunchPrepareMode = "check" | "commit"
export type LaunchPrepareMap = Readonly<Record<ProviderId, unknown>>

const LaunchPrepareDiagnosticTag = Schema.Literals([
  "PluginMissing",
  "PluginDisabled",
  "CapabilityMissing",
  "OperationFailed",
  "InvalidOperationResult",
])

export const LaunchPrepareDiagnostic = Schema.Struct({
  _tag: LaunchPrepareDiagnosticTag,
  provider: Schema.String,
  operation: Schema.Literal(LAUNCH_PREPARE_OPERATION),
  capability: Schema.Literal(LAUNCH_PREPARE_CAPABILITY),
  phase: Schema.Literal("preflight"),
  recoverable: Schema.Boolean,
  message: Schema.String,
})
export type LaunchPrepareDiagnostic = Schema.Schema.Type<
  typeof LaunchPrepareDiagnostic
>

export interface LaunchPrepareOptions {
  readonly mode: LaunchPrepareMode
  readonly launchMetadata?: LaunchMetadata
}

export type LaunchPrepareResult =
  | { readonly _tag: "LaunchPrepared"; readonly spec: LaunchSpec }
  | {
      readonly _tag: "LaunchPrepareDiagnostics"
      readonly diagnostics: readonly LaunchPrepareDiagnostic[]
    }

export interface PrepareLaunchInput {
  readonly spec: LaunchSpec
  readonly launchPrepare?: LaunchPrepareMap
  readonly registry: PluginRegistry
  readonly options: LaunchPrepareOptions
}

export function prepareLaunch(
  input: PrepareLaunchInput,
): Effect.Effect<LaunchPrepareResult, never> {
  const prepareEntries = Object.entries(input.launchPrepare ?? {}) as Array<
    [ProviderId, unknown]
  >
  if (prepareEntries.length === 0) {
    return Effect.succeed({ _tag: "LaunchPrepared" as const, spec: input.spec })
  }

  return Effect.gen(function* () {
    let spec = input.spec
    const diagnostics: LaunchPrepareDiagnostic[] = []

    for (const [provider, policy] of prepareEntries) {
      if (isDisabledLaunchPreparePolicy(policy)) continue
      const plugin = input.registry.get(provider)
      if (plugin === undefined) {
        diagnostics.push(
          prepareDiagnostic(
            "PluginMissing",
            provider,
            `Launch prepare provider ${provider} is not registered`,
          ),
        )
        continue
      }
      if (!input.registry.enabledPluginIds.has(provider)) {
        diagnostics.push(
          prepareDiagnostic(
            "PluginDisabled",
            provider,
            `Launch prepare provider ${provider} is registered but not enabled`,
          ),
        )
        continue
      }

      const handler = plugin.handlers.find(isLaunchPrepareHandler) as
        | PluginHandler<typeof LAUNCH_PREPARE_OPERATION, unknown, unknown>
        | undefined
      if (handler === undefined) {
        diagnostics.push(
          prepareDiagnostic(
            "CapabilityMissing",
            provider,
            `Launch prepare provider ${provider} does not expose ${LAUNCH_PREPARE_OPERATION}`,
          ),
        )
        continue
      }

      const result = yield* runPluginHandler(handler, {
        operation: LAUNCH_PREPARE_OPERATION,
        provider,
        input: {
          spec,
          policy,
          mode: input.options.mode,
          ...(input.options.launchMetadata
            ? { launchMetadata: input.options.launchMetadata }
            : {}),
        },
      }).pipe(
        Effect.match({
          onSuccess: value => ({ _tag: "Success" as const, value }),
          onFailure: error => ({ _tag: "Failure" as const, error }),
        }),
      )

      if (result._tag === "Failure") {
        diagnostics.push(
          prepareDiagnostic(
            "OperationFailed",
            provider,
            `Launch prepare provider ${provider} failed: ${errorMessage(result.error)}`,
          ),
        )
        continue
      }

      try {
        spec = decodePreparedSpec(result.value, spec)
      } catch (error) {
        diagnostics.push(
          prepareDiagnostic(
            "InvalidOperationResult",
            provider,
            `Launch prepare provider ${provider} returned an invalid result: ${errorMessage(error)}`,
          ),
        )
      }
    }

    if (diagnostics.length > 0) {
      return {
        _tag: "LaunchPrepareDiagnostics" as const,
        diagnostics,
      }
    }

    return { _tag: "LaunchPrepared" as const, spec }
  })
}

export function launchPrepareDiagnosticSummary(
  diagnostics: readonly LaunchPrepareDiagnostic[],
): string {
  return diagnostics.map(diagnostic => diagnostic.message).join("; ")
}

function decodePreparedSpec(value: unknown, fallback: LaunchSpec): LaunchSpec {
  if (value === undefined || value === null) return fallback
  if (isRecord(value) && value.spec !== undefined) {
    return decodeLaunchSpec(value.spec)
  }
  return decodeLaunchSpec(value)
}

function isDisabledLaunchPreparePolicy(policy: unknown): boolean {
  return isRecord(policy) && policy.enable === false
}

function isLaunchPrepareHandler(handler: PluginHandler): boolean {
  return (
    handler.operation === LAUNCH_PREPARE_OPERATION &&
    (handler.capabilities === undefined ||
      handler.capabilities.includes(LAUNCH_PREPARE_CAPABILITY))
  )
}

function prepareDiagnostic(
  tag: LaunchPrepareDiagnostic["_tag"],
  provider: ProviderId,
  message: string,
): LaunchPrepareDiagnostic {
  return {
    _tag: tag,
    provider,
    operation: LAUNCH_PREPARE_OPERATION,
    capability: LAUNCH_PREPARE_CAPABILITY,
    phase: "preflight",
    recoverable: true,
    message,
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
