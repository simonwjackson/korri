/** Device facts and the narrow settings Korri can honestly change today. */
import type {
  SurfaceSettingGroup,
  SurfaceSettingItem,
} from "@contracts/surface/korri-surface"
import type {
  BackgroundNoticeResult,
  StorageAccessResult,
  StreamHost,
  SystemInfoResult,
} from "@contracts/bridge/korri-native-bridge"
import type { SettingsSnapshot } from "@contracts/generated/korrid"

export interface DeviceFacts {
  readonly version?: string
  readonly settings?: SettingsSnapshot
  readonly storage?: StorageAccessResult
  readonly notice?: BackgroundNoticeResult
  readonly hosts?: readonly StreamHost[]
  readonly systemInfo?: SystemInfoResult
  readonly localGameCount?: number
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
