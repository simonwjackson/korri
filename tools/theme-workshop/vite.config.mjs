// theme-workshop — minimal Vite config for the standalone dev viewer.
// No router, no proxy, no API; just React + the @product/@platform/@tools
// aliases the theme configs need to reach shared fixtures and the kit.
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const repoRoot = new URL("../../", import.meta.url).pathname

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  publicDir: false,
  plugins: [react()],
  // Dev-only tool: bind all interfaces and accept any Host header so the viewer
  // is reachable from any remote machine via any hostname (Vite 6 otherwise
  // rejects unknown Host headers). The `just dev-theme-workshop` recipe also
  // passes --host 0.0.0.0; this makes the behaviour explicit + config-driven.
  server: {
    host: true,
    allowedHosts: true,
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
