import { AcquisitionError } from "@platform/acquisition/errors"
import { plugin, type ExecutablePluginResource } from "@platform/plugin"
import type {
  PluginExecutableResourceFulfiller,
  PluginExecutableResourceResolver,
} from "@platform/plugin/resources"
import { Effect } from "effect"
import { prepareGmloaderLaunchEnvelope } from "./envelope"
import {
  KORRI_GMLOADER_PLUGIN_ID,
  KORRI_GMLOADER_RUNTIME_RESOURCE_ID,
} from "./ids"
import { GmloaderInstallRejected, installGmloaderPayload } from "./installer"
import { inspectGmloaderPayload } from "./payload"
import { prepareGmloaderPathLaunch } from "./path-launch"
import {
  createDefaultGmloaderRuntimeFulfiller,
  createDefaultGmloaderRuntimeResolver,
  defaultGmloaderRuntimeResource,
} from "./runtime-defaults"

export {
  KORRI_GMLOADER_PLUGIN_ID,
  KORRI_GMLOADER_RUNTIME_RESOURCE_ID,
} from "./ids"

export interface GmloaderPluginOptions {
  readonly installRoot?: string
  readonly runtimeResource?: ExecutablePluginResource
  readonly runtimeResolver?: PluginExecutableResourceResolver
  readonly runtimeFulfiller?: PluginExecutableResourceFulfiller
  readonly allowRuntimeFulfill?: boolean
}

export function createGmloaderPlugin(options: GmloaderPluginOptions = {}) {
  return plugin({
    namespace: "@korri",
    name: "gmloader",
    title: "GMLoader",
    description:
      "Installs and launches compatible GameMaker Android runner payloads through GMLoader Next.",
    contributes: {
      config: {
        providers: {
          [KORRI_GMLOADER_PLUGIN_ID]: {
            legalRisk: "medium",
            credentialRequired: false,
            enabledByDefault: false,
          },
        },
        modules: {
          [KORRI_GMLOADER_RUNTIME_RESOURCE_ID]: {
            id: KORRI_GMLOADER_RUNTIME_RESOURCE_ID,
            kind: "executable",
            fulfill: {
              provider: "nix",
              installable: ".#gmloader-next",
              binary: "gmloader-next",
            },
          },
        },
      },
      handlers: [
        {
          id: "gmloader.payload.inspect",
          operation: "gmloader.payload.inspect",
          capabilities: ["gmloader.payload.inspect", "gmloader"],
          run: context => {
            const input = readRecord(context.input)
            const sourcePath = stringField(input, "sourcePath")
            return Effect.tryPromise({
              try: () => inspectGmloaderPayload({ sourcePath }),
              catch: error =>
                new AcquisitionError({
                  reason: "caller",
                  providerId: context.provider,
                  message: `Failed to inspect GMLoader payload: ${stringifyError(error)}`,
                }),
            })
          },
        },
        {
          id: "gmloader.install",
          operation: "gmloader.install",
          capabilities: ["gmloader.install", "gmloader"],
          run: context => {
            const input = readRecord(context.input)
            const sourcePath = stringField(input, "sourcePath")
            const installRoot =
              stringValue(input.installRoot) ?? options.installRoot
            if (!installRoot) {
              return Effect.fail(
                new AcquisitionError({
                  reason: "configuration",
                  providerId: context.provider,
                  message: "GMLoader install root is not configured",
                }),
              )
            }
            return Effect.tryPromise({
              try: () =>
                installGmloaderPayload({
                  providerId: context.provider,
                  sourcePath,
                  installRoot,
                  title: stringValue(input.title),
                  installedAt: stringValue(input.installedAt),
                  overwrite: booleanValue(input.overwrite),
                  compatibility: compatibilityFromInput(input.compatibility),
                }),
              catch: error =>
                error instanceof GmloaderInstallRejected
                  ? new AcquisitionError({
                      reason: "caller",
                      providerId: context.provider,
                      message: error.message,
                    })
                  : new AcquisitionError({
                      reason: "defective-provider",
                      providerId: context.provider,
                      message: `Failed to install GMLoader payload: ${stringifyError(error)}`,
                    }),
            })
          },
        },
        {
          id: "gmloader.launch-path-prepare",
          operation: "gmloader.launch.path.prepare",
          capabilities: ["gmloader.launch.path.prepare", "gmloader"],
          run: context => {
            const input = readRecord(context.input)
            const sourcePath = stringField(input, "sourcePath")
            const installRoot =
              stringValue(input.installRoot) ?? options.installRoot
            if (!installRoot) {
              return Effect.fail(
                new AcquisitionError({
                  reason: "configuration",
                  providerId: context.provider,
                  message: "GMLoader install root is not configured",
                }),
              )
            }
            const runtimeFulfiller =
              options.runtimeFulfiller ??
              createDefaultGmloaderRuntimeFulfiller(process.env)
            return prepareGmloaderPathLaunch({
              providerId: context.provider,
              sourcePath,
              installRoot,
              runtimeResource:
                options.runtimeResource ?? defaultGmloaderRuntimeResource,
              runtimeResolver:
                options.runtimeResolver ??
                createDefaultGmloaderRuntimeResolver(process.env),
              runtimeFulfiller,
              allowRuntimeFulfill:
                booleanValue(input.allowRuntimeFulfill) ??
                options.allowRuntimeFulfill ??
                runtimeFulfiller !== undefined,
              title: stringValue(input.title),
              installedAt: stringValue(input.installedAt),
              overwrite: booleanValue(input.overwrite),
              compatibility: compatibilityFromInput(input.compatibility),
              sdlGameControllerConfig: stringValue(
                input.sdlGameControllerConfig,
              ),
            }).pipe(
              Effect.mapError(
                error =>
                  new AcquisitionError({
                    reason:
                      error.diagnostic === "gmloader-payload-unsupported"
                        ? "caller"
                        : error.reason === "unavailable"
                          ? "configuration"
                          : "defective-provider",
                    providerId: context.provider,
                    message: error.message,
                  }),
              ),
            )
          },
        },
        {
          id: "gmloader.prepare-launch",
          operation: "gmloader.prepare-launch",
          capabilities: ["gmloader.prepare-launch", "gmloader"],
          run: context => {
            const input = readRecord(context.input)
            return Effect.tryPromise({
              try: () =>
                prepareGmloaderLaunchEnvelope({
                  manifestPath: stringValue(input.manifestPath),
                  command: stringValue(input.command),
                  sdlGameControllerConfig: stringValue(
                    input.sdlGameControllerConfig,
                  ),
                }),
              catch: error =>
                new AcquisitionError({
                  reason: "defective-provider",
                  providerId: context.provider,
                  message: `Failed to prepare GMLoader launch: ${stringifyError(error)}`,
                }),
            })
          },
        },
      ],
    },
  })
}

export const gmloaderPlugin = createGmloaderPlugin()

function compatibilityFromInput(input: unknown):
  | {
      readonly env?: Readonly<Record<string, string>>
      readonly limitations?: readonly string[]
    }
  | undefined {
  if (!isRecord(input)) return undefined
  const env = isRecord(input.env)
    ? Object.fromEntries(
        Object.entries(input.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : undefined
  const limitations = Array.isArray(input.limitations)
    ? input.limitations.filter(
        (item): item is string => typeof item === "string",
      )
    : undefined
  return {
    ...(env && Object.keys(env).length > 0 ? { env } : {}),
    ...(limitations && limitations.length > 0 ? { limitations } : {}),
  }
}

function readRecord(input: unknown): Record<string, unknown> {
  return isRecord(input) ? input : {}
}

function stringField(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  if (typeof value === "string" && value.length > 0) return value
  throw new AcquisitionError({
    reason: "caller",
    message: `Missing required field: ${key}`,
  })
}

function stringValue(input: unknown): string | undefined {
  return typeof input === "string" && input.length > 0 ? input : undefined
}

function booleanValue(input: unknown): boolean | undefined {
  return typeof input === "boolean" ? input : undefined
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
