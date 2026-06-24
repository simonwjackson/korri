import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const repoRoot = new URL("../../../", import.meta.url).pathname

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

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  publicDir: false,
  plugins: [react(), tailwindcss()],
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
