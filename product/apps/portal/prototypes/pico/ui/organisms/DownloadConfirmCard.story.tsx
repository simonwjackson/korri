import { picoGames } from "../../fixtures"
import { PICO_RUNTIMES, picoReleases } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { DownloadConfirmCard } from "./DownloadConfirmCard"

const target = picoGames[0]

export default {
  render: () =>
    target ? (
      <DownloadConfirmCard
        target={target}
        size={picoReleases[2]?.size ?? "104 MB"}
        runtime={PICO_RUNTIMES[0] ?? "FEX"}
      />
    ) : null,
} satisfies StorySpec
