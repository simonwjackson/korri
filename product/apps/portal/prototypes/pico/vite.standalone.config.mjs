// PROTOTYPE — minimal Vite config for the standalone pico viewer. Throwaway.
// No router, no proxy, no API; just React + the @platform/@product aliases
// the variants need to reach the shared game fixtures.
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const repoRoot = new URL("../../../../../", import.meta.url).pathname

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [react()],
  // Throwaway prototype: bind all interfaces and accept any Host header so the
  // viewer is reachable from any remote machine via any hostname (Vite 6
  // otherwise rejects unknown Host headers). The `just dev-pico` recipe also
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
    },
  },
})
