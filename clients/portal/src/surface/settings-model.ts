/**
 * Device facts, grouped for a surface to read.
 *
 * Read-only by construction: every value here is something Korri already knows
 * because it asked the shell or korrid a question it can answer. Korri has
 * never written the user's configuration, so nothing in this file offers a way
 * to change anything — the screen states what is true and stops there.
 *
 * A group with nothing to say is omitted entirely rather than rendered empty,
 * so the surface never has to decide how to draw a heading over nothing.
 */
import type {
  SurfaceSettingGroup,
  SurfaceSettingItem,
} from "@contracts/surface/korri-surface"
import type { StreamHost } from "@contracts/bridge/korri-native-bridge"
import type {
  BackgroundNoticeResult,
  StorageAccessResult,
} from "@contracts/bridge/korri-native-bridge"

/** Everything the portal has learned about the device itself, as opposed to
 * the things it can play. Every field is optional: a source that failed or has
 * not answered yet simply contributes no row. */
export interface DeviceFacts {
  /** korrid's reported version, from `system.health`. */
  readonly version?: string
  readonly storage?: StorageAccessResult
  readonly notice?: BackgroundNoticeResult
  readonly hosts?: readonly StreamHost[]
  /** Games declared for this device in `library.yaml`. */
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

/** Drop groups whose items all resolved to nothing. */
const group = (
  title: string,
  items: readonly (SurfaceSettingItem | undefined)[],
): SurfaceSettingGroup | undefined => {
  const present = items.filter((item): item is SurfaceSettingItem =>
    Boolean(item),
  )
  return present.length > 0 ? { title, items: present } : undefined
}

export function settingsFrom(facts: DeviceFacts): readonly SurfaceSettingGroup[] {
  const paired = facts.hosts?.filter(host => host.paired) ?? []

  const groups = [
    group("Device", [
      facts.version === undefined
        ? undefined
        : { id: "software", label: "Software", value: facts.version },
    ]),
    group("Games", [
      facts.localGameCount === undefined
        ? undefined
        : {
            id: "local-games",
            label: "On this device",
            value: countLabel(facts.localGameCount, "game"),
            // Names the reason an empty library is empty, since Korri does not
            // scan yet and nothing else on screen would say so.
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
    ]),
    group("Permissions", [
      facts.storage === undefined
        ? undefined
        : {
            id: "file-access",
            label: "File access",
            value: storageValue(facts.storage),
            description: "Korri reads its configuration from shared storage",
          },
      facts.notice === undefined
        ? undefined
        : {
            id: "background-notice",
            label: "Background notice",
            value: facts.notice._tag === "Visible" ? "Visible" : "Hidden",
            description: "Shows that Korri is still running behind a game",
          },
    ]),
  ]

  return groups.filter((entry): entry is SurfaceSettingGroup => Boolean(entry))
}
