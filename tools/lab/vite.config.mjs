import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineCaliperViteConfig } from "@simonwjackson/caliper/vite"
import tailwindcss from "@tailwindcss/vite"

const labDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(labDir, "../..")

// The Caliper package is a git dependency living under node_modules; its
// vendored font files sit outside Vite's default fs.allow, so resolve its real
// path and allow it (mirrors Pyxis's consumer config).
let caliperPkgDir
try {
  caliperPkgDir = fs.realpathSync(
    path.join(repoRoot, "node_modules/@simonwjackson/caliper"),
  )
} catch {
  caliperPkgDir = path.resolve(repoRoot, "../caliper")
}

// boxbuster loads SteamGridDB/Steam cover art. Proxy those APIs so images stay
// same-origin (an untainted WebGL canvas) and the SGDB key stays server-side.
// This is the one art proxy carried over from the old theme-workshop lab.
// Override the key via SGDB_KEY.
const sgdbKey = process.env.SGDB_KEY ?? "889b260d509badc58844dd8c9b2e4eff"
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

const config = defineCaliperViteConfig({
  repoRoot,
  aliases: {
    "@product": path.resolve(repoRoot, "product"),
    "@platform": path.resolve(repoRoot, "product/platform"),
    "@tools": path.resolve(repoRoot, "tools"),
  },
  server: {
    port: 3130,
    allowedHosts: true,
    proxy: artProxy,
    watch: {
      ignored: ["**/.direnv/**"],
    },
  },
})

export default {
  ...config,
  root: labDir,
  server: {
    ...(config.server ?? {}),
    fs: {
      allow: [repoRoot, caliperPkgDir],
    },
  },
  // Pre-bundle the shared React/Effect/router stack so first-loading a surface's
  // parts does not trigger a mid-session dep re-optimization + reload (which
  // briefly leaves React's dispatcher null and crashes a fresh part preview).
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "effect",
      "@effect/atom-react",
      "@tanstack/react-router",
      "lucide-react",
    ],
  },
  plugins: [...(config.plugins ?? []), tailwindcss()],
}
