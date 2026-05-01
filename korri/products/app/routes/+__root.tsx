import { useInputAction } from "@shared/navigation/use-input-action"
import {
  createRootRoute,
  Outlet,
  useCanGoBack,
  useRouter,
} from "@tanstack/react-router"
import { Suspense } from "react"

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  const router = useRouter()
  const canGoBack = useCanGoBack()

  useInputAction("back", () => {
    if (canGoBack) router.history.back()
  })

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
          Loading...
        </div>
      }
    >
      <Outlet />
    </Suspense>
  )
}
