import { join } from "node:path"
import { logger } from "@shared/logger"
import { ApplicationMenu, BrowserWindow, PATHS } from "electrobun/bun"
import { createDesktopApp } from "./create-desktop-app"
import { writeDesktopStatusFile } from "./status-file"
import {
  createDesktopDualScreenWindowOptions,
  createDesktopWindowOptions,
  type DesktopProfile,
  type DesktopServerAddress,
  desktopProfileFromEnv,
} from "./window-options"

const DESKTOP_HOST = "127.0.0.1"
const assetRoot = join(PATHS.VIEWS_FOLDER, "mainview")

let server: ReturnType<typeof Bun.serve> | null = null
let windows: BrowserWindow[] = []

function installApplicationMenu() {
  ApplicationMenu.setApplicationMenu([
    {
      submenu: [{ role: "quit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
  ])
}

function stopDesktopServer() {
  if (!server) {
    return
  }

  server.stop(true)
  server = null
}

function registerProcessShutdown() {
  process.on("exit", stopDesktopServer)
  process.on("SIGINT", () => {
    stopDesktopServer()
    process.exit(0)
  })
  process.on("SIGTERM", () => {
    stopDesktopServer()
    process.exit(0)
  })
}

async function main() {
  const app = createDesktopApp({ assetRoot })

  server = Bun.serve({
    hostname: DESKTOP_HOST,
    port: 0,
    fetch: app.fetch,
  })

  installApplicationMenu()
  registerProcessShutdown()

  const port = server.port
  if (!port) {
    throw new Error("Desktop server did not bind to a port")
  }

  const profile = desktopProfileFromEnv()
  const windowOptions = createDesktopWindows(
    { host: DESKTOP_HOST, port },
    profile,
  )
  windows = windowOptions.map(options => new BrowserWindow(options))

  if (process.env.KORRI_DESKTOP_STATUS_FILE) {
    await writeDesktopStatusFile({
      path: process.env.KORRI_DESKTOP_STATUS_FILE,
      url: windowOptions[0]?.url ?? `http://${DESKTOP_HOST}:${port}/`,
      pid: process.pid,
      profile,
    })
  }

  logger.info(
    {
      urls: windowOptions.map(options => options.url),
      assetRoot,
      windowTitles: windows.map(window => window.title),
      profile,
      statusFile: process.env.KORRI_DESKTOP_STATUS_FILE,
    },
    "Korri desktop app started",
  )
}

function createDesktopWindows(
  address: DesktopServerAddress,
  profile: DesktopProfile,
) {
  if (process.env.KORRI_DESKTOP_DUAL_SCREEN === "1") {
    const dual = createDesktopDualScreenWindowOptions(address)
    return [dual.primary, dual.companion]
  }

  return [createDesktopWindowOptions(address, profile)]
}

main().catch(error => {
  logger.error({ err: error }, "Failed to start Korri desktop app")
  stopDesktopServer()
  process.exit(1)
})
