import { Effect } from "effect"

export type ConfigRecord = object
export type ConfigRecordMap = Readonly<Record<string, ConfigRecord>>

export type ProviderId = `@${string}:${string}`
export type PluginId = ProviderId
export type PluginNamespace = `@${string}`

export interface ProviderRecordRef {
  readonly provider: ProviderId
  readonly id: string
}

export type PluginRecordId = `${ProviderId}/${string}`

export type PluginOperation =
  | "catalog.list"
  | "launch.prepare"
  | "launch.compose"
  | "runtime.resolve"
  | "stream-control.apply"
  | "stream-control.describe"
  | "session.cleanup"
  | "package.expose"
  | "cli.expose"
  | "artifact.resolve-download"
  | "diagnostics.collect"
  | (string & {})

export interface PluginRequirement {
  readonly capability: string
  readonly ref?: ProviderRecordRef
  readonly reason?: string
}

export type PluginResult<Success> =
  | Success
  | PromiseLike<Success>
  | Effect.Effect<Success, unknown, never>

export interface PluginOperationContext<
  Operation extends PluginOperation = PluginOperation,
  Input = unknown,
> {
  readonly operation: Operation
  readonly provider: ProviderId
  readonly refs?: Readonly<Record<string, ProviderRecordRef>>
  readonly capabilities?: readonly string[]
  readonly input?: Input
}

export type PluginHandlerContext<Input = unknown> = PluginOperationContext<
  PluginOperation,
  Input
>

export interface PluginHandler<
  Operation extends PluginOperation = PluginOperation,
  Input = unknown,
  Output = unknown,
> {
  readonly id: string
  readonly operation: Operation
  readonly capabilities?: readonly string[]
  readonly run: (
    context: PluginOperationContext<Operation, Input>,
  ) => PluginResult<Output>
}

export interface PluginConfigContributions {
  readonly providers?: ConfigRecordMap
  readonly providerLinks?: ConfigRecordMap
  readonly storage?: ConfigRecordMap
  readonly systems?: ConfigRecordMap
  readonly apps?: ConfigRecordMap
  readonly modules?: ConfigRecordMap
  readonly runtimes?: ConfigRecordMap
  readonly profiles?: ConfigRecordMap
  readonly catalog?: Readonly<Record<string, PluginCatalogItem>>
}

export interface PluginContributions {
  readonly config?: PluginConfigContributions
  readonly handlers?: readonly PluginHandler[]
}

export interface PluginDefinitionInput {
  readonly namespace: PluginNamespace
  readonly name: string
  readonly title?: string
  readonly description?: string
  readonly requires?: readonly PluginRequirement[]
  readonly contributes?: PluginContributions
}

export interface KorriPlugin
  extends Omit<PluginDefinitionInput, "contributes"> {
  readonly id: ProviderId
  readonly ref: ProviderRecordRef
  readonly title: string
  readonly contributes: PluginContributions & {
    readonly config: PluginConfigContributions & {
      readonly providers: ConfigRecordMap
    }
  }
  readonly handlers: readonly PluginHandler[]
}

export function plugin(input: PluginDefinitionInput): KorriPlugin {
  const id = `${input.namespace}:${input.name}` as ProviderId
  const title = input.title ?? titleize(input.name)
  const contributes = input.contributes ?? {}
  const config = contributes.config ?? {}
  const explicitProviders = config.providers ?? {}
  const ownProvider = explicitProviders[id] ?? {}
  const handlers = contributes.handlers ?? []

  return {
    ...input,
    id,
    ref: { provider: id, id: "self" },
    title,
    contributes: {
      ...contributes,
      config: {
        ...config,
        providers: {
          ...explicitProviders,
          [id]: {
            title,
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...ownProvider,
          },
        },
      },
      handlers,
    },
    handlers,
  }
}

export function runPluginHandler<
  Operation extends PluginOperation,
  Input,
  Output,
>(
  handler: PluginHandler<Operation, Input, Output>,
  context: PluginOperationContext<Operation, Input>,
): Effect.Effect<Output, unknown> {
  return Effect.try({
    try: () => handler.run(context),
    catch: error => error,
  }).pipe(Effect.flatMap(result => normalizePluginHandlerResult(result)))
}

export function normalizePluginHandlerResult<T>(
  result: PluginResult<T>,
): Effect.Effect<T, unknown> {
  if (isEffect(result)) return result
  if (isPromiseLike(result)) return Effect.tryPromise(() => result)
  return Effect.succeed(result)
}

export function pluginRecordId(
  providerId: ProviderId,
  localId: string,
): PluginRecordId {
  return `${providerId}/${localId}`
}

export function parsePluginRecordId(
  recordId: string,
): ProviderRecordRef | null {
  const separator = recordId.indexOf("/")
  if (separator <= 0) return null
  const provider = recordId.slice(0, separator)
  const id = recordId.slice(separator + 1)
  if (!provider.startsWith("@") || !provider.includes(":")) return null
  if (id.length === 0) return null
  return { provider: provider as ProviderId, id }
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
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

function titleize(id: string): string {
  return id
    .split(/[-_.]+/g)
    .filter(Boolean)
    .map(part => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ")
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

export type PluginLaunch = ProcessPluginLaunch

export interface ProcessPluginLaunch {
  readonly kind: "process"
  readonly executable: { readonly resource: string }
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly with?: Readonly<Record<ProviderId, unknown>>
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
