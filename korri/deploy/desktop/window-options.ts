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
}

export function buildDesktopUrl(address: DesktopServerAddress): string {
  if (!Number.isInteger(address.port) || address.port <= 0) {
    throw new Error("Desktop server port must be a positive integer")
  }

  return `http://${address.host}:${address.port}/`
}

export function createDesktopWindowOptions(
  address: DesktopServerAddress,
): DesktopWindowOptions {
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
  }
}
