import { useAtomSet } from "@effect/atom-react"
import { games } from "@shared/fixtures/games/games"
import type { Decorator, Meta, StoryObj } from "@storybook/react-vite"
import type { Layer } from "effect"
import { useLayoutEffect } from "react"
import { LibraryList } from "./LibraryList"
import { libraryLayerAtom } from "./library-atoms"
import {
  loadingForeverLayer,
  makeFailingListLayer,
  makeInMemoryLibraryLayer,
} from "./library-layer-memory"
import type { Library } from "./library-service"
import { LibraryError } from "./library-service"

const seedGames = games.slice(0, 3)

const meta = {
  title: "Spike/Library Atoms/LibraryList",
  component: LibraryList,
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
        handheld: {
          name: "Handheld",
          styles: { width: "420px", height: "720px" },
          type: "mobile",
        },
      },
    },
  },
} satisfies Meta<typeof LibraryList>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  decorators: [
    withLayer(
      makeInMemoryLibraryLayer({
        games: seedGames,
        launch: { kind: "succeed", delayMs: 200 },
      }),
    ),
  ],
}

export const FailedLaunch: Story = {
  decorators: [
    withLayer(
      makeInMemoryLibraryLayer({
        games: seedGames,
        launch: { kind: "fail", exitCode: 1, delayMs: 200 },
      }),
    ),
  ],
}

export const Loading: Story = {
  decorators: [withLayer(loadingForeverLayer)],
}

export const LoadError: Story = {
  name: "Error",
  decorators: [
    withLayer(
      makeFailingListLayer(
        new LibraryError({ reason: "io", message: "Story-configured failure" }),
      ),
    ),
  ],
}

function withLayer(layer: Layer.Layer<Library>): Decorator {
  return Story => {
    const setLayer = useAtomSet(libraryLayerAtom)

    useLayoutEffect(() => {
      setLayer(layer)
      return () => {
        setLayer(loadingForeverLayer)
      }
    }, [setLayer])

    return <Story />
  }
}
