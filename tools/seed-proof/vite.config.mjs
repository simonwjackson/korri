// seed-proof — throwaway harness proving the data seam: render the REAL
// ShiftHomePage with the catalog-facts layer seeded in memory (no API).
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const repoRoot = new URL("../../", import.meta.url).pathname

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  publicDir: false,
  plugins: [react(), tailwindcss()],
  server: { host: true, allowedHosts: true },
  preview: { host: true, allowedHosts: true },
  resolve: {
    alias: {
      "@product": `${repoRoot}product`,
      "@platform": `${repoRoot}product/platform`,
      "@tools": `${repoRoot}tools`,
    },
  },
})
