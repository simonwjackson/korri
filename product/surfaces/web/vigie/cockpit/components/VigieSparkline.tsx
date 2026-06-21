// Atom — an instrument trace: filled area under a line. Pure SVG, no deps.

export function VigieSparkline({
  series,
  status,
}: {
  readonly series: readonly number[]
  readonly status: string
}) {
  if (series.length < 2) return null

  const max = Math.max(...series)
  const min = Math.min(...series)
  const span = max - min || 1
  const step = 100 / (series.length - 1)
  const coords = series.map((value, index) => {
    const x = index * step
    const y = 96 - ((value - min) / span) * 88
    return [x, y] as const
  })
  const line = coords
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ")
  const area = `0,100 ${line} 100,100`

  return (
    <svg
      className="vigie-trace"
      data-status={status}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon className="vigie-trace-fill" points={area} />
      <polyline
        className="vigie-trace-line"
        points={line}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
