import type { StorybookConfig } from "@storybook/react-vite"
import { mergeConfig } from "vite"

const config: StorybookConfig = {
  stories: [
    "../../../product/surfaces/web/**/*.stories.@(ts|tsx|mdx)",
    "../../../product/platform/**/*.stories.@(ts|tsx|mdx)",
    "../../../product/apps/**/*.stories.@(ts|tsx|mdx)",
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
          "@product": new URL("../..", import.meta.url).pathname,
          "@platform": new URL("../../platform", import.meta.url).pathname,
        },
      },
    })
  },
}

export default config
