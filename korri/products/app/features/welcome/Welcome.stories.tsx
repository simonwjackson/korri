import type { Meta, StoryObj } from "@storybook/react-vite"

function WelcomeStory() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
        <p className="text-sm font-medium text-slate-500">Clean slate</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          React, Tailwind, TanStack Router, and Effect RPC.
        </h1>
        <p className="mt-5 text-lg leading-8 text-slate-600">
          This story keeps Storybook wired into the starter without introducing
          product-specific UI.
        </p>
      </section>
    </main>
  )
}

const meta = {
  title: "App/Welcome",
  component: WelcomeStory,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof WelcomeStory>

export default meta

type Story = StoryObj<typeof meta>

export const CleanSlate: Story = {}
