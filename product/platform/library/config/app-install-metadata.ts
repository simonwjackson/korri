import type { ProviderInstallMetadata } from "@platform/library/install-state"
import { resolveEffectiveAppChoices } from "./app-choice-selection"
import type { AppRecord } from "./records/app"
import { appRecordKind } from "./records/app"
import type { AppChoice } from "./records/app-choice"
import type { LibraryReleasePayload } from "./records/library-item"
import type { SystemRecord } from "./records/system"

const STEAM_PROVIDER_ID = "@korri:steam"

export function installMetadataForRelease(
  release: Pick<LibraryReleasePayload, "apps" | "target" | "system"> & {
    readonly id?: string
  },
  apps: ReadonlyMap<string, AppRecord>,
  systems: ReadonlyMap<string, SystemRecord> = new Map(),
): ProviderInstallMetadata | undefined {
  const choices = resolveEffectiveAppChoices(systems.get(release.system)?.apps, release.apps)
  for (const choice of choices) {
    const app = apps.get(choice.id)
    if (!app) continue
    const providerId = appRecordKind(app)
    if (providerId !== STEAM_PROVIDER_ID) continue
    const appId = steamAppIdFromTarget(release.target)
    if (!appId) continue
    return { providerId, appId, canRequestInstall: true }
  }
  return undefined
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
  const atom = Array.isArray(target) ? target[0] : target
  const value = typeof atom === "string" ? atom : atom?.kind === "uri" ? atom.value : undefined
  if (!value) return undefined
  const match = value.match(/^steam:\/\/(?:rungameid|run|install)\/([0-9]+)$/)
  return match?.[1]
}
