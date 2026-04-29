import { defineConfig } from "vite"

export default defineConfig({
  resolve: {
    alias: {
      "@app": new URL("../../products/app", import.meta.url).pathname,
      "@shared": new URL("../../shared", import.meta.url).pathname,
      "@korri": new URL("../..", import.meta.url).pathname,
      "@deploy": new URL("..", import.meta.url).pathname,
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV ?? "development",
    ),
  },
})
