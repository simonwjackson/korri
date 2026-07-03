import { korriStatePath, type XdgPathEnv } from "@platform/config/xdg-paths"
import type { ExecutablePluginResource } from "@platform/plugin"
import {
  bunProcessRunner,
  createNixOutLinkFulfiller,
  createNixOutLinkResolver,
  type PluginExecutableResourceFulfiller,
  type PluginExecutableResourceResolver,
} from "@platform/plugin/resources"
import { KORRI_GMLOADER_RUNTIME_RESOURCE_ID } from "./ids"

export const DEFAULT_GMLOADER_PLUGIN_RESOURCE_ROOT =
  "/var/lib/korri/plugins/resources" as const

export const defaultGmloaderRuntimeResource: ExecutablePluginResource = {
  id: KORRI_GMLOADER_RUNTIME_RESOURCE_ID,
  kind: "executable",
  fulfill: {
    provider: "nix",
    installable: ".#gmloader-next",
    binary: "gmloader-next",
  },
}

export function createDefaultGmloaderRuntimeResolver(
  env: XdgPathEnv,
): PluginExecutableResourceResolver {
  return createNixOutLinkResolver({
    stateRoot: gmloaderPluginResourceRoot(env),
  })
}

export function createDefaultGmloaderRuntimeFulfiller(
  env: XdgPathEnv,
): PluginExecutableResourceFulfiller | undefined {
  const nixCommand = env.KORRI_NIX_COMMAND?.trim()
  if (!nixCommand) return undefined
  return createNixOutLinkFulfiller({
    stateRoot: gmloaderPluginResourceRoot(env),
    nixCommand,
    runner: bunProcessRunner,
  })
}

export function gmloaderPluginResourceRoot(env: XdgPathEnv): string {
  const explicit = env.KORRI_PLUGIN_RESOURCE_ROOT?.trim()
  if (explicit) return explicit
  try {
    return korriStatePath(env, "plugins/resources")
  } catch {
    return DEFAULT_GMLOADER_PLUGIN_RESOURCE_ROOT
  }
}
