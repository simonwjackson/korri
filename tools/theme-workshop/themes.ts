/**
 * theme-workshop — theme registry.
 *
 * The workshop app imports each theme's `ThemeWorkshopConfig` here; a theme only
 * exports a config object (it never imports the workshop runtime, just its
 * types). Add a theme by importing its config and appending it to THEMES.
 */
import { picoConfig } from "@product/surfaces/web/pico/config"
import { shiftConfig } from "@product/surfaces/web/shift/config"
import type { ThemeWorkshopConfig } from "./types"

export const THEMES: readonly ThemeWorkshopConfig[] = [shiftConfig, picoConfig]

export const DEFAULT_THEME_ID: string = THEMES[0]?.id ?? "pico"
