import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const repoRootUrl = new URL("../../../", import.meta.url)
const repoRoot = repoRootUrl.pathname
const surfaceStateRoot = new URL(".lab/", repoRootUrl)

// Same server-side key injection as the portal + theme-workshop, so surfaces
// that load SteamGridDB/Steam art (e.g. boxbuster) work when hosted in the lab.
// Override via local.env.
const sgdbKey = process.env.SGDB_KEY ?? "889b260d509badc58844dd8c9b2e4eff"

// External cover-art / screenshot APIs proxied so images stay same-origin (an
// untainted WebGL canvas) and the SGDB key stays server-side. Kept in parity
// with tools/theme-workshop/vite.config.mjs.
const artProxy = {
  "/sgdb/api": {
    target: "https://www.steamgriddb.com",
    changeOrigin: true,
    rewrite: p => p.replace(/^\/sgdb\/api/, "/api/v2"),
    configure: proxy => {
      proxy.on("proxyReq", proxyReq => {
        proxyReq.setHeader("Authorization", `Bearer ${sgdbKey}`)
      })
    },
  },
  "/sgdb/cdn": {
    target: "https://cdn2.steamgriddb.com",
    changeOrigin: true,
    rewrite: p => p.replace(/^\/sgdb\/cdn/, ""),
  },
  "/steam/api": {
    target: "https://store.steampowered.com",
    changeOrigin: true,
    rewrite: p => p.replace(/^\/steam\/api/, "/api"),
  },
  "/steam/cdn": {
    target: "https://shared.akamai.steamstatic.com",
    changeOrigin: true,
    rewrite: p => p.replace(/^\/steam\/cdn/, ""),
  },
}

function labSurfaceStatePlugin() {
  return {
    name: "korri-lab-surface-state",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost")
        const match = url.pathname.match(
          /^\/__lab\/surface-state\/([a-z0-9-]+)$/,
        )
        if (!match) {
          next()
          return
        }

        const surfaceId = match[1]
        const file = new URL(`${surfaceId}/state.json`, surfaceStateRoot)

        if (request.method === "GET") {
          try {
            response.statusCode = 200
            response.setHeader("Content-Type", "application/json")
            response.end(await readFile(file, "utf8"))
          } catch {
            response.statusCode = 200
            response.setHeader("Content-Type", "application/json")
            response.end(
              JSON.stringify({ version: 1, promotedGeneratedTakes: [] }),
            )
          }
          return
        }

        if (request.method === "PUT") {
          const chunks = []
          for await (const chunk of request) chunks.push(chunk)
          const body = Buffer.concat(chunks).toString("utf8")
          try {
            JSON.parse(body)
          } catch {
            response.statusCode = 400
            response.end("Invalid JSON")
            return
          }
          await mkdir(new URL("./", file), { recursive: true })
          await writeFile(file, `${body.trim()}\n`, "utf8")
          response.statusCode = 204
          response.end()
          return
        }

        response.statusCode = 405
        response.end("Method not allowed")
      })
    },
  }
}

// Bridges the browser lab to the dev-only Flue AI workflow in tools/lab-ai. The
// workflow runs as a one-shot child process (no always-live service): its
// run-workflow.sh script provisions Node 22 via nix, reuses the local Pi
// ChatGPT/Codex login, and prints the result JSON to stdout (events go to
// stderr). Failures return 502 so the client falls back to canned Takes.
function labDesignTakesPlugin() {
  const runner = new URL("tools/lab-ai/scripts/run-workflow.sh", repoRootUrl)
    .pathname
  return {
    name: "korri-lab-design-takes",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost")
        const match = url.pathname.match(
          /^\/__lab\/design-takes\/([a-z0-9-]+)$/,
        )
        if (!match) {
          next()
          return
        }
        if (request.method !== "POST") {
          response.statusCode = 405
          response.end("Method not allowed")
          return
        }

        const surfaceId = match[1]
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        let body
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
        } catch {
          response.statusCode = 400
          response.end("Invalid JSON")
          return
        }

        const input = JSON.stringify({
          surfaceId,
          partId: typeof body.partId === "string" ? body.partId : surfaceId,
          prompt: typeof body.prompt === "string" ? body.prompt : "",
          count: Math.max(1, Math.min(5, Math.floor(Number(body.count) || 3))),
        })

        const child = spawn(runner, [input], {
          cwd: new URL("tools/lab-ai/", repoRootUrl).pathname,
        })
        let stdout = ""
        let stderr = ""
        child.stdout.on("data", data => {
          stdout += data
        })
        child.stderr.on("data", data => {
          stderr += data
        })
        child.on("error", cause => {
          response.statusCode = 502
          response.end(`Design-takes workflow failed to start: ${cause}`)
        })
        child.on("close", code => {
          if (code !== 0) {
            server.config.logger.warn(
              `[lab-design-takes] workflow exited ${code}: ${stderr.slice(-500)}`,
            )
            response.statusCode = 502
            response.end("Design-takes workflow failed")
            return
          }
          response.statusCode = 200
          response.setHeader("Content-Type", "application/json")
          response.end(stdout.trim())
        })
      })
    },
  }
}

// Import paths a generated part file may reference (resolved from the surface's
// ai-takes/ directory). Anything else is rejected so an AI part cannot pull in
// arbitrary modules or break the build graph.
const PART_IMPORT_ALLOWLIST = new Set([
  "react",
  "../ui/ShiftPartFrame",
  "../ui/molecules/ShiftStatusBar",
  "../ui/atoms/ShiftClock",
  "../ui/atoms/ShiftBattery",
  "../ui/atoms/ShiftNetworkIcon",
  "../ui/atoms/ShiftAvatar",
])

function isWritablePartFile(tsx) {
  if (!/export\s+default/.test(tsx)) return false
  const importRe = /import\s+[^"']*from\s+["']([^"']+)["']/g
  let match = importRe.exec(tsx)
  while (match) {
    if (!PART_IMPORT_ALLOWLIST.has(match[1])) return false
    match = importRe.exec(tsx)
  }
  return true
}

// Writes AI-authored part files that the lab discovers as new pickable parts.
// Runs the generate-design-part workflow, validates each file (create-only,
// import-allowlisted), and writes it under the surface's ai-takes/ scratch dir
// (gitignored + excluded from repo typecheck). Broken takes are skipped rather
// than written, so a bad generation cannot corrupt the tree.
function labGeneratePartsPlugin() {
  const runner = new URL("tools/lab-ai/scripts/run-workflow.sh", repoRootUrl)
    .pathname
  return {
    name: "korri-lab-generate-parts",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost")

        // GET /__lab/ai-parts/:surface lists AI part files for runtime loading.
        const listing = url.pathname.match(/^\/__lab\/ai-parts\/([a-z0-9-]+)$/)
        if (listing && request.method === "GET") {
          const listDir = new URL(
            `product/surfaces/web/${listing[1]}/ai-takes/`,
            repoRootUrl,
          )
          const parts = []
          try {
            for (const entry of await readdir(listDir)) {
              const m = entry.match(/^([a-z0-9-]+)\.molecule\.part\.tsx$/)
              if (!m) continue
              const filePath = new URL(entry, listDir).pathname
              const info = await stat(filePath)
              parts.push({
                slug: m[1],
                url: `/@fs${filePath}?t=${Math.floor(info.mtimeMs)}`,
              })
            }
          } catch {
            // No dir yet — no AI parts.
          }
          response.statusCode = 200
          response.setHeader("Content-Type", "application/json")
          response.end(JSON.stringify({ parts }))
          return
        }

        // DELETE /__lab/generate-parts/:surface/:slug removes one AI part file.
        const del = url.pathname.match(
          /^\/__lab\/generate-parts\/([a-z0-9-]+)\/([a-z0-9-]+)$/,
        )
        if (del && request.method === "DELETE") {
          const file = new URL(
            `product/surfaces/web/${del[1]}/ai-takes/${del[2]}.molecule.part.tsx`,
            repoRootUrl,
          )
          try {
            await rm(file, { force: true })
            response.statusCode = 200
            response.setHeader("Content-Type", "application/json")
            response.end(JSON.stringify({ deleted: del[2] }))
          } catch (cause) {
            response.statusCode = 500
            response.end(String(cause))
          }
          return
        }

        const match = url.pathname.match(
          /^\/__lab\/generate-parts\/([a-z0-9-]+)$/,
        )
        if (!match) {
          next()
          return
        }
        if (request.method !== "POST") {
          response.statusCode = 405
          response.end("Method not allowed")
          return
        }

        const surfaceId = match[1]
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        let body
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
        } catch {
          response.statusCode = 400
          response.end("Invalid JSON")
          return
        }

        const input = JSON.stringify({
          surfaceId,
          partId: typeof body.partId === "string" ? body.partId : surfaceId,
          prompt: typeof body.prompt === "string" ? body.prompt : "",
          count: Math.max(1, Math.min(3, Math.floor(Number(body.count) || 1))),
        })

        const child = spawn(runner, [input], {
          cwd: new URL("tools/lab-ai/", repoRootUrl).pathname,
          env: { ...process.env, LAB_WORKFLOW: "generate-design-part" },
        })
        let stdout = ""
        let stderr = ""
        child.stdout.on("data", data => {
          stdout += data
        })
        child.stderr.on("data", data => {
          stderr += data
        })
        child.on("error", cause => {
          response.statusCode = 502
          response.end(`Generate-parts workflow failed to start: ${cause}`)
        })
        child.on("close", async code => {
          if (code !== 0) {
            server.config.logger.warn(
              `[lab-generate-parts] workflow exited ${code}: ${stderr.slice(-500)}`,
            )
            response.statusCode = 502
            response.end("Generate-parts workflow failed")
            return
          }
          let parts
          try {
            parts = JSON.parse(stdout.trim()).parts
          } catch {
            response.statusCode = 502
            response.end("Generate-parts workflow returned invalid JSON")
            return
          }

          const dir = new URL(
            `product/surfaces/web/${surfaceId}/ai-takes/`,
            repoRootUrl,
          )
          await mkdir(dir, { recursive: true })
          const written = []
          for (const part of Array.isArray(parts) ? parts : []) {
            const slug = String(part?.slug ?? "").replace(/[^a-z0-9-]/g, "")
            if (!slug || typeof part.tsx !== "string") continue
            if (!isWritablePartFile(part.tsx)) {
              server.config.logger.warn(
                `[lab-generate-parts] skipped ${slug}: failed validation`,
              )
              continue
            }
            let base = slug
            let file = new URL(`${base}.molecule.part.tsx`, dir)
            for (let n = 2; existsSync(file); n += 1) {
              base = `${slug}-${n}`
              file = new URL(`${base}.molecule.part.tsx`, dir)
            }
            await writeFile(file, `${part.tsx.trim()}\n`, "utf8")
            written.push({ name: part.name ?? base, slug: base })
          }

          // No reload: the lab loads the new parts on demand via
          // GET /__lab/ai-parts and dynamic import.
          response.statusCode = 200
          response.setHeader("Content-Type", "application/json")
          response.end(JSON.stringify({ written }))
        })
      })
    },
  }
}

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  publicDir: false,
  plugins: [
    react(),
    tailwindcss(),
    labSurfaceStatePlugin(),
    labDesignTakesPlugin(),
    labGeneratePartsPlugin(),
  ],
  // Keep the file watcher off AI-authored parts: they are written at runtime
  // and loaded on demand, so the dev server must not reload the whole app when
  // one is created or deleted.
  server: {
    host: true,
    allowedHosts: true,
    proxy: artProxy,
    watch: { ignored: ["**/ai-takes/**"] },
  },
  preview: { host: true, allowedHosts: true, proxy: artProxy },
  resolve: {
    alias: {
      "@product": `${repoRoot}product`,
      "@platform": `${repoRoot}product/platform`,
      "@tools": `${repoRoot}tools`,
    },
  },
})
