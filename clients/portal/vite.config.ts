import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@contracts": resolve(__dirname, "../../contracts"),
    },
  },
  server: {
    fs: {
      // Allow serving the contracts directory, which lives above this root.
      allow: [resolve(__dirname, "../..")],
    },
  },
  // The Android WebView loads from file:///android_asset/portal/, where
  // absolute /assets/... URLs would miss. Relative base keeps it working.
  base: "./",
})
