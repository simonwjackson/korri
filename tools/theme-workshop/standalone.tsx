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
import "./device-lab/device-lab.css"
import "./workshop.css"

const host = document.getElementById("root")
if (host) createRoot(host).render(<ThemeWorkshopApp />)
