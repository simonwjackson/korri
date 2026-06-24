import { LibraryError } from "@platform/library/library-services"
import type { ExecutablePluginResource } from "@platform/plugin"
import type {
  PluginExecutableResourceFulfiller,
  PluginExecutableResourceResolver,
  PluginResourceError,
  ResolvedExecutableResource,
} from "@platform/plugin/resources"
import { Effect } from "effect"
import {
  KORRI_GMLOADER_PLUGIN_ID,
  KORRI_GMLOADER_RUNTIME_RESOURCE_ID,
} from "./ids"

export interface ResolveOrFulfillGmloaderRuntimeInput {
  readonly resource: ExecutablePluginResource
  readonly resolver: PluginExecutableResourceResolver
  readonly fulfiller?: PluginExecutableResourceFulfiller
  readonly allowFulfill?: boolean
}

export interface ResolveOrFulfillGmloaderRuntimeResult {
  readonly runtime: ResolvedExecutableResource
  readonly status: "cache-hit" | "fulfilled"
}

export function resolveOrFulfillGmloaderRuntime(
  input: ResolveOrFulfillGmloaderRuntimeInput,
): Effect.Effect<ResolveOrFulfillGmloaderRuntimeResult, LibraryError> {
  return input.resolver
    .resolveExecutable({
      pluginId: KORRI_GMLOADER_PLUGIN_ID,
      resource: input.resource,
    })
    .pipe(
      Effect.matchEffect({
        onSuccess: runtime =>
          Effect.succeed({ status: "cache-hit" as const, runtime }),
        onFailure: error => {
          if (!input.allowFulfill) {
            return Effect.fail(runtimeUnavailable(error))
          }
          if (!input.fulfiller) {
            return Effect.fail(
              new LibraryError({
                reason: "unavailable",
                message:
                  "GMLoader runtime is not available and runtime fulfillment is not configured",
              }),
            )
          }
          return input.fulfiller
            .fulfillExecutable({
              pluginId: KORRI_GMLOADER_PLUGIN_ID,
              resource: input.resource,
            })
            .pipe(
              Effect.map(runtime => ({
                status: "fulfilled" as const,
                runtime,
              })),
              Effect.mapError(runtimeUnavailable),
            )
        },
      }),
    )
}

export function isGmloaderRuntimeResource(
  resource: ExecutablePluginResource,
): boolean {
  return resource.id === KORRI_GMLOADER_RUNTIME_RESOURCE_ID
}

function runtimeUnavailable(error: PluginResourceError): LibraryError {
  const detail =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "path" in error && typeof error.path === "string"
        ? error.path
        : String(error)
  return new LibraryError({
    reason: "unavailable",
    message: `runtime-unavailable: GMLoader runtime is not available: ${detail}`,
  })
}
