/**
 * A host made of nothing.
 *
 * Shift must be developable and testable without Korri running, so this
 * implements the whole treaty in memory and records what was asked for. If
 * Shift ever needs something this cannot provide, that is the signal the treaty
 * — not the fixture — has to change.
 */
import type {
  SurfaceAction,
  SurfaceHost,
  SurfaceInputAction,
  SurfaceModel,
} from "@contracts/surface/korri-surface"

export interface FixtureHost extends SurfaceHost {
  /** Every command the surface issued, in order. */
  readonly calls: readonly string[]
  /** Deliver a semantic action as the real host's input system would. */
  press(action: SurfaceInputAction): void
}

export function createFixtureHost(
  gameActions: Readonly<Record<string, readonly SurfaceAction[]>> = {},
): FixtureHost {
  const calls: string[] = []
  const listeners = new Map<SurfaceInputAction, Set<() => void>>()

  return {
    calls,
    press(action) {
      for (const listener of [...(listeners.get(action) ?? [])]) listener()
    },
    input: {
      on(action, handler) {
        const set = listeners.get(action) ?? new Set()
        set.add(handler)
        listeners.set(action, set)
        return () => set.delete(handler)
      },
    },
    launchGame(gameId) {
      calls.push(`launch:${gameId}`)
    },
    runAction(actionId) {
      calls.push(`action:${actionId}`)
    },
    gameActions(gameId) {
      return gameActions[gameId] ?? []
    },
    runGameAction(gameId, actionId) {
      calls.push(`game-action:${gameId}:${actionId}`)
    },
    retry() {
      calls.push("retry")
    },
    dismiss() {
      calls.push("dismiss")
    },
    reload() {
      calls.push("reload")
    },
  }
}

/** A small, honest catalog: no art, mixed provenance, one resumable session. */
export const fixtureModel: SurfaceModel = {
  catalog: {
    _tag: "Ready",
    games: [
      {
        id: "now-playing:L1",
        title: "Skate 3",
        section: "Continue",
        subtitle: "aka",
        resumable: true,
      },
      {
        id: "local-game:wl4",
        title: "Wario Land 4",
        section: "This device",
        subtitle: "GBA",
      },
      {
        id: "game:zao:neverball",
        title: "Neverball",
        section: "zao",
        subtitle: "zao",
      },
    ],
  },
  status: { _tag: "Browsing" },
  clockLabel: "4:24 PM",
  actions: [
    {
      id: "pairing",
      label: "Pair a device",
      description: "Connect another device to stream from or play on.",
      enabled: true,
    },
  ],
  settings: [
    {
      title: "Device",
      items: [{ id: "software", label: "Software", value: "korrid 0.4.1" }],
    },
    {
      title: "Games",
      items: [
        {
          id: "local-games",
          label: "On this device",
          value: "1 game",
          description: "Declared in library.yaml",
        },
      ],
    },
    {
      title: "Permissions",
      items: [
        {
          id: "file-access",
          label: "File access",
          value: "Granted",
          description: "Korri reads its configuration from shared storage",
        },
      ],
    },
  ],
}
