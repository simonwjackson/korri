/**
 * Tagged-union errors produced by the config cascade resolver and
 * launch-spec composer. Each error carries enough context for both the
 * RPC response surface (typed error union in
 * `prepare.rpc.ts`) and human-facing log/diagnostic output.
 *
 * The split:
 * - Resolution errors (`*-NotFound`, `LauncherUnresolvable`,
 *   `CoreNotConfigured`) come from the cascade resolver — produced
 *   before any placeholder substitution.
 * - Composition errors (`MissingRequiredValue`, `UnresolvedPlaceholder`,
 *   `DisallowedCommand`) come from `composeLaunchSpec` — the final
 *   adapter that fills `{contentPath}` / `{core}` / `{system}` /
 *   `{emulator}` into the launcher's argv template.
 */

import { Data } from "effect"

const SUPPORTED_PATCH_EXTENSIONS = [".ips", ".bps", ".ups"] as const
export type SupportedPatchExtension =
  (typeof SUPPORTED_PATCH_EXTENSIONS)[number]
export type SupportedPatchFormat = SupportedPatchExtension extends `.${infer F}`
  ? F
  : never

export const supportedPatchExtensions =
  (): readonly SupportedPatchExtension[] => SUPPORTED_PATCH_EXTENSIONS

export const patchExtensionForPath = (path: string): string | undefined => {
  const basename = path.split(/[/\\]/).pop() ?? path
  const dot = basename.lastIndexOf(".")
  if (dot <= 0 || dot === basename.length - 1) return undefined
  return basename.slice(dot).toLowerCase()
}

export const supportedPatchFormatForPath = (
  path: string,
): SupportedPatchFormat | undefined => {
  const extension = patchExtensionForPath(path)
  if (!isSupportedPatchExtension(extension)) return undefined
  return extension.slice(1) as SupportedPatchFormat
}

const isSupportedPatchExtension = (
  extension: string | undefined,
): extension is SupportedPatchExtension =>
  SUPPORTED_PATCH_EXTENSIONS.includes(extension as SupportedPatchExtension)

export class GameNotFound extends Data.TaggedError("GameNotFound")<{
  readonly gameId: string
}> {}

export class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly userId: string
}> {}

export class PresetNotFound extends Data.TaggedError("PresetNotFound")<{
  readonly presetId: string
  readonly gameId: string
}> {}

export class LauncherUnresolvable extends Data.TaggedError(
  "LauncherUnresolvable",
)<{
  readonly gameId: string
}> {}

export class CoreNotConfigured extends Data.TaggedError("CoreNotConfigured")<{
  readonly gameId: string
  readonly systemId: string
  readonly launcherId: string
}> {}

export class AppNotFound extends Data.TaggedError("AppNotFound")<{
  readonly appId: string
}> {}

export class CustomAppMissingCommand extends Data.TaggedError(
  "CustomAppMissingCommand",
)<{
  readonly appId: string
}> {}

export class ModuleNotFound extends Data.TaggedError("ModuleNotFound")<{
  readonly moduleId: string
}> {}

export class ModulePathMissing extends Data.TaggedError("ModulePathMissing")<{
  readonly moduleId: string
  readonly path: string
}> {}

export class IncompatibleModule extends Data.TaggedError("IncompatibleModule")<{
  readonly appId: string
  readonly moduleId: string
  readonly moduleKind: string
}> {}

export class AppMaterializationFailed extends Data.TaggedError(
  "AppMaterializationFailed",
)<{
  readonly appId: string
  readonly reason: string
}> {}

export class PatchFileMissing extends Data.TaggedError("PatchFileMissing")<{
  readonly path: string
}> {}

export class PatchFileUnreadable extends Data.TaggedError(
  "PatchFileUnreadable",
)<{
  readonly path: string
  readonly reason?: string
}> {}

export class PatchFileNotRegular extends Data.TaggedError(
  "PatchFileNotRegular",
)<{
  readonly path: string
  readonly fileType?: string
}> {}

export class UnsupportedPatchExtension extends Data.TaggedError(
  "UnsupportedPatchExtension",
)<{
  readonly path: string
  readonly extension?: string
}> {}

export class PatchUnsupportedForApp extends Data.TaggedError(
  "PatchUnsupportedForApp",
)<{
  readonly appId: string
  readonly integration: string
}> {}

export class MissingRequiredValue extends Data.TaggedError(
  "MissingRequiredValue",
)<{
  readonly field: string
}> {}

export class UnresolvedPlaceholder extends Data.TaggedError(
  "UnresolvedPlaceholder",
)<{
  readonly placeholder: string
}> {}

export class DisallowedCommand extends Data.TaggedError("DisallowedCommand")<{
  readonly command: string
}> {}

export type ResolutionError =
  | GameNotFound
  | UserNotFound
  | PresetNotFound
  | LauncherUnresolvable
  | CoreNotConfigured
  | AppNotFound
  | CustomAppMissingCommand
  | ModuleNotFound
  | ModulePathMissing
  | IncompatibleModule
  | AppMaterializationFailed
  | PatchFileMissing
  | PatchFileUnreadable
  | PatchFileNotRegular
  | UnsupportedPatchExtension
  | PatchUnsupportedForApp

export type CompositionError =
  | MissingRequiredValue
  | UnresolvedPlaceholder
  | DisallowedCommand

export type CascadeError = ResolutionError | CompositionError

const simpleCascadeErrorMessages: Readonly<Record<string, string>> = {
  GameNotFound: "GameNotFound",
  LauncherUnresolvable: "missing launcher profile for game",
  CoreNotConfigured: "missing required core for game",
  PresetNotFound: "unknown preset for game",
  UserNotFound: "unknown user",
  MissingRequiredValue: "launch template references missing value",
  UnresolvedPlaceholder:
    "launch template references an unsupported placeholder",
  DisallowedCommand: "launch command not allowed",
}

export function cascadeErrorMessage(error: unknown): string {
  if (!isTaggedErrorLike(error)) {
    return error instanceof Error ? error.message : String(error)
  }

  return (
    simpleCascadeErrorMessages[error._tag] ??
    patchErrorMessage(error) ??
    `cascade error: ${error._tag}`
  )
}

const isTaggedErrorLike = (
  error: unknown,
): error is { readonly _tag: string } =>
  typeof error === "object" && error !== null && "_tag" in error

const patchErrorMessage = (error: {
  readonly _tag: string
}): string | undefined => {
  switch (error._tag) {
    case "PatchFileMissing":
      return `patch file not found: ${(error as PatchFileMissing).path}`
    case "PatchFileUnreadable":
      return withOptionalDetail(
        `patch file is not readable: ${(error as PatchFileUnreadable).path}`,
        (error as PatchFileUnreadable).reason,
      )
    case "PatchFileNotRegular":
      return withOptionalDetail(
        `patch file is not a regular file: ${(error as PatchFileNotRegular).path}`,
        (error as PatchFileNotRegular).fileType,
      )
    case "UnsupportedPatchExtension":
      return unsupportedPatchExtensionMessage(
        error as UnsupportedPatchExtension,
      )
    case "PatchUnsupportedForApp":
      return patchUnsupportedForAppMessage(error as PatchUnsupportedForApp)
    default:
      return undefined
  }
}

const unsupportedPatchExtensionMessage = (
  error: UnsupportedPatchExtension,
): string => {
  const extension = error.extension ?? patchExtensionForPath(error.path)
  const extensionLabel = extension ?? "<none>"
  return `unsupported patch extension ${extensionLabel} for ${error.path}; supported patch extensions are ${SUPPORTED_PATCH_EXTENSIONS.join(", ")}`
}

const patchUnsupportedForAppMessage = (error: PatchUnsupportedForApp): string =>
  `patches are not supported for app ${error.appId} (${error.integration})`

const withOptionalDetail = (
  message: string,
  detail: string | undefined,
): string => (detail && detail.length > 0 ? `${message} (${detail})` : message)
