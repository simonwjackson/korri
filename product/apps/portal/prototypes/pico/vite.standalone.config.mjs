// PROTOTYPE — minimal Vite config for the standalone pico viewer. Throwaway.
// No router, no proxy, no API; just React + the @platform/@product aliases
// the variants need to reach the shared game fixtures.
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const repoRoot = new URL("../../../../../", import.meta.url).pathname

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [react()],
  resolve: {
    alias: {
      "@product": `${repoRoot}product`,
      "@platform": `${repoRoot}product/platform`,
    },
  },
})
