export type DesktopProfile = "default" | "device"

export interface DesktopServerAddress {
  host: string
  port: number
}

export interface DesktopWindowOptions {
  title: string
  url: string
  frame: {
    x: number
    y: number
    width: number
    height: number
  }
  titleBarStyle: "default" | "hidden" | "hiddenInset"
  preload?: string
}

export interface DesktopDualScreenWindowOptions {
  primary: DesktopWindowOptions
  companion: DesktopWindowOptions
}

export function buildDesktopUrl(
  address: DesktopServerAddress,
  path = "/",
): string {
  if (!Number.isInteger(address.port) || address.port <= 0) {
    throw new Error("Desktop server port must be a positive integer")
  }

  return new URL(path, `http://${address.host}:${address.port}/`).toString()
}

export function desktopProfileFromEnv(
  value = process.env.KORRI_DESKTOP_PROFILE,
): DesktopProfile {
  return value === "device" ? "device" : "default"
}

export function createDesktopWindowOptions(
  address: DesktopServerAddress,
  profile: DesktopProfile = "default",
  options: { readonly preload?: string } = {},
): DesktopWindowOptions {
  const preload = options.preload
  if (profile === "device") {
    return {
      title: "Korri",
      url: buildDesktopUrl(address),
      frame: {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      },
      titleBarStyle: "hidden",
      preload,
    }
  }

  return {
    title: "Korri",
    url: buildDesktopUrl(address),
    frame: {
      x: 120,
      y: 80,
      width: 1280,
      height: 800,
    },
    titleBarStyle: "default",
    preload,
  }
}

export function createDesktopDualScreenWindowOptions(
  address: DesktopServerAddress,
  options: { readonly preload?: string } = {},
): DesktopDualScreenWindowOptions {
  const preload = options.preload
  return {
    primary: {
      title: "Korri Primary",
      url: buildDesktopUrl(address, "/screen?role=primary"),
      frame: {
        x: 120,
        y: 80,
        width: 1280,
        height: 720,
      },
      titleBarStyle: "default",
      preload,
    },
    companion: {
      title: "Korri Companion",
      url: buildDesktopUrl(address, "/screen?role=companion"),
      frame: {
        x: 160,
        y: 840,
        width: 800,
        height: 700,
      },
      titleBarStyle: "default",
      preload,
    },
  }
}
