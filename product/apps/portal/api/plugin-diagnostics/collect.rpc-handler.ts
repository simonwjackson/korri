import {
  DataError,
  NotFoundError,
  ValidationError,
} from "@platform/api/rpc/errors"
import type { PluginHandler, ProviderId } from "@platform/plugin"
import { runPluginHandler } from "@platform/plugin"
import { Effect } from "effect"
import { createFirstPartyPluginRegistryFromEnv } from "../../../../plugins"
import {
  type CollectPluginDiagnosticsPayload,
  CollectPluginDiagnosticsResponse,
} from "./collect.rpc"

const DIAGNOSTICS_COLLECT_OPERATION = "diagnostics.collect" as const
const DIAGNOSTICS_COLLECT_CAPABILITY = "diagnostics.collect" as const

export const handleCollectPluginDiagnostics = (
  payload: typeof CollectPluginDiagnosticsPayload.Type,
) =>
  Effect.gen(function* () {
    if (!isProviderId(payload.providerId)) {
      return yield* Effect.fail(
        new ValidationError({
          message: `Invalid provider id: ${payload.providerId}`,
        }),
      )
    }

    const registry = createFirstPartyPluginRegistryFromEnv(process.env)
    const plugin = registry.get(payload.providerId)

    if (!plugin || !registry.enabledPluginIds.has(payload.providerId)) {
      return yield* Effect.fail(
        new NotFoundError({
          message: `Plugin provider ${payload.providerId} is not enabled or does not exist`,
        }),
      )
    }

    const handler = plugin.handlers.find(isDiagnosticsCollectHandler) as
      | PluginHandler<typeof DIAGNOSTICS_COLLECT_OPERATION, unknown, unknown>
      | undefined

    if (!handler) {
      return yield* Effect.fail(
        new NotFoundError({
          message: `Plugin provider ${payload.providerId} does not expose diagnostics`,
        }),
      )
    }

    const diagnostics = yield* runPluginHandler(handler, {
      operation: DIAGNOSTICS_COLLECT_OPERATION,
      provider: payload.providerId,
      input: payload.input,
    }).pipe(
      Effect.mapError(
        error =>
          new DataError({
            reason: "Unavailable",
            message: `Plugin provider ${payload.providerId} diagnostics failed: ${String(error)}`,
          }),
      ),
    )

    return new CollectPluginDiagnosticsResponse({
      providerId: payload.providerId,
      diagnostics,
    })
  })

function isProviderId(value: string): value is ProviderId {
  return value.startsWith("@") && value.includes(":")
}

function isDiagnosticsCollectHandler(handler: PluginHandler): boolean {
  return (
    handler.operation === DIAGNOSTICS_COLLECT_OPERATION &&
    (handler.capabilities === undefined ||
      handler.capabilities.includes(DIAGNOSTICS_COLLECT_CAPABILITY))
  )
}
