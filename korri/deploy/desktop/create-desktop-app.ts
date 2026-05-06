import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { honoApp } from "@app/api/hono-app"
import { logger } from "@shared/logger"
import { Hono } from "hono"
import { serveStaticAsset } from "./static-assets"

export interface CreateDesktopAppOptions {
  assetRoot: string
  nativeInputActive?: () => boolean | Promise<boolean>
}

export function createDesktopApp(options: CreateDesktopAppOptions) {
  const app = new Hono()

  app.post("/__korri/native-input-diagnostic", async c => {
    const body = await c.req.json().catch(() => ({}))
    logger.info(body, "desktop native input diagnostic")
    return c.text("ok")
  })

  app.get("/__korri/native-input-active", async c => {
    const isActive = options.nativeInputActive ?? isCurrentProcessFocusedInSway
    return c.json({ active: await isActive() })
  })

  app.all("/api", c => honoApp.fetch(c.req.raw))
  app.all("/api/*", c => honoApp.fetch(c.req.raw))
  app.get("*", c => serveStaticAsset(c.req.raw, options))

  return app
}

async function isCurrentProcessFocusedInSway(): Promise<boolean> {
  try {
    const tree = await readSwayTree()
    const focused = findFocusedSwayNode(tree)
    return focused?.pid === process.pid
  } catch (error) {
    logger.warn({ err: error }, "desktop native input activity check failed")
    return false
  }
}

async function readSwayTree(): Promise<unknown> {
  const runtimeDir = process.env.XDG_RUNTIME_DIR ?? "/var/run/0-runtime-dir"
  const swaySock = process.env.SWAYSOCK ?? (await findSwaySocket(runtimeDir))
  const proc = Bun.spawn(["swaymsg", "-t", "get_tree"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, XDG_RUNTIME_DIR: runtimeDir, SWAYSOCK: swaySock },
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) throw new Error(stderr || `swaymsg exited ${exitCode}`)
  return JSON.parse(stdout)
}

async function findSwaySocket(runtimeDir: string): Promise<string> {
  const entries = await readdir(runtimeDir)
  const socket = entries.find(
    entry => entry.startsWith("sway-ipc.") && entry.endsWith(".sock"),
  )
  if (!socket) throw new Error(`no sway IPC socket in ${runtimeDir}`)
  return join(runtimeDir, socket)
}

type SwayNode = {
  readonly focused?: unknown
  readonly pid?: unknown
  readonly nodes?: readonly unknown[]
  readonly floating_nodes?: readonly unknown[]
}

function findFocusedSwayNode(node: unknown): SwayNode | undefined {
  if (!isSwayNode(node)) return undefined
  if (node.focused === true) return node

  for (const child of [...(node.nodes ?? []), ...(node.floating_nodes ?? [])]) {
    const focused = findFocusedSwayNode(child)
    if (focused) return focused
  }

  return undefined
}

function isSwayNode(node: unknown): node is SwayNode {
  return typeof node === "object" && node !== null
}
