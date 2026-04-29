import type { Preview } from "@storybook/react-vite"
import "@fontsource-variable/geist"
import "@shared/design-system/theme/styles.css"

const preview: Preview = {
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
