/** Device facts and the narrow settings Korri can honestly change today. */
import type {
  SurfaceSettingGroup,
  SurfaceSettingItem,
} from "@contracts/surface/korri-surface"
import type {
  BackgroundNoticeResult,
  OverlayPermissionResult,
  StorageAccessResult,
  StreamHost,
  SystemInfoResult,
} from "@contracts/bridge/korri-native-bridge"
import {
  SecretSettingStatus,
  type DiscoverySnapshot,
  type SettingsSnapshot,
} from "@contracts/generated/korrid"

export interface DeviceFacts {
  readonly version?: string
  readonly settings?: SettingsSnapshot
  readonly storage?: StorageAccessResult
  readonly notice?: BackgroundNoticeResult
  readonly overlay?: OverlayPermissionResult
  readonly hosts?: readonly StreamHost[]
  readonly systemInfo?: SystemInfoResult
  readonly localGameCount?: number
  readonly discovery?: DiscoverySnapshot
}

const storageValue = (result: StorageAccessResult): string => {
  switch (result._tag) {
    case "Granted":
      return "Granted"
    case "NotRequired":
      return "Not needed"
    case "Denied":
      return "Not granted"
    case "QueryFailed":
      return "Unknown"
  }
}

const overlayValue = (result: OverlayPermissionResult): string => {
  switch (result._tag) {
    case "Enabled":
      return "Enabled"
    case "Disabled":
      return "Disabled"
    case "RestrictedOrUnavailable":
      return "Restricted or unavailable"
  }
}

const countLabel = (count: number, noun: string): string =>
  count === 1 ? `1 ${noun}` : `${count} ${noun}s`

const group = (
  title: string,
  items: readonly (SurfaceSettingItem | undefined)[],
): SurfaceSettingGroup | undefined => {
  const present = items.filter((item): item is SurfaceSettingItem =>
    Boolean(item),
  )
  return present.length > 0 ? { title, items: present } : undefined
}

const onOff = [
  { value: "true", label: "On" },
  { value: "false", label: "Off" },
] as const

const secretStatusLabel = (status: SecretSettingStatus): string =>
  status === SecretSettingStatus.Configured ? "Configured" : "Not configured"

const discoveryStateLabel = (snapshot: DiscoverySnapshot | undefined): string => {
  if (snapshot === undefined) return "Not set up"
  switch (snapshot.state._tag) {
    case "Scanning":
      return "Scanning…"
    case "Enriching":
      return "Adding details…"
    case "Problem":
      return "Needs attention"
    case "Idle":
      return "Ready"
  }
  const exhaustive: never = snapshot.state
  return exhaustive
}

export function settingsFrom(facts: DeviceFacts): readonly SurfaceSettingGroup[] {
  const paired = facts.hosts?.filter(host => host.paired) ?? []
  const android =
    facts.systemInfo?._tag === "SystemInfo"
      ? facts.systemInfo.payload
      : undefined

  const groups = [
    group("Device", [
      facts.settings === undefined
        ? undefined
        : {
            id: "device-name",
            label: "Name",
            value: facts.settings.deviceName ?? "Unnamed",
            interaction: {
              kind: "text" as const,
              placeholder: "This device",
              maxLength: 64,
            },
          },
    ]),
    group("Metadata", [
      facts.settings === undefined
        ? undefined
        : {
            id: "steamgriddb-credential",
            label: "SteamGridDB API key",
            value: secretStatusLabel(facts.settings.steamGridDbCredential),
            description: "Used only by korrid for metadata and cover art lookup",
            interaction: {
              kind: "sensitiveText" as const,
              placeholder: "Paste API key",
              maxLength: 256,
              clearLabel: "Clear saved key",
            },
          },
    ]),
    group(
      "Plugins",
      facts.settings?.plugins.map(plugin => ({
        id: plugin.id,
        label: plugin.title,
        value: plugin.enabled ? "On" : "Off",
        interaction: { kind: "choice" as const, choices: onOff },
      })) ?? [],
    ),
    group("Games", [
      facts.localGameCount === undefined
        ? undefined
        : {
            id: "local-games",
            label: "On this device",
            value: countLabel(facts.localGameCount, "game"),
            description: "Declared in library.yaml",
          },
      facts.discovery === undefined
        ? undefined
        : {
            id: "game-discovery-status",
            label: "Folder scan",
            value: discoveryStateLabel(facts.discovery),
            description:
              facts.discovery.diagnostics[0]?.message ??
              "Games appear as soon as scanning finds them",
          },
      {
        id: "game-folder-add",
        label: "Add game folder",
        description: "Choose a folder on this Android device",
        interaction: { kind: "action" as const, actionId: "game-folder-add" },
      },
      facts.discovery === undefined
        ? undefined
        : {
            id: "game-folder-rescan",
            label: "Rescan game folders",
            value: countLabel(facts.discovery.locations.length, "folder"),
            interaction: {
              kind: "action" as const,
              actionId: "game-folder-rescan",
            },
          },
      ...(facts.discovery?.locations.map(location => ({
        id: `game-folder:${location.id}`,
        label: location.label,
        value: "Registered",
        interaction: {
          kind: "action" as const,
          actionId: `game-folder-remove:${location.id}`,
          destructive: true,
          confirmation: {
            title: "Remove game folder?",
            message:
              "Korri will remove games it added from this folder. Edited or hand-authored games stay.",
            confirmLabel: "Remove folder",
          },
        },
      })) ?? []),
    ]),
    group("Streaming", [
      facts.hosts === undefined
        ? undefined
        : {
            id: "paired-devices",
            label: "Paired devices",
            value:
              paired.length === 0
                ? "None"
                : countLabel(paired.length, "device"),
          },
      ...paired.map(host => ({
        id: `host:${host.uuid}`,
        label: host.name,
        value: "Paired",
      })),
      {
        id: "manage-pairing",
        label: "Pair or manage devices",
        description: "Opens Moonlight's secure pairing screen",
        interaction: { kind: "action" as const, actionId: "pairing" },
      },
    ]),
    group("Permissions", [
      facts.overlay === undefined
        ? undefined
        : {
            id: "gameplay-overlay",
            label: "Gameplay overlay",
            value: overlayValue(facts.overlay),
            description:
              facts.overlay._tag === "RestrictedOrUnavailable"
                ? "Android does not currently offer this grant"
                : "Managed by Android",
            interaction: {
              kind: "action" as const,
              actionId: "overlay-access",
            },
          },
      facts.storage === undefined
        ? undefined
        : {
            id: "file-access",
            label: "File access",
            value: storageValue(facts.storage),
            description: "Managed by Android",
            interaction: {
              kind: "action" as const,
              actionId: "storage-access",
            },
          },
      facts.notice === undefined
        ? undefined
        : {
            id: "background-notice",
            label: "Background notice",
            value: facts.notice._tag === "Visible" ? "Visible" : "Hidden",
            description: "Managed by Android",
            interaction: {
              kind: "action" as const,
              actionId: "background-notice",
            },
          },
    ]),
    group("System information", [
      android === undefined
        ? undefined
        : {
            id: "device-model",
            label: "Device",
            value: `${android.manufacturer} ${android.device}`,
          },
      android === undefined
        ? undefined
        : {
            id: "android-version",
            label: "Android",
            value: `${android.androidRelease} · SDK ${android.sdk}`,
          },
      android === undefined
        ? undefined
        : { id: "app-version", label: "Korri app", value: android.appVersion },
      facts.version === undefined
        ? undefined
        : { id: "korrid-version", label: "korrid", value: facts.version },
    ]),
  ]

  return groups.filter((entry): entry is SurfaceSettingGroup => Boolean(entry))
}
