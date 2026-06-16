import path from "node:path"
import { Data, Effect } from "effect"

import type { LibraryReleasePayload } from "./records/library-item"
import type { StorageRecord } from "./records/storage"

type ReleaseTarget = NonNullable<LibraryReleasePayload["target"]>
export type ReleaseTargetAtom = Exclude<ReleaseTarget, readonly unknown[]>

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

export type TargetResolutionError =
  | StorageNotFound
  | AbsoluteFileTarget
  | FileTargetEscapesStorage

export interface ResolvedReleaseTarget {
  readonly target: string
  readonly content?: {
    readonly path: string
  }
}

export interface ResolveReleaseTargetInput {
  readonly target: ReleaseTargetAtom
  readonly storage: ReadonlyMap<string, StorageRecord>
}

const isFileTarget = (
  target: ReleaseTargetAtom,
): target is Extract<ReleaseTargetAtom, { readonly kind: "file" }> =>
  typeof target === "object" && target !== null && target.kind === "file"

const isUriTarget = (
  target: ReleaseTargetAtom,
): target is Extract<ReleaseTargetAtom, { readonly kind: "uri" }> =>
  typeof target === "object" && target !== null && target.kind === "uri"

export const resolveReleaseTarget = (
  input: ResolveReleaseTargetInput,
): Effect.Effect<ResolvedReleaseTarget, TargetResolutionError> =>
  Effect.gen(function* () {
    if (typeof input.target === "string") {
      return { target: input.target }
    }

    if (isUriTarget(input.target)) {
      return { target: input.target.value }
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

    return { target: String(input.target) }
  })
