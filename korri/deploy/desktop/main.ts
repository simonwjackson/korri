import { join } from "node:path"
import { logger } from "@shared/logger"
import { ApplicationMenu, BrowserWindow, PATHS } from "electrobun/bun"
import { createDesktopApp } from "./create-desktop-app"
import { createDesktopWindowOptions } from "./window-options"

const DESKTOP_HOST = "127.0.0.1"
const assetRoot = join(PATHS.VIEWS_FOLDER, "mainview")

let server: ReturnType<typeof Bun.serve> | null = null
let mainWindow: BrowserWindow | null = null

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

  const windowOptions = createDesktopWindowOptions({
    host: DESKTOP_HOST,
    port,
  })

  mainWindow = new BrowserWindow(windowOptions)

  logger.info(
    {
      url: windowOptions.url,
      assetRoot,
      windowTitle: mainWindow.title,
    },
    "Korri desktop app started",
  )
}

main().catch(error => {
  logger.error({ err: error }, "Failed to start Korri desktop app")
  stopDesktopServer()
  process.exit(1)
})
