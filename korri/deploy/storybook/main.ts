import type { StorybookConfig } from "@storybook/react-vite"
import { mergeConfig } from "vite"

const config: StorybookConfig = {
  stories: [
    "../../shared/**/*.stories.@(ts|tsx|mdx)",
    "../../products/**/*.stories.@(ts|tsx|mdx)",
    "../../../tools/spike-effect-atoms/**/*.stories.@(ts|tsx|mdx)",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {
      builder: {
        viteConfigPath: "korri/deploy/storybook/vite.config.mjs",
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
          "@app": new URL("../../products/app", import.meta.url).pathname,
          "@shared": new URL("../../shared", import.meta.url).pathname,
          "@korri": new URL("../..", import.meta.url).pathname,
          "@deploy": new URL("..", import.meta.url).pathname,
        },
      },
    })
  },
}

export default config
