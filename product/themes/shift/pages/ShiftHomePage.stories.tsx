import { useAtomSet } from "@effect/atom-react"
import {
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import { games } from "@shared/fixtures/games/games"
import { makeInMemoryLauncherLayer } from "@shared/library/launcher-layer-memory"
import {
  type Launcher,
  LibraryError,
  type LibrarySource,
} from "@shared/library/library-services"
import {
  loadingForeverLibrarySourceLayer,
  makeFailingLibrarySourceLayer,
  makeInMemoryLibrarySourceLayer,
} from "@shared/library/library-source-layer-memory"
import type { Decorator, Meta, StoryObj } from "@storybook/react-vite"
import type { Layer } from "effect"
import { useLayoutEffect } from "react"
import { ShiftHomePage } from "./ShiftHomePage"

const meta = {
  title: "Themes/Shift/Pages/Home",
  component: ShiftHomePage,
  parameters: {
    layout: "fullscreen",
    backgrounds: { disable: true },
    viewport: {
      defaultViewport: "fullhd",
      viewports: {
        fullhd: {
          name: "1080p (10ft)",
          styles: { width: "1920px", height: "1080px" },
          type: "desktop",
        },
        hd: {
          name: "720p",
          styles: { width: "1280px", height: "720px" },
          type: "desktop",
        },
        tablet: {
          name: "Tablet",
          styles: { width: "900px", height: "1200px" },
          type: "tablet",
        },
        handheld: {
          name: "Handheld",
          styles: { width: "420px", height: "720px" },
          type: "mobile",
        },
      },
    },
  },
} satisfies Meta<typeof ShiftHomePage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  decorators: [
    withLibraryLayers(
      makeInMemoryLibrarySourceLayer({ games }),
      makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }),
    ),
  ],
}

export const Loading: Story = {
  decorators: [
    withLibraryLayers(
      loadingForeverLibrarySourceLayer,
      makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }),
    ),
  ],
}

export const LoadError: Story = {
  name: "Load error",
  decorators: [
    withLibraryLayers(
      makeFailingLibrarySourceLayer(
        new LibraryError({ reason: "io", message: "Story-configured failure" }),
      ),
      makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }),
    ),
  ],
}

export const Empty: Story = {
  decorators: [
    withLibraryLayers(
      makeInMemoryLibrarySourceLayer({ games: [] }),
      makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }),
    ),
  ],
}

export const FailedLaunch: Story = {
  name: "Failed launch",
  decorators: [
    withLibraryLayers(
      makeInMemoryLibrarySourceLayer({ games }),
      makeInMemoryLauncherLayer({
        behavior: { kind: "fail", exitCode: 1, stderrTail: "story failure" },
      }),
    ),
  ],
  play: async ({ canvasElement }) => {
    const tile = await waitForElement(canvasElement, "button[data-tile-id]")
    tile.focus()
    tile.click()
    await waitForElement(canvasElement, "[role='alert']")
  },
}

async function waitForElement(
  root: HTMLElement,
  selector: string,
): Promise<HTMLElement> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const element = root.querySelector<HTMLElement>(selector)
    if (element) return element
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  throw new Error(`Timed out waiting for ${selector}`)
}

function withLibraryLayers(
  sourceLayer: Layer.Layer<LibrarySource>,
  launcherLayer: Layer.Layer<Launcher>,
): Decorator {
  return Story => {
    const setSourceLayer = useAtomSet(librarySourceLayerAtom)
    const setLauncherLayer = useAtomSet(launcherLayerAtom)

    useLayoutEffect(() => {
      setSourceLayer(sourceLayer)
      setLauncherLayer(launcherLayer)
      return () => {
        setSourceLayer(loadingForeverLibrarySourceLayer)
        setLauncherLayer(
          makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }),
        )
      }
    }, [setSourceLayer, setLauncherLayer, sourceLayer, launcherLayer])

    return <Story />
  }
}
