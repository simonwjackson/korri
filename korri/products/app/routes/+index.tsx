import { useRpcQuery } from "@shared/api/rpc/useRpcQuery"
import { FeatureGate } from "@shared/gates/FeatureGate"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  const hello = useRpcQuery(c => c.app["hello.get"]({ name: "starter" }))

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
        <p className="text-sm font-medium text-slate-500">Clean slate</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          React, Tailwind, TanStack Router, and Effect RPC.
        </h1>
        <p className="mt-5 text-lg leading-8 text-slate-600">
          This starter keeps the app surface intentionally small so product,
          data, and shell decisions can be made fresh.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-medium text-slate-700">Effect RPC check</p>
          <p className="mt-2 text-slate-600">
            {hello.isPending
              ? "Calling /api/rpc..."
              : hello.isError
                ? hello.error?.message
                : hello.data?.message}
          </p>
        </div>

        <FeatureGate
          gate="welcome.example"
          current={
            <p className="mt-6 text-sm text-slate-500">
              Toggle the example feature gate from the bottom-right panel.
            </p>
          }
          next={
            <p className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              The example feature gate is on.
            </p>
          }
        />
      </section>
    </main>
  )
}
