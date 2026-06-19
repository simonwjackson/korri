import tailwindcss from "@tailwindcss/vite"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import appRouterConfig from "./product/apps/portal/tsr.config.ts"

const apiProxyTarget =
  process.env.KORRI_API_PROXY_TARGET ?? "http://localhost:3001"

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
    include: ["effect", "@tanstack/react-router", "react", "react-dom"],
  },
})
