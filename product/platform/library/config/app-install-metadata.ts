import type { ProviderInstallMetadata } from "@platform/library/install-state"
import type { AppRecord } from "./records/app"
import { appRecordKind } from "./records/app"
import type { LibraryReleasePayload } from "./records/library-item"

const STEAM_PROVIDER_ID = "@korri:steam"

export function installMetadataForRelease(
  release: Pick<LibraryReleasePayload, "launch" | "target" | "system"> & {
    readonly id?: string
  },
  readableLaunchers: ReadonlyMap<string, AppRecord>,
): ProviderInstallMetadata | undefined {
  const appId = release.launch?.use ?? release.launch?.plugin
  const app = appId === undefined ? undefined : readableLaunchers.get(appId)
  const providerId = app === undefined ? release.launch?.plugin : appRecordKind(app)
  if (providerId !== STEAM_PROVIDER_ID) return undefined
  const steamAppId = steamAppIdFromTarget(release.target)
  if (!steamAppId) return undefined
  return { providerId, appId: steamAppId, canRequestInstall: true }
}

export function installMetadataAllowed(
  entries: readonly { readonly releases: readonly { readonly install?: ProviderInstallMetadata }[] }[],
  providerId: string,
  appId: string,
): boolean {
  return entries.some(entry =>
    entry.releases.some(
      release =>
        release.install?.providerId === providerId &&
        release.install.appId === appId &&
        release.install.canRequestInstall,
    ),
  )
}

function steamAppIdFromTarget(target: LibraryReleasePayload["target"]): string | undefined {
  const value = target?.kind === "url" ? target.value : undefined
  if (!value) return undefined
  const match = value.match(/^steam:\/\/(?:rungameid|run|install)\/([0-9]+)$/)
  return match?.[1]
}
