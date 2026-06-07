import {
  asPlayableLibraryEntry,
  type PlayableLibraryInput,
} from "@platform/library/playable-library"

export function getPlayableDisplayName(game: PlayableLibraryInput): string {
  const playable = asPlayableLibraryEntry(game)
  return playable.title ?? playable.metadata?.name ?? playable.id
}

export function getPlayableImageUrl(
  game: PlayableLibraryInput,
): string | undefined {
  const playable = asPlayableLibraryEntry(game)
  const images = playable.media?.filter(media => media.type === "image") ?? []
  return (
    images.find(media => media.role === "tile")?.url ??
    images.find(media => media.role === "poster")?.url ??
    images[0]?.url
  )
}

export function getPlayableWideImageUrl(
  game: PlayableLibraryInput,
): string | undefined {
  const playable = asPlayableLibraryEntry(game)
  const images = playable.media?.filter(media => media.type === "image") ?? []
  return (
    images.find(media => media.role === "banner")?.url ??
    images.find(media => media.role === "hero")?.url ??
    images.find(media => media.role === "tile")?.url ??
    images[0]?.url
  )
}
