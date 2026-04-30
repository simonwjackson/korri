import "@fontsource-variable/geist"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./app"
import "./styles/tokens.css"
import "./styles/app.css"

const rootEl = document.getElementById("root")

if (!rootEl) {
  throw new Error("[feature-map-explorer] #root element not found")
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
