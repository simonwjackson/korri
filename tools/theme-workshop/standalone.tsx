/**
 * theme-workshop — standalone entry.
 *
 * Backend-free dev viewer: mounts the theme-workshop app (registry + switcher)
 * with no router / bridge / RPC / API.
 *   just dev-theme-workshop
 *
 * Harness CSS (device lab + neutral chrome) is loaded here; each theme's own
 * skin CSS is side-effect-imported by its config module.
 */
import { createRoot } from "react-dom/client"
import { ThemeWorkshopApp } from "./ThemeWorkshopApp"
// Tailwind (same entry the portal ships) so Tailwind-utility surfaces like Shift
// compile their classes in the lab; its @source globs already cover surfaces/web.
import "@platform/react/primitives/theme/styles.css"
import "./device-lab/device-lab.css"
import "./workshop.css"

const host = document.getElementById("root")
if (host) createRoot(host).render(<ThemeWorkshopApp />)
