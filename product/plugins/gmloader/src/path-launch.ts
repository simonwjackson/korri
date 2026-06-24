import { LibraryError } from "@platform/library/library-services"
import type { ExecutablePluginResource, ProviderId } from "@platform/plugin"
import type {
  PluginExecutableResourceFulfiller,
  PluginExecutableResourceResolver,
} from "@platform/plugin/resources"
import { Effect } from "effect"
import { prepareGmloaderLaunchEnvelope, type GmloaderLaunchEnvelope } from "./envelope"
import {
  ensureGmloaderPayloadInstalled,
  GmloaderInstallRejected,
  type InstallGmloaderPayloadInput,
} from "./installer"
import type { GmloaderInstalledManifest } from "./manifest"
import { resolveOrFulfillGmloaderRuntime } from "./runtime"

export interface PrepareGmloaderPathLaunchInput {
  readonly providerId: ProviderId
  readonly sourcePath: string
  readonly installRoot: string
  readonly runtimeResource: ExecutablePluginResource
  readonly runtimeResolver: PluginExecutableResourceResolver
  readonly runtimeFulfiller?: PluginExecutableResourceFulfiller
  readonly allowRuntimeFulfill?: boolean
  readonly title?: string
  readonly installedAt?: string
  readonly overwrite?: boolean
  readonly compatibility?: InstallGmloaderPayloadInput["compatibility"]
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly sdlGameControllerConfig?: string
}

export interface GmloaderPathLaunchResult {
  readonly manifest: GmloaderInstalledManifest
  readonly envelope: GmloaderLaunchEnvelope
  readonly payloadStatus: "cache-hit" | "materialized"
  readonly runtimeStatus: "cache-hit" | "fulfilled"
  readonly diagnostics: readonly string[]
}

export function prepareGmloaderPathLaunch(
  input: PrepareGmloaderPathLaunchInput,
): Effect.Effect<GmloaderPathLaunchResult, LibraryError> {
  return Effect.gen(function* () {
    const installed = yield* Effect.tryPromise({
      try: () =>
        ensureGmloaderPayloadInstalled({
          providerId: input.providerId,
          sourcePath: input.sourcePath,
          installRoot: input.installRoot,
          title: input.title,
          installedAt: input.installedAt,
          overwrite: input.overwrite,
          compatibility: input.compatibility,
        }),
      catch: error => installError(error),
    })
    const runtime = yield* resolveOrFulfillGmloaderRuntime({
      resource: input.runtimeResource,
      resolver: input.runtimeResolver,
      fulfiller: input.runtimeFulfiller,
      allowFulfill: input.allowRuntimeFulfill,
    })
    const envelope = yield* Effect.tryPromise({
      try: () =>
        prepareGmloaderLaunchEnvelope({
          manifest: installed.manifest,
          runtime: runtime.runtime,
          env: input.env,
          sdlGameControllerConfig: input.sdlGameControllerConfig,
        }),
      catch: error =>
        error instanceof LibraryError
          ? error
          : new LibraryError({
              reason: "config",
              message: error instanceof Error ? error.message : String(error),
            }),
    })
    return {
      manifest: installed.manifest,
      envelope,
      payloadStatus: installed.status,
      runtimeStatus: runtime.status,
      diagnostics: [
        installed.status === "cache-hit"
          ? "payload-cache-hit"
          : "payload-materialized",
        runtime.status === "cache-hit" ? "runtime-cache-hit" : "runtime-fulfilled",
      ],
    }
  })
}

function installError(error: unknown): LibraryError {
  if (error instanceof GmloaderInstallRejected) {
    return new LibraryError({
      reason: "config",
      diagnostic: "gmloader-payload-unsupported",
      message: error.message,
    })
  }
  return new LibraryError({
    reason: "config",
    message: error instanceof Error ? error.message : String(error),
  })
}
