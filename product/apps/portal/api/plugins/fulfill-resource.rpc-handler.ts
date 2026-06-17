import { DataError, NotFoundError } from "@platform/api/rpc/errors"
import type { PluginId } from "@platform/plugin"
import { executableResources } from "@platform/plugin/registry"
import { Effect } from "effect"
import { createFirstPartyPluginRegistryFromEnv } from "../../../../plugins"
import { createPluginResourceFulfillerFromEnv } from "../../../../plugins/library-source-layer"
import {
  type FulfillPluginResourcePayload,
  FulfillPluginResourceResponse,
} from "./fulfill-resource.rpc"

export const handleFulfillPluginResource = (
  payload: typeof FulfillPluginResourcePayload.Type,
) =>
  Effect.gen(function* () {
    const registry = createFirstPartyPluginRegistryFromEnv(process.env)
    const resource = executableResources(registry).find(
      candidate =>
        candidate.pluginId === (payload.pluginId as PluginId) &&
        candidate.resource.id === payload.resourceId,
    )

    if (!resource) {
      return yield* Effect.fail(
        new NotFoundError({
          message: `Plugin resource ${payload.pluginId}/${payload.resourceId} is not enabled or does not exist`,
        }),
      )
    }

    const fulfiller = createPluginResourceFulfillerFromEnv(process.env)
    if (!fulfiller) {
      return yield* Effect.fail(
        new DataError({
          reason: "Unavailable",
          message:
            "KORRI_NIX_COMMAND is not configured for plugin resource fulfillment",
        }),
      )
    }

    const resolved = yield* fulfiller
      .fulfillExecutable({
        pluginId: resource.pluginId,
        resource: resource.resource,
      })
      .pipe(
        Effect.mapError(
          error =>
            new DataError({
              reason: "Unavailable",
              message: `Plugin resource ${error.pluginId}/${error.resourceId} fulfillment failed: ${"path" in error ? error.path : error.message}`,
            }),
        ),
      )

    return new FulfillPluginResourceResponse({
      pluginId: resolved.pluginId,
      resourceId: resolved.resourceId,
      command: resolved.command,
    })
  })
