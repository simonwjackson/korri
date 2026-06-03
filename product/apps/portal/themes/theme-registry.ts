import type { KorriThemeEntrypoint } from "@platform/theme/bridge"

export type FirstPartyThemeId = "shift" | "evier" | "plain-demo"

type ThemeEntrypointModule = {
  readonly default?: KorriThemeEntrypoint
}

const THEME_ENTRYPOINTS = {
  shift: () => import("@product/themes/shift/entry"),
  evier: () => import("@product/themes/evier/entry"),
  "plain-demo": () => import("@product/themes/plain-demo/entry"),
} satisfies Record<FirstPartyThemeId, () => Promise<ThemeEntrypointModule>>

export async function loadThemeEntrypoint(
  themeId: FirstPartyThemeId,
): Promise<KorriThemeEntrypoint> {
  const mod: ThemeEntrypointModule = await THEME_ENTRYPOINTS[themeId]()
  const entrypoint = mod.default
  if (!entrypoint) {
    throw new Error(`Theme ${themeId} did not export a Korri theme entrypoint`)
  }
  return entrypoint
}
