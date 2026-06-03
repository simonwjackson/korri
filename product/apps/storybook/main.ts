import type { StorybookConfig } from "@storybook/react-vite"
import { mergeConfig } from "vite"

const config: StorybookConfig = {
  stories: [
    "../../../korri/shared/**/*.stories.@(ts|tsx|mdx)",
    "../../../korri/products/**/*.stories.@(ts|tsx|mdx)",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {
      builder: {
        viteConfigPath: "product/apps/storybook/vite.config.mjs",
      },
    },
  },
  typescript: {
    reactDocgen: false,
  },
  async viteFinal(config) {
    const { default: tailwindcss } = await import("@tailwindcss/vite")

    return mergeConfig(config, {
      plugins: [tailwindcss()],
      resolve: {
        alias: {
          "@app": new URL("../../../korri/products/app", import.meta.url)
            .pathname,
          "@shared": new URL("../../../korri/shared", import.meta.url).pathname,
          "@korri": new URL("../../../korri", import.meta.url).pathname,
          "@product": new URL("../..", import.meta.url).pathname,
          "@platform": new URL("../../platform", import.meta.url).pathname,
        },
      },
    })
  },
}

export default config
