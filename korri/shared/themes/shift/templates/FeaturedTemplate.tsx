import type { ReactNode } from "react"

export interface FeaturedTemplateProps {
  header: ReactNode
  navigation?: ReactNode
  content: ReactNode
  footer?: ReactNode
}

/**
 * Centered featured layout: header on top, no filter bar, content fills the
 * vertical space and centers itself, footer at bottom.
 */
export function FeaturedTemplate({
  header,
  navigation,
  content,
  footer,
}: FeaturedTemplateProps) {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      {header}
      {navigation}
      <main className="flex min-h-0 flex-1 flex-col items-stretch justify-center overflow-hidden px-6 py-4">
        {content}
      </main>
      {footer}
    </div>
  )
}
