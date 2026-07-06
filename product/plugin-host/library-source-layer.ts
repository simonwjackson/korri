import { korriStatePath } from "@platform/config/xdg-paths"
import type { ConfigGraphController } from "@platform/library/config-graph-controller"
import { LibraryError, LibrarySource } from "@platform/library/library-services"
import {
  createControllerBackedLibrarySourceService,
  createLiveLibrarySourceService,
} from "@platform/library/library-source-layer-live"
import { withPluginLibrarySource } from "@platform/plugin/catalog-library-source"
import { executableResources } from "@platform/plugin/registry"
import {
  bunProcessRunner,
  createNixOutLinkFulfiller,
  createNixOutLinkResolver,
} from "@platform/plugin/resources"
import {
  defaultGmloaderInstallRoot,
  KORRI_GMLOADER_PLUGIN_ID,
  KORRI_GMLOADER_RUNTIME_RESOURCE_ID,
  withGmloaderInstalledLibrarySource,
} from "@product/plugins/gmloader"
import {
  defaultPortMasterInstallRoot,
  KORRI_PORTMASTER_PLUGIN_ID,
  withPortMasterInstalledLibrarySource,
} from "@product/plugins/portmaster"
import { Effect, Layer } from "effect"
import { firstPartyLaunchIntegrationsForRegistry } from "."
import { createFirstPartyPluginState } from "./state"

const DEFAULT_PLUGIN_RESOURCE_ROOT = "/var/lib/korri/plugins/resources"

export interface PluginLibrarySourceLayerLiveOptions {
  readonly configGraphController?: ConfigGraphController
}

export const PluginLibrarySourceLayerLive = makePluginLibrarySourceLayerLive()

export function makePluginLibrarySourceLayerLive(
  options: PluginLibrarySourceLayerLiveOptions = {},
) {
  return Layer.effect(
    LibrarySource,
    Effect.sync(() => {
      const registry = createFirstPartyPluginState().registry
      const repositoryOptions = {
        pluginRegistry: registry,
        launchIntegrations: firstPartyLaunchIntegrationsForRegistry(registry),
      }
      const baseSource = options.configGraphController
        ? createControllerBackedLibrarySourceService({
            controller: options.configGraphController,
            repositoryOptions,
          })
        : createLiveLibrarySourceService({ repositoryOptions })
      const source = withPluginLibrarySource(
        baseSource,
        registry,
        createNixOutLinkResolver({
          stateRoot: pluginResourceRoot(process.env),
        }),
      )
      const resourceResolver = createNixOutLinkResolver({
        stateRoot: pluginResourceRoot(process.env),
      })
      const withPortMaster = registry.enabledPluginIds.has(
        KORRI_PORTMASTER_PLUGIN_ID,
      )
        ? withPortMasterInstalledLibrarySource(source, {
            installRoot: defaultPortMasterInstallRoot(process.env),
            env: process.env,
          })
        : source
      return registry.enabledPluginIds.has(KORRI_GMLOADER_PLUGIN_ID)
        ? withGmloaderInstalledLibrarySource(withPortMaster, {
            installRoot: defaultGmloaderInstallRoot(process.env),
            env: process.env,
            resolveRuntime: () => {
              const resource = executableResources(registry).find(
                candidate =>
                  candidate.pluginId === KORRI_GMLOADER_PLUGIN_ID &&
                  candidate.resource.id === KORRI_GMLOADER_RUNTIME_RESOURCE_ID,
              )?.resource
              if (!resource) {
                return Effect.fail(
                  new LibraryError({
                    reason: "unavailable",
                    message: "GMLoader runtime resource is not registered",
                  }),
                )
              }
              return resourceResolver
                .resolveExecutable({
                  pluginId: KORRI_GMLOADER_PLUGIN_ID,
                  resource,
                })
                .pipe(
                  Effect.mapError(
                    error =>
                      new LibraryError({
                        reason: "unavailable",
                        message:
                          error instanceof Error
                            ? error.message
                            : String(error),
                      }),
                  ),
                )
            },
          })
        : withPortMaster
    }),
  )
}

export function createPluginResourceFulfillerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
) {
  const nixCommand = pluginNixCommand(env)
  if (!nixCommand) return undefined
  return createNixOutLinkFulfiller({
    stateRoot: pluginResourceRoot(env),
    nixCommand,
    runner: bunProcessRunner,
  })
}

function pluginNixCommand(env: NodeJS.ProcessEnv): string | undefined {
  const explicit = env.KORRI_NIX_COMMAND?.trim()
  return explicit && explicit.length > 0 ? explicit : undefined
}

function pluginResourceRoot(env: NodeJS.ProcessEnv): string {
  const explicit = env.KORRI_PLUGIN_RESOURCE_ROOT?.trim()
  if (explicit) return explicit
  try {
    return korriStatePath(env, "plugins/resources")
  } catch {
    return DEFAULT_PLUGIN_RESOURCE_ROOT
  }
}
