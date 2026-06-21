import path from "node:path"
import { Data, Effect } from "effect"

import type { LibraryReleasePayload } from "./records/library-item"
import type { StorageRecord } from "./records/storage"

type ReleaseTarget = NonNullable<LibraryReleasePayload["target"]>
export type ReleaseTargetAtom = ReleaseTarget

export class StorageNotFound extends Data.TaggedError("StorageNotFound")<{
  readonly storageId: string
}> {}

export class AbsoluteFileTarget extends Data.TaggedError("AbsoluteFileTarget")<{
  readonly storageId: string
  readonly target: string
}> {}

export class FileTargetEscapesStorage extends Data.TaggedError(
  "FileTargetEscapesStorage",
)<{
  readonly storageId: string
  readonly target: string
}> {}

export class FileSetPartNotFound extends Data.TaggedError(
  "FileSetPartNotFound",
)<{
  readonly storageId: string
  readonly part?: string
  readonly roles?: readonly string[]
}> {}

export class UnsupportedReleaseTarget extends Data.TaggedError(
  "UnsupportedReleaseTarget",
)<{
  readonly kind: string
}> {}

export type TargetResolutionError =
  | StorageNotFound
  | AbsoluteFileTarget
  | FileTargetEscapesStorage
  | FileSetPartNotFound
  | UnsupportedReleaseTarget

export interface ResolvedReleaseTarget {
  readonly target: string
  readonly content?: {
    readonly path: string
  }
}

export interface ResolveReleaseTargetInput {
  readonly target: ReleaseTargetAtom
  readonly storage: ReadonlyMap<string, StorageRecord>
  readonly input?: LibraryReleasePayload["launch"] extends infer L
    ? L extends { readonly input?: infer I }
      ? I
      : never
    : never
}

const isFileTarget = (
  target: ReleaseTargetAtom,
): target is Extract<ReleaseTargetAtom, { readonly kind: "file" }> =>
  typeof target === "object" && target !== null && target.kind === "file"

const isFileSetTarget = (
  target: ReleaseTargetAtom,
): target is Extract<ReleaseTargetAtom, { readonly kind: "file-set" }> =>
  typeof target === "object" && target !== null && target.kind === "file-set"

const isUrlTarget = (
  target: ReleaseTargetAtom,
): target is Extract<ReleaseTargetAtom, { readonly kind: "url" }> =>
  typeof target === "object" && target !== null && target.kind === "url"

const isExecutableTarget = (
  target: ReleaseTargetAtom,
): target is Extract<ReleaseTargetAtom, { readonly kind: "executable" }> =>
  typeof target === "object" && target !== null && target.kind === "executable"

const isProviderRefTarget = (
  target: ReleaseTargetAtom,
): target is Extract<ReleaseTargetAtom, { readonly kind: "provider-ref" }> =>
  typeof target === "object" &&
  target !== null &&
  target.kind === "provider-ref"

export const resolveReleaseTarget = (
  input: ResolveReleaseTargetInput,
): Effect.Effect<ResolvedReleaseTarget, TargetResolutionError> =>
  Effect.gen(function* () {
    if (isUrlTarget(input.target)) {
      return { target: input.target.value }
    }

    if (isExecutableTarget(input.target)) {
      if (path.posix.isAbsolute(input.target.path)) {
        return yield* Effect.fail(
          new AbsoluteFileTarget({
            storageId: "executable",
            target: input.target.path,
          }),
        )
      }
      const normalizedTarget = path.posix.normalize(input.target.path)
      if (normalizedTarget === ".." || normalizedTarget.startsWith("../")) {
        return yield* Effect.fail(
          new FileTargetEscapesStorage({
            storageId: "executable",
            target: input.target.path,
          }),
        )
      }
      return { target: normalizedTarget }
    }

    if (isProviderRefTarget(input.target)) {
      return { target: `${input.target.provider}:${input.target.ref}` }
    }

    if (isFileTarget(input.target)) {
      if (path.posix.isAbsolute(input.target.path)) {
        return yield* Effect.fail(
          new AbsoluteFileTarget({
            storageId: input.target.storage,
            target: input.target.path,
          }),
        )
      }
      const normalizedTarget = path.posix.normalize(input.target.path)
      if (normalizedTarget === ".." || normalizedTarget.startsWith("../")) {
        return yield* Effect.fail(
          new FileTargetEscapesStorage({
            storageId: input.target.storage,
            target: input.target.path,
          }),
        )
      }
      const storage = input.storage.get(input.target.storage)
      if (storage === undefined) {
        return yield* Effect.fail(
          new StorageNotFound({ storageId: input.target.storage }),
        )
      }
      return {
        target: input.target.path,
        content: { path: path.posix.join(storage.root, normalizedTarget) },
      }
    }

    if (isFileSetTarget(input.target)) {
      const selected = selectFileSetPart(input.target, input.input)
      if (selected === undefined) {
        return yield* Effect.fail(
          new FileSetPartNotFound({
            storageId: input.target.storage,
            ...(input.input?.part !== undefined
              ? { part: input.input.part }
              : {}),
            ...(input.input?.roles !== undefined
              ? { roles: input.input.roles }
              : {}),
          }),
        )
      }
      const root = input.target.root ?? ""
      const partPath = path.posix.join(root, selected.path)
      return yield* resolveReleaseTarget({
        target: { kind: "file", storage: input.target.storage, path: partPath },
        storage: input.storage,
      })
    }

    const exhaustive = input.target as { readonly kind?: string }
    return yield* Effect.fail(
      new UnsupportedReleaseTarget({ kind: exhaustive.kind ?? "unknown" }),
    )
  })

const selectFileSetPart = (
  target: Extract<ReleaseTargetAtom, { readonly kind: "file-set" }>,
  input: ResolveReleaseTargetInput["input"],
): (typeof target.files)[number] | undefined => {
  if (input?.part !== undefined) {
    return target.files.find(file => file.id === input.part)
  }

  if (input?.roles !== undefined && input.roles.length > 0) {
    for (const role of input.roles) {
      const byRole = target.files.find(file => file.role === role)
      if (byRole !== undefined) return byRole
    }
    return undefined
  }

  return target.files[0]
}
