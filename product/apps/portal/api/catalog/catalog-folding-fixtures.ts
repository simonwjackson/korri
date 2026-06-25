import type { CatalogEntry } from "./snapshot.rpc"

export function catalogEntryFixture(options: {
  readonly id: string
  readonly title?: string
  readonly source: CatalogEntry["source"]
  readonly identity?: CatalogEntry["releases"][number]["identity"]
  readonly launchable?: boolean
}): CatalogEntry {
  const launchable = options.launchable ?? true
  return {
    id: options.id,
    itemId: options.id,
    title: options.title ?? `${options.id} title`,
    releases: [
      {
        id: "default",
        system: "snes",
        launchable,
        ...(launchable ? { launch: { use: "default" } } : {}),
        ...(options.identity ? { identity: options.identity } : {}),
      },
    ],
    launchable,
    system: "snes",
    metadata: { name: options.title ?? `${options.id} title` },
    source: options.source,
  }
}

export function hashIdentityFixture(
  seed: string,
): NonNullable<CatalogEntry["releases"][number]["identity"]> {
  return {
    kind: "hash",
    value: `sha256:${seed.repeat(64).slice(0, 64)}`,
  }
}

export function providerIdentityFixture(
  provider: string,
  ref: string,
): NonNullable<CatalogEntry["releases"][number]["identity"]> {
  return { kind: "provider", value: { provider, ref } }
}

export function localSourceFixture(): CatalogEntry["source"] {
  return { hostId: "self", controlUrl: "http://self:3001", isLocal: true }
}

export function remoteSourceFixture(hostId: string): CatalogEntry["source"] {
  return {
    hostId,
    controlUrl: `http://${hostId}:3001`,
    isLocal: false,
  }
}

export function sameHashAcrossStoragesFixture(): readonly CatalogEntry[] {
  const identity = hashIdentityFixture("a")
  return [
    catalogEntryFixture({
      id: "local/f-zero",
      source: localSourceFixture(),
      identity,
    }),
    catalogEntryFixture({
      id: "aka/f-zero",
      source: remoteSourceFixture("aka"),
      identity,
    }),
  ]
}

export function sameProviderAcrossStoragesFixture(): readonly CatalogEntry[] {
  const identity = providerIdentityFixture("@korri:steam", "1029210")
  return [
    catalogEntryFixture({
      id: "local/steam",
      source: localSourceFixture(),
      identity,
    }),
    catalogEntryFixture({
      id: "aka/steam",
      source: remoteSourceFixture("aka"),
      identity,
    }),
  ]
}

export function taglessAcrossStoragesFixture(): readonly CatalogEntry[] {
  return [
    catalogEntryFixture({ id: "local/tagless", source: localSourceFixture() }),
    catalogEntryFixture({
      id: "aka/tagless",
      source: remoteSourceFixture("aka"),
    }),
  ]
}
