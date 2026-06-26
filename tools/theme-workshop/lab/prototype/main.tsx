import { createRoot } from "react-dom/client"
import { ShellPrototype } from "./ShellPrototype"
import "./prototype.css"

const host = document.getElementById("root")
if (host) createRoot(host).render(<ShellPrototype />)
