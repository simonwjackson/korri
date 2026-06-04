import { useEffect, useRef, useState } from "react"

interface ContainerSize {
  width: number
  height: number
}

/**
 * Tracks the rendered size of an element via ResizeObserver.
 * Returns a ref to attach plus the current width/height.
 */
export function useContainerSize<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<ContainerSize>({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const rect = element.getBoundingClientRect()
    setSize({ width: rect.width, height: rect.height })

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setSize({ width, height })
      }
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  return { ref, ...size }
}
