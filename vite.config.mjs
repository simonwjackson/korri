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
      "/api": { target: apiProxyTarget, changeOrigin: true },
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
      "@app": new URL("./korri/products/app", import.meta.url).pathname,
      "@shared": new URL("./korri/shared", import.meta.url).pathname,
      "@korri": new URL("./korri", import.meta.url).pathname,
      "@product": new URL("./product", import.meta.url).pathname,
      "@platform": new URL("./product/platform", import.meta.url).pathname,
    },
  },
  optimizeDeps: {
    include: ["effect", "@tanstack/react-router", "react", "react-dom"],
  },
})
