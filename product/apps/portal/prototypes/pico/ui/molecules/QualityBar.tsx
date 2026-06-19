/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * A streaming-quality segmented bar with a tone + tag. Shared by the stream
 * overlay (GOOD) and the reconnecting screen (DROPPING).
 */
export function QualityBar({
  level,
  max = 5,
  tone,
  tag,
}: {
  readonly level: number
  readonly max?: number
  readonly tone: string
  readonly tag: string
}) {
  return (
    <div className="pcIg-quality">
      <span className="pcIg-quality-label">QUALITY</span>
      <span className={`pcIg-quality-bar ${tone}`}>
        {Array.from({ length: max }, (_, index) => (
          <i key={`seg-${index}`} className={index < level ? "on" : ""} />
        ))}
      </span>
      <span className="pcIg-quality-tag">{tag}</span>
    </div>
  )
}
