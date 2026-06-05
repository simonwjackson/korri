/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Adapts the shared game fixtures into a tiny read-only view model the
 * three pico home-screen variants render against. Real theme would read
 * the live library bridge; here we want fixed density to judge layout at
 * 640x480.
 */
import { games } from "@platform/fixtures/games/games"

export interface PicoGame {
  readonly id: string
  readonly title: string
  readonly genre: string
  readonly developer: string
  readonly favorite: boolean
  readonly lastPlayedAt: number | null
  readonly lastPlayedLabel: string | null
  readonly playtimeLabel: string | null
}

function relativeLabel(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function playtimeLabel(minutes: number | undefined): string | null {
  if (!minutes) return null
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

export const picoGames: readonly PicoGame[] = games.map(game => {
  const lastPlayed = game.userData?.lastPlayed
  return {
    id: game.id,
    title: game.metadata?.name ?? game.id,
    genre: game.metadata?.genre?.[0] ?? "GAME",
    developer: game.metadata?.developer ?? "UNKNOWN",
    favorite: game.userData?.favorite ?? false,
    lastPlayedAt: lastPlayed ? lastPlayed.getTime() : null,
    lastPlayedLabel: lastPlayed ? relativeLabel(lastPlayed) : null,
    playtimeLabel: playtimeLabel(game.userData?.playtime),
  }
})

/** Continue-playing rail: recently played, most-recent first. */
export const picoRecent: readonly PicoGame[] = [...picoGames]
  .filter(game => game.lastPlayedAt !== null)
  .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
