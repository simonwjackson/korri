// theme-workshop — minimal Vite config for the standalone dev viewer.
// No router, no proxy, no API; just React + the @product/@platform/@tools
// aliases the theme configs need to reach shared fixtures and the kit.
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const repoRoot = new URL("../../", import.meta.url).pathname

// Same server-side key injection as the portal, so the boxbuster surface's
// cover art loads when previewed in the workshop. Override via local.env.
const sgdbKey = process.env.SGDB_KEY ?? "889b260d509badc58844dd8c9b2e4eff"

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  publicDir: false,
  // Tailwind is required so Tailwind-utility surfaces (e.g. Shift) render in the
  // lab exactly as they do in the portal; plain-CSS themes (pico) are unaffected.
  plugins: [react(), tailwindcss()],
  // Dev-only tool: bind all interfaces and accept any Host header so the viewer
  // is reachable from any remote machine via any hostname (Vite 6 otherwise
  // rejects unknown Host headers). The `just dev-theme-workshop` recipe also
  // passes --host 0.0.0.0; this makes the behaviour explicit + config-driven.
  server: {
    host: true,
    allowedHosts: true,
    // boxbuster surface — proxy external cover-art / screenshot APIs so images
    // stay same-origin (WebGL canvas untainted) and the SGDB key stays server-side.
    proxy: {
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
    },
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
  resolve: {
    alias: {
      "@product": `${repoRoot}product`,
      "@platform": `${repoRoot}product/platform`,
      "@tools": `${repoRoot}tools`,
    },
  },
})
