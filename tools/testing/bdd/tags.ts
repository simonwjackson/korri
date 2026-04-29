export type PlaywrightAnnotation =
  | { type: "skip"; reason?: string }
  | { type: "slow" }
  | { type: "only" }
  | { type: "fixme"; reason?: string }

export function getPlaywrightAnnotations(
  tags: string[],
): PlaywrightAnnotation[] {
  const annotations: PlaywrightAnnotation[] = []

  for (const raw of tags) {
    const tag = raw.toLowerCase()

    if (tag === "@skip") {
      annotations.push({ type: "skip" })
    } else if (tag.startsWith("@skip(") && tag.endsWith(")")) {
      annotations.push({ type: "skip", reason: raw.slice(6, -1) })
    } else if (tag === "@slow") {
      annotations.push({ type: "slow" })
    } else if (tag === "@only" || tag === "@focus") {
      annotations.push({ type: "only" })
    } else if (tag === "@fixme") {
      annotations.push({ type: "fixme" })
    } else if (tag.startsWith("@fixme(") && tag.endsWith(")")) {
      annotations.push({ type: "fixme", reason: raw.slice(7, -1) })
    }
  }

  return annotations
}

export function generateAnnotationLines(tags: string[]): string[] {
  const lines: string[] = []
  const annotations = getPlaywrightAnnotations(tags)

  for (const annotation of annotations) {
    switch (annotation.type) {
      case "skip":
        lines.push(
          annotation.reason
            ? `test.skip(true, ${JSON.stringify(annotation.reason)})`
            : "test.skip()",
        )
        break
      case "slow":
        lines.push("test.slow()")
        break
      case "fixme":
        lines.push(
          annotation.reason
            ? `test.fixme(true, ${JSON.stringify(annotation.reason)})`
            : "test.fixme()",
        )
        break
      case "only":
        break
    }
  }

  return lines
}

export function isOnlyScenario(tags: string[]): boolean {
  return tags.some(tag => {
    const lower = tag.toLowerCase()
    return lower === "@only" || lower === "@focus"
  })
}

export function matchesTagFilter(
  scenarioTags: string[],
  filter: string | undefined,
): boolean {
  if (!filter || filter.trim() === "") return true

  const trimmed = filter.trim()
  const normalizedScenarioTags = scenarioTags.map(tag => tag.toLowerCase())

  if (trimmed.toLowerCase().startsWith("not ")) {
    const excludeTag = trimmed.slice(4).trim().toLowerCase()
    return !normalizedScenarioTags.includes(excludeTag)
  }

  if (trimmed.toLowerCase().includes(" and ")) {
    const requiredTags = trimmed
      .toLowerCase()
      .split(/\s+and\s+/)
      .map(tag => tag.trim())
    return requiredTags.every(tag => normalizedScenarioTags.includes(tag))
  }

  if (trimmed.includes(",")) {
    const anyTags = trimmed.split(",").map(tag => tag.trim().toLowerCase())
    return anyTags.some(tag => normalizedScenarioTags.includes(tag))
  }

  return normalizedScenarioTags.includes(trimmed.toLowerCase())
}
