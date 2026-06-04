import type { ReactNode } from "react"

export interface DualScreenPreviewFrameProps {
  readonly primary: ReactNode
  readonly companion: ReactNode
}

export function DualScreenPreviewFrame({
  primary,
  companion,
}: DualScreenPreviewFrameProps) {
  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-[#0c101a] p-6">
      <style>{DUAL_SCREEN_PREVIEW_FRAME_CSS}</style>
      <div
        className="dual-screen-preview-surface dual-screen-preview-surface-primary"
        data-dual-screen-preview="primary"
      >
        {primary}
      </div>
      <div
        className="dual-screen-preview-surface dual-screen-preview-surface-companion"
        data-dual-screen-preview="companion"
      >
        {companion}
      </div>
    </div>
  )
}

const DUAL_SCREEN_PREVIEW_FRAME_CSS = `
.dual-screen-preview-surface {
  position: relative;
  flex: none;
  overflow: hidden;
  border-radius: 1.5rem;
  background: #000;
}

.dual-screen-preview-surface > * {
  position: absolute;
  inset: 0;
}

.dual-screen-preview-surface-primary {
  width: min(100%, 96rem);
  aspect-ratio: 16 / 9;
}

.dual-screen-preview-surface-companion {
  width: min(100%, 56rem);
  aspect-ratio: 8 / 7;
}

.dual-screen-preview-surface [data-shift-home] {
  height: 100%;
  min-height: 0;
}

.dual-screen-preview-surface-primary [data-shift-home] {
  --ui-scale: 0.62;
}
`
