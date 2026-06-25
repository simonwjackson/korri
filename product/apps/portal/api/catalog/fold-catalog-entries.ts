import type { LaunchAlternative } from "@platform/library/launch-alternative"
import type { CatalogEntry } from "./snapshot.rpc"

export type CatalogEntryAvailability =
  | "local-launchable"
  | "remote-available"
  | "remote-unreachable"

export type FoldedCatalogEntry = CatalogEntry & {
  readonly availability: CatalogEntryAvailability
}

export interface FoldCatalogEntriesInput {
  readonly entries: readonly CatalogEntry[]
  readonly presentPeerControlUrls?: ReadonlySet<string>
}

export function foldCatalogEntries(
  input: FoldCatalogEntriesInput,
): readonly FoldedCatalogEntry[] {
  if (input.entries.length === 0) return []

  const groups = groupEntriesByIdentity(input.entries)
  return groups.map(group => foldGroup(group, input.presentPeerControlUrls))
}

function groupEntriesByIdentity(
  entries: readonly CatalogEntry[],
): readonly (readonly CatalogEntry[])[] {
  const parent = entries.map((_, index) => index)
  const tagOwner = new Map<string, number>()

  entries.forEach((entry, index) => {
    const keys = identityKeys(entry)
    if (keys.length !== 1) return
    const tag = keys[0]
    const owner = tagOwner.get(tag)
    if (owner === undefined) {
      tagOwner.set(tag, index)
    } else {
      union(parent, owner, index)
    }
  })

  const groups = new Map<number, CatalogEntry[]>()
  entries.forEach((entry, index) => {
    const root = find(parent, index)
    const group = groups.get(root) ?? []
    group.push(entry)
    groups.set(root, group)
  })
  return Array.from(groups.values())
}

function identityKeys(entry: CatalogEntry): readonly string[] {
  const keys = new Set<string>()
  for (const release of entry.releases) {
    const identity = release.identity
    if (identity === undefined) continue
    if (identity.kind === "hash") {
      keys.add(`hash:${identity.value}`)
    } else {
      keys.add(`provider:${identity.value.provider}\0${identity.value.ref}`)
    }
  }
  return Array.from(keys)
}

function foldGroup(
  group: readonly CatalogEntry[],
  presentPeerControlUrls: ReadonlySet<string> | undefined,
): FoldedCatalogEntry {
  const launch = chooseLaunchRepresentative(group)
  const display = group.find(entry => entry.source.isLocal) ?? launch
  const availability = availabilityFor(group, launch, presentPeerControlUrls)
  const launchAlternatives = launchAlternativesForGroup(group, launch)

  return {
    ...display,
    id: launch.id,
    itemId: launch.itemId,
    containedId: launch.containedId,
    releases: launch.releases,
    launchable: launch.launchable,
    source: launch.source,
    availability,
    ...(launchAlternatives.length > 1 ? { launchAlternatives } : {}),
  }
}

function chooseLaunchRepresentative(
  group: readonly CatalogEntry[],
): CatalogEntry {
  const local = group.find(entry => entry.source.isLocal && entry.launchable)
  if (local !== undefined) return local

  const remote = group
    .filter(entry => !entry.source.isLocal && entry.launchable)
    .sort(compareLaunchCandidates)[0]
  return remote ?? group[0]
}

function launchAlternativesForGroup(
  group: readonly CatalogEntry[],
  launch: CatalogEntry,
): readonly LaunchAlternative[] {
  const candidates = group
    .filter(entry => entry.launchable)
    .sort(compareLaunchCandidates)
  const ordered = [
    launch,
    ...candidates.filter(candidate => !sameLaunchCandidate(candidate, launch)),
  ]
  return ordered.map(entry => ({
    id: entry.id,
    source: entry.source,
    ...(firstLaunchableReleaseId(entry) !== undefined
      ? { releaseId: firstLaunchableReleaseId(entry) }
      : {}),
  }))
}

function firstLaunchableReleaseId(entry: CatalogEntry): string | undefined {
  return entry.releases.find(release => release.launchable)?.id
}

function sameLaunchCandidate(left: CatalogEntry, right: CatalogEntry): boolean {
  return (
    left.id === right.id &&
    left.source.hostId === right.source.hostId &&
    left.source.controlUrl === right.source.controlUrl &&
    left.source.isLocal === right.source.isLocal
  )
}

function compareLaunchCandidates(
  left: CatalogEntry,
  right: CatalogEntry,
): number {
  return (
    left.source.controlUrl.localeCompare(right.source.controlUrl) ||
    left.source.hostId.localeCompare(right.source.hostId) ||
    left.id.localeCompare(right.id)
  )
}

function availabilityFor(
  group: readonly CatalogEntry[],
  launch: CatalogEntry,
  presentPeerControlUrls: ReadonlySet<string> | undefined,
): CatalogEntryAvailability {
  if (group.some(entry => entry.source.isLocal && entry.launchable)) {
    return "local-launchable"
  }
  if (
    !launch.source.isLocal &&
    launch.launchable &&
    presentPeerControlUrls?.has(launch.source.controlUrl) === true
  ) {
    return "remote-available"
  }
  return "remote-unreachable"
}

function find(parent: number[], index: number): number {
  const root = parent[index]
  if (root === index) return index
  const compressed = find(parent, root)
  parent[index] = compressed
  return compressed
}

function union(parent: number[], left: number, right: number): void {
  const leftRoot = find(parent, left)
  const rightRoot = find(parent, right)
  if (leftRoot === rightRoot) return
  parent[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot)
}
