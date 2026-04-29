import { init as initSpatialNav } from "@noriginmedia/norigin-spatial-navigation"
import type { Decorator, Preview } from "@storybook/react-vite"
import { useEffect } from "react"
import "@fontsource-variable/geist"
import "@shared/design-system/theme/styles.css"
import "@shared/themes/shift/shift.css"

// Spatial-nav is global; initialize once. HMR-safe via try/catch.
try {
  initSpatialNav({ debug: false, visualDebug: false })
} catch {
  // already initialized in this module graph; safe to ignore
}

const withColorMode: Decorator = (Story, context) => {
  const mode = (context.globals.colorMode as "light" | "dark") ?? "dark"

  useEffect(() => {
    const root = document.documentElement
    if (mode === "dark") root.classList.add("dark")
    else root.classList.remove("dark")
  }, [mode])

  return <Story />
}

const preview: Preview = {
  globalTypes: {
    colorMode: {
      description: "Light or dark color mode",
      toolbar: {
        title: "Color mode",
        icon: "circlehollow",
        items: [
          { value: "light", icon: "sun", title: "Light" },
          { value: "dark", icon: "moon", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    colorMode: "dark",
  },
  decorators: [withColorMode],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

export default preview
