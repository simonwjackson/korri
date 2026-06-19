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
  type CollectPluginLifecyclePayload,
  CollectPluginLifecycleResponse,
} from "./collect.rpc"

const LIFECYCLE_COLLECT_OPERATION = "lifecycle.collect" as const
const LIFECYCLE_COLLECT_CAPABILITY = "lifecycle.collect" as const

export const handleCollectPluginLifecycle = (
  payload: typeof CollectPluginLifecyclePayload.Type,
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

    const handler = plugin.handlers.find(isLifecycleCollectHandler) as
      | PluginHandler<typeof LIFECYCLE_COLLECT_OPERATION, unknown, unknown>
      | undefined

    if (!handler) {
      return yield* Effect.fail(
        new NotFoundError({
          message: `Plugin provider ${payload.providerId} does not expose lifecycle`,
        }),
      )
    }

    const lifecycle = yield* runPluginHandler(handler, {
      operation: LIFECYCLE_COLLECT_OPERATION,
      provider: payload.providerId,
      input: {
        ...(payload.appId ? { appId: payload.appId } : {}),
        ...(payload.launchId ? { launchId: payload.launchId } : {}),
        ...(payload.sinceSequence !== undefined
          ? { sinceSequence: payload.sinceSequence }
          : {}),
        ...(payload.limit !== undefined ? { limit: payload.limit } : {}),
      },
    }).pipe(
      Effect.mapError(
        error =>
          new DataError({
            reason: "Unavailable",
            message: `Plugin provider ${payload.providerId} lifecycle failed: ${String(error)}`,
          }),
      ),
    )

    return new CollectPluginLifecycleResponse({
      providerId: payload.providerId,
      lifecycle,
    })
  })

function isProviderId(value: string): value is ProviderId {
  return value.startsWith("@") && value.includes(":")
}

function isLifecycleCollectHandler(handler: PluginHandler): boolean {
  return (
    handler.operation === LIFECYCLE_COLLECT_OPERATION &&
    (handler.capabilities === undefined ||
      handler.capabilities.includes(LIFECYCLE_COLLECT_CAPABILITY))
  )
}
