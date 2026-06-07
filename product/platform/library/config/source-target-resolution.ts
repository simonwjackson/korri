import path from "node:path"
import { Data, Effect } from "effect"

import type { SourceRecord } from "./records/source"
import type { StorageRecord } from "./records/storage"

export class SourceNotFound extends Data.TaggedError("SourceNotFound")<{
  readonly sourceId: string
}> {}

export class StorageNotFound extends Data.TaggedError("StorageNotFound")<{
  readonly storageId: string
}> {}

export class SourceStorageMissing extends Data.TaggedError(
  "SourceStorageMissing",
)<{
  readonly sourceId: string
}> {}

export class AbsoluteFileTarget extends Data.TaggedError("AbsoluteFileTarget")<{
  readonly sourceId: string
  readonly target: string
}> {}

export class FileTargetEscapesStorage extends Data.TaggedError(
  "FileTargetEscapesStorage",
)<{
  readonly sourceId: string
  readonly target: string
}> {}

export class MetadataOnlySource extends Data.TaggedError("MetadataOnlySource")<{
  readonly sourceId: string
}> {}

export type SourceTargetResolutionError =
  | SourceNotFound
  | StorageNotFound
  | SourceStorageMissing
  | AbsoluteFileTarget
  | FileTargetEscapesStorage
  | MetadataOnlySource

export interface ResolvedSourceTarget {
  readonly sourceId: string
  readonly target: string
  readonly content?: {
    readonly path: string
  }
}

export interface ResolveSourceTargetInput {
  readonly sourceId: string
  readonly target: string
  readonly sources: ReadonlyMap<string, SourceRecord>
  readonly storage: ReadonlyMap<string, StorageRecord>
}

export const resolveSourceTarget = (
  input: ResolveSourceTargetInput,
): Effect.Effect<ResolvedSourceTarget, SourceTargetResolutionError> =>
  Effect.gen(function* () {
    const source = input.sources.get(input.sourceId)
    if (source === undefined) {
      return yield* Effect.fail(
        new SourceNotFound({ sourceId: input.sourceId }),
      )
    }

    if (source.kind.includes("files")) {
      if (path.posix.isAbsolute(input.target)) {
        return yield* Effect.fail(
          new AbsoluteFileTarget({
            sourceId: input.sourceId,
            target: input.target,
          }),
        )
      }
      const normalizedTarget = path.posix.normalize(input.target)
      if (normalizedTarget === ".." || normalizedTarget.startsWith("../")) {
        return yield* Effect.fail(
          new FileTargetEscapesStorage({
            sourceId: input.sourceId,
            target: input.target,
          }),
        )
      }
      if (source.storage === undefined) {
        return yield* Effect.fail(
          new SourceStorageMissing({ sourceId: input.sourceId }),
        )
      }
      const storage = input.storage.get(source.storage)
      if (storage === undefined) {
        return yield* Effect.fail(
          new StorageNotFound({ storageId: source.storage }),
        )
      }
      return {
        sourceId: input.sourceId,
        target: input.target,
        content: { path: path.posix.join(storage.root, normalizedTarget) },
      }
    }

    if (source.kind.includes("service")) {
      return { sourceId: input.sourceId, target: input.target }
    }

    return yield* Effect.fail(
      new MetadataOnlySource({ sourceId: input.sourceId }),
    )
  })
