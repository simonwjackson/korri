import {
  type SpatialNavigationHandle,
  startSpatialNavigation,
} from "@shared/navigation/start"
import type { Decorator, Preview } from "@storybook/react-vite"
import { useEffect } from "react"
import "@fontsource-variable/geist"
import "@shared/primitives/theme/styles.css"

// Spatial nav is global; initialize once per iframe load. HMR may re-evaluate
// this module, so we stash the handle on window and dispose the prior
// instance before creating a new one. Otherwise listeners and the gamepad
// rAF loop pile up across hot reloads.
declare global {
  interface Window {
    __korriSpatialNav?: SpatialNavigationHandle
  }
}

window.__korriSpatialNav?.dispose()
window.__korriSpatialNav = startSpatialNavigation()

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
