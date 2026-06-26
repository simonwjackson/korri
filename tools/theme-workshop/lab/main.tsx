import "@fontsource-variable/geist"
import "@fontsource-variable/nunito"
import "@platform/react/primitives/theme/styles.css"
import { RouterProvider } from "@tanstack/react-router"
import { createRoot } from "react-dom/client"
import "../device-lab/device-lab.css"
import "../workshop.css"
import "./lab.css"
import "./lab-chrome.css"
import "./lab-shell.css"
import { createLabRouter } from "./lab-router"

const host = document.getElementById("root")
if (host) createRoot(host).render(<RouterProvider router={createLabRouter()} />)
