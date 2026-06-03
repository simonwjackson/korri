import { defineConfig } from "vite"

export default defineConfig({
  resolve: {
    alias: {
      "@app": new URL("../../../korri/products/app", import.meta.url).pathname,
      "@shared": new URL("../../../korri/shared", import.meta.url).pathname,
      "@korri": new URL("../../../korri", import.meta.url).pathname,
      "@product": new URL("../..", import.meta.url).pathname,
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV ?? "development",
    ),
  },
})
