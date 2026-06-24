import { korriStatePath } from "@platform/config/xdg-paths"
import { LibraryError, LibrarySource } from "@platform/library/library-services"
import { createLiveLibrarySourceService } from "@platform/library/library-source-layer-live"
import { withPluginLibrarySource } from "@platform/plugin/catalog-library-source"
import { executableResources } from "@platform/plugin/registry"
import {
  bunProcessRunner,
  createNixOutLinkFulfiller,
  createNixOutLinkResolver,
} from "@platform/plugin/resources"
import { Effect, Layer } from "effect"
import {
  createFirstPartyPluginRegistryFromEnv,
  firstPartyLaunchIntegrationsForRegistry,
} from "."
import {
  defaultGmloaderInstallRoot,
  KORRI_GMLOADER_PLUGIN_ID,
  KORRI_GMLOADER_RUNTIME_RESOURCE_ID,
  withGmloaderInstalledLibrarySource,
} from "./gmloader"
import {
  defaultPortMasterInstallRoot,
  KORRI_PORTMASTER_PLUGIN_ID,
  withPortMasterInstalledLibrarySource,
} from "./portmaster"

const DEFAULT_PLUGIN_RESOURCE_ROOT = "/var/lib/korri/plugins/resources"

export const PluginLibrarySourceLayerLive = Layer.effect(
  LibrarySource,
  Effect.sync(() => {
    const registry = createFirstPartyPluginRegistryFromEnv(process.env)
    const source = withPluginLibrarySource(
      createLiveLibrarySourceService({
        repositoryOptions: {
          pluginRegistry: registry,
          launchIntegrations: firstPartyLaunchIntegrationsForRegistry(registry),
        },
      }),
      registry,
      createNixOutLinkResolver({ stateRoot: pluginResourceRoot(process.env) }),
    )
    const resourceResolver = createNixOutLinkResolver({
      stateRoot: pluginResourceRoot(process.env),
    })
    const withPortMaster = registry.enabledPluginIds.has(KORRI_PORTMASTER_PLUGIN_ID)
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
                        error instanceof Error ? error.message : String(error),
                    }),
                ),
              )
          },
        })
      : withPortMaster
  }),
)

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
