import type { GamescopePolicy } from "@platform/library/config/inheritable-fields"
import { Effect } from "effect"

export type PluginId = `@${string}:${string}`
export type PluginNamespace = `@${string}`

export interface PluginHandlerContext {
  readonly pluginId: PluginId
  readonly input?: unknown
}

export type PluginHandlerResult<T> =
  | T
  | Promise<T>
  | Effect.Effect<T, unknown, never>

export interface PluginHandler<T = unknown> {
  readonly id: string
  readonly operation: string
  readonly run: (context: PluginHandlerContext) => PluginHandlerResult<T>
}

export interface PluginCatalogItem {
  readonly id: string
  readonly title: string
  readonly kind: "game"
  readonly releases: readonly PluginCatalogRelease[]
}

export interface PluginCatalogRelease {
  readonly id: string
  readonly title?: string
  readonly launch: PluginLaunch
}

export type PluginLaunch = NativeExecutablePluginLaunch

export interface NativeExecutablePluginLaunch {
  readonly kind: "native-executable"
  readonly executable: { readonly resource: string }
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly gamescope?: GamescopePolicy
}

export interface NixExecutableFulfillment {
  readonly provider: "nix"
  readonly installable: string
  readonly binary: string
}

export interface ExecutablePluginResource {
  readonly id: string
  readonly kind: "executable"
  readonly fulfill: NixExecutableFulfillment
}

export type PluginResource = ExecutablePluginResource

export interface PluginContributions {
  readonly catalog?: readonly PluginCatalogItem[]
  readonly resources?: readonly PluginResource[]
}

export interface PluginDefinitionInput {
  readonly namespace: PluginNamespace
  readonly name: string
  readonly title: string
  readonly description?: string
  readonly contributes?: PluginContributions
  readonly handlers?: readonly PluginHandler[]
}

export interface KorriPlugin extends PluginDefinitionInput {
  readonly id: PluginId
  readonly contributes: PluginContributions
  readonly handlers: readonly PluginHandler[]
}

export function plugin(input: PluginDefinitionInput): KorriPlugin {
  return {
    ...input,
    id: `${input.namespace}:${input.name}` as PluginId,
    contributes: input.contributes ?? {},
    handlers: input.handlers ?? [],
  }
}

export function runPluginHandler<T>(
  handler: PluginHandler<T>,
  context: PluginHandlerContext,
): Effect.Effect<T, unknown> {
  return normalizePluginHandlerResult(handler.run(context))
}

export function normalizePluginHandlerResult<T>(
  result: PluginHandlerResult<T>,
): Effect.Effect<T, unknown> {
  if (isEffect(result)) return result
  if (isPromiseLike(result)) return Effect.tryPromise(() => result)
  return Effect.succeed(result)
}

function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { readonly then?: unknown }).then === "function"
  )
}

function isEffect<T>(
  value: unknown,
): value is Effect.Effect<T, unknown, never> {
  return Effect.isEffect(value)
}
