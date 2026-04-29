/**
 * Module augmentation for TanStack Router's StaticDataRouteOption.
 *
 * These fields drive the shared PageHeader auto-render in ContainedLayout.
 * Any route that sets `pageTitle` will get a PageHeader rendered for it by
 * the shell; routes that want custom PageHeader content (tabs, toolbars,
 * actions) should OMIT `pageTitle` here and render their own
 * `<PageHeaderRoot>` inside the page component.
 */
declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** Title rendered in the shell PageHeader for this route. */
    pageTitle?: string
    /** Secondary line under the title. */
    pageSubtitle?: string
    /** Label used for breadcrumbs (currently no consumer; reserved). */
    breadcrumbLabel?: string
  }
}

export {}
