/**
 * theme-workshop — all-screens montage.
 *
 * Every catalog screen rendered as a live miniature, grouped, click-to-focus.
 * Each cell is its own `container-type: size` query container so the theme's
 * intrinsic token scale resolves at thumbnail size — the screens render for
 * real, just small. Cells mount lazily (IntersectionObserver) so only on-screen
 * thumbnails run; this also lets a theme's live knobs visibly re-skin the whole
 * set at once. Dev-only chrome, hidden in PROD like the rest of the workshop.
 *
 * Generic: classes come from the resolved skin map, so a theme keeps its look
 * (pico drives `.pcWall*`); the cell screen carries the theme's screen class so
 * its skin + `container-type: size` apply, plus the wall's sizing class.
 */
import { useEffect, useRef, useState } from "react"
import { cx, type ResolvedClassNames } from "./classnames"
import type { Screen } from "./types"

function WallCell({
  screen,
  active,
  onSelect,
  cn,
}: {
  readonly screen: Screen
  readonly active: boolean
  readonly onSelect: (id: string) => void
  readonly cn: ResolvedClassNames
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    if (seen) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { rootMargin: "300px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [seen])

  return (
    <div ref={ref} className={cx(cn.wallCell, active && "on")}>
      <div className={cn.wallFrame}>
        <div className={cx(cn.screen, cn.wallScreen)}>
          {seen ? screen.render() : null}
        </div>
        {/* transparent overlay button: a real <button> (no children, so no
         * nested-interactive issues) so a click always selects the cell. */}
        <button
          type="button"
          className={cn.wallHit}
          aria-label={screen.name}
          onClick={() => onSelect(screen.id)}
        />
      </div>
      <span className={cn.wallLabel}>{screen.name}</span>
    </div>
  )
}

export function Wall({
  screens,
  groups,
  current,
  onSelect,
  cn,
}: {
  readonly screens: readonly Screen[]
  readonly groups: readonly string[]
  readonly current: string
  readonly onSelect: (id: string) => void
  readonly cn: ResolvedClassNames
}) {
  if (import.meta.env.PROD) return null
  return (
    <div className={cn.wall}>
      {groups.map(group => {
        const inGroup = screens.filter(screen => screen.group === group)
        if (inGroup.length === 0) return null
        return (
          <section className={cn.wallGroup} key={group}>
            <h2 className={cn.wallGroupTitle}>
              {group}
              <span className={cn.wallGroupCount}>{inGroup.length}</span>
            </h2>
            <div className={cn.wallGrid}>
              {inGroup.map(screen => (
                <WallCell
                  key={screen.id}
                  screen={screen}
                  active={screen.id === current}
                  onSelect={onSelect}
                  cn={cn}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
