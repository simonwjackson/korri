import tailwindcss from "@tailwindcss/vite"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import appRouterConfig from "./product/apps/portal/tsr.config.ts"

const apiProxyTarget =
  process.env.KORRI_API_PROXY_TARGET ?? "http://localhost:3001"

// SteamGridDB dev key for the boxbuster surface's cover-art proxy. Injected
// server-side below so it never reaches client code; override via local.env.
const sgdbKey = process.env.SGDB_KEY ?? "889b260d509badc58844dd8c9b2e4eff"

export default defineConfig({
  root: new URL("./product/apps/portal", import.meta.url).pathname,
  publicDir: false,
  plugins: [TanStackRouterVite(appRouterConfig), react(), tailwindcss()],
  server: {
    port: 3000,
    host: true,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        // The portal's own RPC-group source lives in `api/` under the Vite
        // root, so it is served at `/api/*.ts`. Let Vite serve those modules
        // instead of proxying them to the API server (which only handles
        // runtime endpoints like /api/rpc and would 404 the source).
        bypass: req =>
          /\.(ts|tsx|js|jsx|mjs)(\?|$)/.test(req.url ?? "")
            ? req.url
            : undefined,
      },
      // boxbuster surface — external cover-art / screenshot APIs proxied so
      // images stay same-origin (WebGL canvas untainted) and the SGDB key is
      // injected server-side, never shipped to the client.
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
    watch: {
      ignored: ["**/out/**", "**/node_modules/**", "**/.git/**"],
    },
  },
  build: {
    outDir: new URL("./out/build/portal", import.meta.url).pathname,
    emptyOutDir: true,
    target: "es2022",
  },
  resolve: {
    alias: {
      "@product": new URL("./product", import.meta.url).pathname,
      "@platform": new URL("./product/platform", import.meta.url).pathname,
      "@tools": new URL("./tools", import.meta.url).pathname,
    },
  },
  optimizeDeps: {
    include: [
      "effect",
      "@tanstack/react-router",
      "react",
      "react-dom",
      // boxbuster surface (product/surfaces/web/boxbuster) — pre-bundle the R3F
      // stack so the /boxbuster route doesn't trigger a mid-session
      // re-optimization (which 504s in-flight chunks) when first loaded.
      "three",
      "@react-three/fiber",
      "@react-three/drei",
    ],
  },
})
