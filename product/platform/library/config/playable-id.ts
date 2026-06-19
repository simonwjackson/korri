import { Schema } from "effect"

import type {
  ContainedPlayablePayload,
  LibraryItemRecord,
  LibraryReleasePayload,
} from "./records/library-item"

const ID_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9._-]*$/

export interface ParsedPlayableId {
  readonly itemId: string
  readonly containedId?: string
}

export class PlayableIdSyntaxError extends Error {
  override readonly name = "PlayableIdSyntaxError"
  readonly value: string

  constructor(value: string) {
    super(
      `playable id must be '<item-id>' or '<item-id>/<contained-id>'; received '${value}'`,
    )
    this.value = value
  }
}

const validSegment = (segment: string): boolean =>
  ID_SEGMENT_PATTERN.test(segment) && segment !== "." && segment !== ".."

const parsePlayableId = (value: string): ParsedPlayableId | undefined => {
  const parts = value.split("/")
  if (parts.length !== 1 && parts.length !== 2) return undefined
  if (!validSegment(parts[0] ?? "")) return undefined
  if (parts.length === 1) return { itemId: parts[0] ?? "" }
  if (!validSegment(parts[1] ?? "")) return undefined
  return { itemId: parts[0] ?? "", containedId: parts[1] ?? "" }
}

const parseLocalId = (value: string): string | undefined =>
  validSegment(value) ? value : undefined

export const LocalPlayableId = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(value =>
      parseLocalId(value) !== undefined
        ? undefined
        : {
            path: [],
            issue:
              "local playable ids must be lowercase path segments without slashes",
          },
    ),
  ),
)
export type LocalPlayableId = Schema.Schema.Type<typeof LocalPlayableId>

export const PlayableId = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(value =>
      parsePlayableId(value) !== undefined
        ? undefined
        : {
            path: [],
            issue:
              "playable ids must be '<item-id>' or '<item-id>/<contained-id>'",
          },
    ),
  ),
)
export type PlayableId = Schema.Schema.Type<typeof PlayableId>

export const decodePlayableId = (input: unknown): PlayableId =>
  Schema.decodeUnknownSync(PlayableId)(input)

export const decodeLocalPlayableId = (input: unknown): LocalPlayableId =>
  Schema.decodeUnknownSync(LocalPlayableId)(input)

export const splitPlayableId = (value: string): ParsedPlayableId => {
  const parsed = parsePlayableId(value)
  if (parsed === undefined) throw new PlayableIdSyntaxError(value)
  return parsed
}

export const playableIdFor = (
  itemId: string,
  containedId?: string,
): PlayableId =>
  decodePlayableId(
    containedId === undefined ? itemId : `${itemId}/${containedId}`,
  )

export interface PlayableEntry {
  readonly id: PlayableId
  readonly itemId: LocalPlayableId
  readonly containedId?: LocalPlayableId
  readonly title?: string
  readonly item: LibraryItemRecord
  readonly contained?: ContainedPlayablePayload
  readonly releases: readonly LibraryReleasePayload[]
}

export const isContainerOnly = (item: {
  readonly contains?: Readonly<Record<string, ContainedPlayablePayload>>
}): boolean => Object.keys(item.contains ?? {}).length > 0

export const listPlayableEntries = (
  items: readonly LibraryItemRecord[],
): readonly PlayableEntry[] =>
  items.flatMap(item => {
    const itemId = decodeLocalPlayableId(item.id)
    if (!isContainerOnly(item)) {
      return [
        {
          id: playableIdFor(itemId),
          itemId,
          title: item.title,
          item,
          releases: item.releases,
        },
      ]
    }

    return Object.entries(item.contains ?? {}).map(
      ([containedIdRaw, contained]) => {
        const containedId = decodeLocalPlayableId(containedIdRaw)
        return {
          id: playableIdFor(itemId, containedId),
          itemId,
          containedId,
          title: contained.title ?? item.title,
          item,
          contained,
          releases: item.releases,
        }
      },
    )
  })

export const isLaunchableRelease = (release: LibraryReleasePayload): boolean =>
  release.target !== undefined && release.launch !== undefined

export const launchableReleases = (
  releases: readonly LibraryReleasePayload[],
): readonly LibraryReleasePayload[] => releases.filter(isLaunchableRelease)

export type ReleaseSelectionResult =
  | {
      readonly _tag: "SelectedRelease"
      readonly release: LibraryReleasePayload
    }
  | {
      readonly _tag: "ReleaseNotFound"
      readonly releaseId: string
    }
  | {
      readonly _tag: "ReleaseNotLaunchable"
      readonly releaseId: string
    }
  | {
      readonly _tag: "NoLaunchableRelease"
    }
  | {
      readonly _tag: "AmbiguousRelease"
      readonly launchableReleaseIds: readonly string[]
    }

export const selectLaunchableRelease = (
  releases: readonly LibraryReleasePayload[],
  releaseId?: string,
): ReleaseSelectionResult => {
  if (releaseId !== undefined) {
    const release = releases.find(candidate => candidate.id === releaseId)
    if (release === undefined) {
      return { _tag: "ReleaseNotFound", releaseId }
    }
    if (!isLaunchableRelease(release)) {
      return { _tag: "ReleaseNotLaunchable", releaseId }
    }
    return { _tag: "SelectedRelease", release }
  }

  const launchable = launchableReleases(releases)
  if (launchable.length === 0) return { _tag: "NoLaunchableRelease" }
  if (launchable.length > 1) {
    return {
      _tag: "AmbiguousRelease",
      launchableReleaseIds: launchable.map(release => release.id),
    }
  }
  return {
    _tag: "SelectedRelease",
    release: launchable[0] as LibraryReleasePayload,
  }
}
