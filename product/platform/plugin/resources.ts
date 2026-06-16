import { constants } from "node:fs"
import { access, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { Data, Effect } from "effect"

import type { ExecutablePluginResource, PluginId } from "./index"

export class PluginResourceMissing extends Data.TaggedError(
  "PluginResourceMissing",
)<{
  readonly pluginId: PluginId
  readonly resourceId: string
  readonly path?: string
}> {}

export class PluginResourceFulfillmentFailed extends Data.TaggedError(
  "PluginResourceFulfillmentFailed",
)<{
  readonly pluginId: PluginId
  readonly resourceId: string
  readonly message: string
}> {}

export interface ResolvedExecutableResource {
  readonly pluginId: PluginId
  readonly resourceId: string
  readonly command: string
}

export type PluginResourceError =
  | PluginResourceMissing
  | PluginResourceFulfillmentFailed

export interface PluginExecutableResourceResolver {
  readonly resolveExecutable: (input: {
    readonly pluginId: PluginId
    readonly resource: ExecutablePluginResource
  }) => Effect.Effect<ResolvedExecutableResource, PluginResourceError>
}

export interface PluginExecutableResourceFulfiller {
  readonly fulfillExecutable: (input: {
    readonly pluginId: PluginId
    readonly resource: ExecutablePluginResource
  }) => Effect.Effect<ResolvedExecutableResource, PluginResourceError>
}

export interface ProcessRunResult {
  readonly exitCode: number
  readonly stdout?: string
  readonly stderr?: string
}

export interface ProcessRunner {
  readonly run: (
    command: string,
    args: readonly string[],
  ) => Promise<ProcessRunResult>
}

export interface NixOutLinkFulfillmentOptions {
  readonly stateRoot: string
  readonly nixCommand: string
  readonly runner: ProcessRunner
}

export function createNixOutLinkResolver(options: {
  readonly stateRoot: string
}): PluginExecutableResourceResolver {
  return {
    resolveExecutable: input =>
      resolveNixOutLinkExecutable({
        stateRoot: options.stateRoot,
        pluginId: input.pluginId,
        resource: input.resource,
      }),
  }
}

export function createNixOutLinkFulfiller(options: {
  readonly stateRoot: string
  readonly nixCommand: string
  readonly runner: ProcessRunner
}): PluginExecutableResourceFulfiller {
  return {
    fulfillExecutable: input =>
      fulfillNixOutLinkExecutable({
        stateRoot: options.stateRoot,
        nixCommand: options.nixCommand,
        runner: options.runner,
        pluginId: input.pluginId,
        resource: input.resource,
      }),
  }
}

export const bunProcessRunner: ProcessRunner = {
  run: async (command, args) => {
    const proc = Bun.spawn([command, ...args], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    return { exitCode, stdout, stderr }
  },
}

export function fulfillNixOutLinkExecutable(input: {
  readonly stateRoot: string
  readonly nixCommand: string
  readonly runner: ProcessRunner
  readonly pluginId: PluginId
  readonly resource: ExecutablePluginResource
}): Effect.Effect<
  ResolvedExecutableResource,
  PluginResourceMissing | PluginResourceFulfillmentFailed
> {
  return Effect.gen(function* () {
    if (!input.nixCommand.startsWith("/")) {
      return yield* Effect.fail(
        new PluginResourceFulfillmentFailed({
          pluginId: input.pluginId,
          resourceId: input.resource.id,
          message: "Nix command must be an absolute path",
        }),
      )
    }

    const link = outLinkPath(input.stateRoot, input.pluginId, input.resource.id)
    yield* Effect.tryPromise({
      try: () => mkdir(join(link, ".."), { recursive: true }),
      catch: error =>
        new PluginResourceFulfillmentFailed({
          pluginId: input.pluginId,
          resourceId: input.resource.id,
          message: error instanceof Error ? error.message : String(error),
        }),
    })

    const result = yield* Effect.tryPromise({
      try: () =>
        input.runner.run(input.nixCommand, [
          "build",
          input.resource.fulfill.installable,
          "--out-link",
          link,
        ]),
      catch: error =>
        new PluginResourceFulfillmentFailed({
          pluginId: input.pluginId,
          resourceId: input.resource.id,
          message: error instanceof Error ? error.message : String(error),
        }),
    })

    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        new PluginResourceFulfillmentFailed({
          pluginId: input.pluginId,
          resourceId: input.resource.id,
          message: result.stderr ?? `nix build exited ${result.exitCode}`,
        }),
      )
    }

    return yield* resolveNixOutLinkExecutable(input)
  })
}

export function resolveNixOutLinkExecutable(input: {
  readonly stateRoot: string
  readonly pluginId: PluginId
  readonly resource: ExecutablePluginResource
}): Effect.Effect<ResolvedExecutableResource, PluginResourceMissing> {
  const command = executablePath(
    input.stateRoot,
    input.pluginId,
    input.resource.id,
    input.resource.fulfill.binary,
  )
  return Effect.tryPromise({
    try: async () => {
      await access(command, constants.X_OK)
      return {
        pluginId: input.pluginId,
        resourceId: input.resource.id,
        command,
      }
    },
    catch: () =>
      new PluginResourceMissing({
        pluginId: input.pluginId,
        resourceId: input.resource.id,
        path: command,
      }),
  })
}

export function executablePath(
  stateRoot: string,
  pluginId: PluginId,
  resourceId: string,
  binary: string,
): string {
  return join(outLinkPath(stateRoot, pluginId, resourceId), "bin", binary)
}

export function outLinkPath(
  stateRoot: string,
  pluginId: PluginId,
  resourceId: string,
): string {
  return join(
    stateRoot,
    sanitizePathSegment(pluginId),
    sanitizePathSegment(resourceId),
    "result",
  )
}

function sanitizePathSegment(input: string): string {
  const hex = Array.from(new TextEncoder().encode(input), byte =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
  return `x${hex}`
}
