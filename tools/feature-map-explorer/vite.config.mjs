import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const apiProxyTarget =
  process.env.KORRI_FEATURE_MAP_API_PROXY ?? "http://localhost:4318"

export default defineConfig({
  root: new URL("./", import.meta.url).pathname,
  publicDir: false,
  plugins: [react(), tailwindcss()],
  server: {
    port: 4317,
    host: "localhost",
    strictPort: false,
    proxy: {
      "/api": { target: apiProxyTarget, changeOrigin: true },
    },
    watch: {
      ignored: ["**/out/**", "**/node_modules/**", "**/.git/**"],
    },
  },
  build: {
    outDir: new URL("../../out/build/feature-map-explorer", import.meta.url)
      .pathname,
    emptyOutDir: true,
    target: "es2022",
  },
})
