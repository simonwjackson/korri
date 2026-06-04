import { defineConfig } from "vite"

export default defineConfig({
  resolve: {
    alias: {
      "@product": new URL("../..", import.meta.url).pathname,
      "@platform": new URL("../../platform", import.meta.url).pathname,
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV ?? "development",
    ),
  },
})
