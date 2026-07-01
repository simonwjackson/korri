import { mkdir, readFile, writeFile } from "node:fs/promises"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const repoRoot = new URL("../../../", import.meta.url).pathname
const surfaceStateDir = new URL("../.state/surfaces/", import.meta.url)

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
        const file = new URL(`${surfaceId}.json`, surfaceStateDir)

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
          await mkdir(surfaceStateDir, { recursive: true })
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

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  publicDir: false,
  plugins: [react(), tailwindcss(), labSurfaceStatePlugin()],
  server: { host: true, allowedHosts: true, proxy: artProxy },
  preview: { host: true, allowedHosts: true, proxy: artProxy },
  resolve: {
    alias: {
      "@product": `${repoRoot}product`,
      "@platform": `${repoRoot}product/platform`,
      "@tools": `${repoRoot}tools`,
    },
  },
})
