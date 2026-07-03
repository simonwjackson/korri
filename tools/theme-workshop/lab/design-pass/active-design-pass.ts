import type { LabDesignPass } from "./design-pass-model"

// No hardcoded design-pass takes. AI-authored takes are discovered at runtime
// from each surface's ai-takes/ dir (see ai-parts-loader); this stays as the
// seam for any future curated pass.
export const activeDesignPass = {
  id: "shift-status-bar-ideas",
  name: "Status bar ideas",
  entries: [],
} satisfies LabDesignPass
