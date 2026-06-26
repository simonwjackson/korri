export type BoxbusterArtMode = "external" | "offline"

let currentArtMode: BoxbusterArtMode = "external"

export function setBoxbusterArtMode(mode: BoxbusterArtMode): () => void {
  const previous = currentArtMode
  currentArtMode = mode
  return () => {
    currentArtMode = previous
  }
}

export function boxbusterArtMode(): BoxbusterArtMode {
  return currentArtMode
}

export function boxbusterOfflineArt(): boolean {
  return currentArtMode === "offline"
}
