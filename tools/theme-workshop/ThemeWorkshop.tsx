/**
 * theme-workshop — the one component every theme mounts.
 *
 * Composes the device lab (one screen at true physical size) or the atomic
 * catalog (the parts view, where the screens live as PAGES), with the gallery
 * navigator on top, all driven by a single `ThemeWorkshopConfig`. Screen
 * selection is uncontrolled by default; pass
 * `screenId` + `onScreenChange` to drive it from the outside (e.g. the portal
 * route syncs it to `?screen=`).
 *
 * The root wrapper carries `data-theme={id}` plus any `rootProps`, so a theme's
 * attribute-scoped CSS variables resolve for the fixed-position chrome too.
 */
import { useEffect, useState } from "react"
import { resolveClassNames } from "./classnames"
import { DeviceLab } from "./device-lab"
import { Gallery } from "./Gallery"
import { Parts } from "./Parts"
import type { ThemeWorkshopConfig } from "./types"
import { useViewMode } from "./view-store"
import { WorkshopControls } from "./WorkshopControls"

export function ThemeWorkshop({
  config,
  screenId,
  onScreenChange,
}: {
  readonly config: ThemeWorkshopConfig
  /** Controlled current screen id. Omit for internal (uncontrolled) state. */
  readonly screenId?: string
  readonly onScreenChange?: (id: string) => void
}) {
  const first = config.screens[0]?.id ?? ""
  const [internalId, setInternalId] = useState(first)
  const currentId = screenId ?? internalId
  const select = (id: string) => {
    if (onScreenChange) onScreenChange(id)
    else setInternalId(id)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot on mount.
  useEffect(() => {
    config.loadStyles?.()
  }, [])

  const view = useViewMode()
  const cn = resolveClassNames(config.classNames)
  const screen =
    config.screens.find(s => s.id === currentId) ?? config.screens[0]

  // Declarative controls (the kit renders them neutrally) take precedence; the
  // legacy theme-styled node is the fallback escape hatch. config never changes
  // for a mounted theme, so this branch is stable for hooks.
  const controls = config.controls ? (
    <WorkshopControls useControls={config.controls} />
  ) : (
    config.workshopControls
  )

  return (
    <div data-theme={config.id} {...config.rootProps}>
      {view === "parts" ? (
        <Parts stories={config.stories ?? []} cn={cn} />
      ) : (
        <DeviceLab
          storageKey={config.id}
          devices={config.devices}
          themeKnobs={config.knobs}
          defaultPxPerMm={config.defaultPxPerMm}
          stageClassName={cn.stage}
          screensClassName={cn.screens}
          bezelClassName={cn.bezel}
          screenClassName={cn.screen}
          render={() => screen?.render()}
        />
      )}
      <Gallery
        screens={config.screens}
        groups={config.groups}
        current={currentId}
        onSelect={select}
        cn={cn}
        controls={controls}
        hasStories={(config.stories?.length ?? 0) > 0}
        onCue={config.onCue}
      />
    </div>
  )
}
