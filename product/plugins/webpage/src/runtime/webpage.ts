// Webpage core: launch a web page fullscreen in kiosk Chromium and hand back a
// CDP connection. No canvas/game assumptions — this just renders the page.
// @korri:web-canvas composes this and layers canvas presentation on top.

import { createServer } from "node:net"
import { composeWebChromiumArgs } from "../core/chromium-args"
import type { WebpageSettings } from "../core/settings"
import { type CdpClient, connectCdp } from "./cdp"

const allocatedCdpPorts = new Set<number>()

const CHROMIUM =
  process.env.KORRI_WEBPAGE_CHROMIUM ??
  process.env.KORRI_WEB_RUNTIME_CHROMIUM ??
  "chromium"

const PERSIST_ROOT =
  process.env.KORRI_WEBPAGE_PROFILE_ROOT ?? "/var/lib/korri/webpage"

export interface WebpageLaunch {
  readonly proc: Bun.Subprocess
  readonly cdp: CdpClient
  readonly port: number
}

export interface LaunchWebpageOptions {
  readonly settings?: WebpageSettings
  // Composition seam: callers (e.g. web-canvas) may add launch-time chromium
  // flags such as a default background color. Bare webpage adds none.
  readonly extraFlags?: readonly string[]
  // Scripts that must exist before the target document's own scripts execute.
  // When provided, Chromium starts on about:blank, registers these scripts over
  // CDP, then navigates to the requested URL.
  readonly preNavigationScripts?: readonly string[]
  // A stable id for the persistent profile dir when settings.saves === "persist".
  readonly saveId?: string
}

export async function allocateCdpPort(): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = createServer()
    const port = await new Promise<number>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => {
        const address = server.address()
        if (!address || typeof address === "string")
          reject(new Error("no port"))
        else resolve(address.port)
      })
    })
    await new Promise<void>(resolve => server.close(() => resolve()))
    if (port !== 9222 && !allocatedCdpPorts.has(port)) {
      allocatedCdpPorts.add(port)
      return port
    }
  }
  throw new Error("unable to allocate CDP port")
}

export async function terminateSpawnedChromium(
  proc: Bun.Subprocess,
  timeoutMs = 2000,
): Promise<void> {
  proc.kill("SIGTERM")
  const exited = await Promise.race([
    proc.exited.then(() => true),
    Bun.sleep(timeoutMs).then(() => false),
  ])
  if (!exited) {
    proc.kill("SIGKILL")
    await proc.exited
  }
}

function spawnEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined) env[k] = v
  // The nixpkgs chromium wrapper forces a wayland hint when set; we set the
  // platform explicitly, so strip it to avoid conflicting flags.
  delete env.NIXOS_OZONE_WL
  return env
}

export async function launchWebpage(
  url: string,
  options: LaunchWebpageOptions = {},
): Promise<WebpageLaunch> {
  const settings = options.settings ?? {}
  const port = await allocateCdpPort()
  const profileDir =
    settings.saves === "persist"
      ? `${PERSIST_ROOT}/${options.saveId ?? "default"}`
      : `/tmp/korri-webpage-${process.pid}`

  const extraFlags: string[] = [...(options.extraFlags ?? [])]
  if (settings.audio === "muted") extraFlags.push("--mute-audio")
  if (settings.userAgent) extraFlags.push(`--user-agent=${settings.userAgent}`)

  const launchLocator =
    options.preNavigationScripts && options.preNavigationScripts.length > 0
      ? "about:blank"
      : url

  const args = [
    ...composeWebChromiumArgs({
      locator: launchLocator,
      autoplay: settings.audio === "gesture" ? "default" : "no-gesture",
      extraFlags,
      ozonePlatform: "wayland",
    }),
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
  ]

  // Pin a world-accessible cwd: posix_spawn resolves the inherited cwd, and a
  // private one (e.g. another user's home) makes the spawn fail with EACCES.
  const proc = Bun.spawn([CHROMIUM, ...args], {
    env: spawnEnv(),
    cwd: "/tmp",
    stdout: "inherit",
    stderr: "inherit",
  })

  let cdp: CdpClient | undefined
  try {
    cdp = await connectCdp(port)
    if (
      options.preNavigationScripts &&
      options.preNavigationScripts.length > 0
    ) {
      for (const source of options.preNavigationScripts) {
        await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source })
      }
      await cdp.send("Page.navigate", { url })
    }
    return { proc, cdp, port }
  } catch (error) {
    cdp?.close()
    await terminateSpawnedChromium(proc)
    throw error
  }
}
