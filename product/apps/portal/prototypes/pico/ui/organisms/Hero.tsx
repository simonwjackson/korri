/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Centered hero state: glyph/adornment + title + message + actions. Reused by
 * most loading / error / empty / confirm screens. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"
import { Glyph } from "../atoms/Glyph"
import { Title } from "../atoms/Title"

export function Hero({
  glyph,
  glyphTone,
  adornment,
  title,
  message,
  children,
}: {
  readonly glyph?: ReactNode
  readonly glyphTone?: "accent" | "good" | "bad" | "info"
  readonly adornment?: ReactNode
  readonly title: ReactNode
  readonly message?: ReactNode
  readonly children?: ReactNode
}) {
  return (
    <div className="pc-hero">
      {glyph !== undefined ? <Glyph tone={glyphTone}>{glyph}</Glyph> : null}
      {adornment !== undefined ? adornment : null}
      <Title size={1}>{title}</Title>
      {message !== undefined ? <p className="pc-hero-msg">{message}</p> : null}
      {children !== undefined ? (
        <div className="pc-hero-actions">{children}</div>
      ) : null}
    </div>
  )
}
