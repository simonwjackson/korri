import { korriStatePath } from "@platform/config/xdg-paths"
import { LibrarySource } from "@platform/library/library-services"
import { LibrarySourceLayerLive } from "@platform/library/library-source-layer-live"
import { withPluginLibrarySource } from "@platform/plugin/catalog-library-source"
import {
  bunProcessRunner,
  createNixOutLinkFulfiller,
  createNixOutLinkResolver,
} from "@platform/plugin/resources"
import { Effect, Layer } from "effect"
import { createFirstPartyPluginRegistryFromEnv } from "."

const DEFAULT_PLUGIN_RESOURCE_ROOT = "/var/lib/korri/plugins/resources"

export const PluginLibrarySourceLayerLive = Layer.effect(LibrarySource)(
  Effect.gen(function* () {
    const base = yield* LibrarySource
    const registry = createFirstPartyPluginRegistryFromEnv(process.env)
    return withPluginLibrarySource(
      base,
      registry,
      createNixOutLinkResolver({ stateRoot: pluginResourceRoot(process.env) }),
    )
  }),
).pipe(Layer.provide(LibrarySourceLayerLive))

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
