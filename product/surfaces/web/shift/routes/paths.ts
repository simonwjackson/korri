export const SHIFT_COMPANION_PATH = "/companion"
export const SHIFT_LIBRARY_PATH = "/library"
export const SHIFT_STORE_PATH = "/store"
export const SHIFT_STORE_DETAIL_PATH = "/store/$entryId"

export function shiftStoreEntryIdToRouteToken(entryId: string): string {
  const bytes = new TextEncoder().encode(entryId)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

export function shiftStoreEntryIdFromRouteToken(
  token: string,
): string | undefined {
  try {
    const base64 = token.replaceAll("-", "+").replaceAll("_", "/")
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new TextDecoder().decode(bytes)
  } catch {
    return undefined
  }
}
