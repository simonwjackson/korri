// Fetches real gameplay screenshots from the Steam store API through the dev
// proxy (see vite.config.ts). Same-origin so the canvas stays untainted.

const API = "/steam/api"
const CDN_RE = /^https?:\/\/[a-z0-9.]*steamstatic\.com/

const proxied = (url: string) => url.replace(CDN_RE, "/steam/cdn")

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = rej
    im.src = src
  })
}

/** First `count` screenshots for a Steam appid, as loaded images. */
export async function fetchSteamScreenshots(
  appid: number,
  count = 3,
): Promise<HTMLImageElement[]> {
  try {
    const r = await fetch(`${API}/appdetails?appids=${appid}&l=english`)
    if (!r.ok) return []
    const j = await r.json()
    const shots: { path_thumbnail?: string }[] =
      j?.[appid]?.data?.screenshots ?? []
    const urls = shots
      .slice(0, count)
      .map(s => s.path_thumbnail)
      .filter((u): u is string => !!u)
      .map(proxied)
    return Promise.all(urls.map(loadImage))
  } catch {
    return []
  }
}

// Half-Life 2 — a single source of three screenshots, reused on every back for
// now (good enough placeholder; per-game screenshots are a later step).
export const SCREENSHOT_APPID = 220
