import type { ReactNode } from "react"

export interface LibraryTemplateProps {
  header: ReactNode
  navigation?: ReactNode
  filterBar?: ReactNode
  content: ReactNode
  footer?: ReactNode
}

/**
 * Pure layout shell: header on top, optional navigation, optional filter bar,
 * scrollable content, optional footer. Owns no domain state.
 */
export function LibraryTemplate({
  header,
  navigation,
  filterBar,
  content,
  footer,
}: LibraryTemplateProps) {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      {header}
      {navigation}
      {filterBar ? <div className="px-4 py-2">{filterBar}</div> : null}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {content}
      </main>
      {footer}
    </div>
  )
}
