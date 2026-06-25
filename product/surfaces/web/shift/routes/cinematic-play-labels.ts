export function relativeLastPlayed(
  date: Date | undefined,
  now = new Date(),
): string | undefined {
  if (!date) return undefined
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function playtimeLabel(minutes: number | undefined): string | undefined {
  if (!minutes) return undefined
  if (minutes < 60) return `${minutes}m`
  return `${(minutes / 60).toFixed(1)}h`
}
