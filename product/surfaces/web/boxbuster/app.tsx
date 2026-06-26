import "./boxbuster.css"
import { Canvas } from "@react-three/fiber"
import { useEffect, useMemo, useState } from "react"
import * as THREE from "three"
import { FirstPerson } from "./controls"
import { computeLayout, DENSITY } from "./layout"
import { FOG_COLOR } from "./ps1-material"
import { Scene, TV_FOCUS } from "./scene"
import { GAMES, type Game } from "./steamgriddb"

// `embedded` = hosted inside other chrome (e.g. the theme-workshop device lab),
// where the immersive pointer-lock would hijack the whole window. In that mode
// the surface uses drag-to-look instead, so surrounding widgets stay clickable.
export function App({
  embedded = false,
  games = GAMES,
  density = DENSITY.livedIn,
  playing: routedPlaying,
  onPlay,
}: {
  embedded?: boolean
  games?: readonly Game[]
  /** target shelf-fill fraction; sizes the whole store to the library */
  density?: number
  playing?: Game | null
  onPlay?: (game: Game | null) => void
} = {}) {
  // the store geometry is a deterministic function of how many games there are
  const layout = useMemo(
    () => computeLayout(games.length, density),
    [games.length, density],
  )
  const [locked, setLocked] = useState(false)
  const [hoverGame, setHoverGame] = useState<Game | null>(null)
  const [heldGame, setHeldGame] = useState<Game | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [localPlaying, setLocalPlaying] = useState<Game | null>(null)
  const [nearConsole, setNearConsole] = useState(false)
  const [focus, setFocus] = useState<THREE.Vector3 | null>(null)

  // loading a game turns the TV on and aims the camera at the screen
  const playing = routedPlaying === undefined ? localPlaying : routedPlaying

  const handlePlay = (g: Game | null) => {
    if (routedPlaying === undefined) setLocalPlaying(g)
    onPlay?.(g)
  }

  useEffect(() => {
    setFocus(playing ? TV_FOCUS.clone() : null)
  }, [playing])

  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement != null)
    document.addEventListener("pointerlockchange", onChange)
    return () => document.removeEventListener("pointerlockchange", onChange)
  }, [])

  return (
    <div className="boxbuster-surface">
      <Canvas
        flat
        dpr={0.32} // low-res framebuffer; CSS does the nearest-neighbour upscale
        gl={{ antialias: false, powerPreference: "high-performance" }}
        camera={{ fov: 72, near: 0.08, far: 60 }}
        onCreated={({ scene, gl }) => {
          scene.background = FOG_COLOR
          gl.setClearColor(FOG_COLOR)
          gl.outputColorSpace = THREE.SRGBColorSpace
        }}
      >
        <Scene
          onHover={setHoverGame}
          onHeld={setHeldGame}
          onFlip={setFlipped}
          onPlay={handlePlay}
          onNear={setNearConsole}
          playing={playing}
          games={games}
          layout={layout}
        />
        <FirstPerson focus={focus} embedded={embedded} layout={layout} />
      </Canvas>

      <Overlay
        locked={locked}
        embedded={embedded}
        hoverGame={hoverGame}
        heldGame={heldGame}
        flipped={flipped}
        playing={playing}
        nearConsole={nearConsole}
      />
    </div>
  )
}

const YELLOW: React.CSSProperties = {
  position: "absolute",
  fontFamily: "monospace",
  color: "#f2c100",
  textShadow: "2px 2px 0 #000",
  pointerEvents: "none",
  userSelect: "none",
}

function Overlay({
  locked,
  embedded,
  hoverGame,
  heldGame,
  flipped,
  playing,
  nearConsole,
}: {
  locked: boolean
  embedded: boolean
  hoverGame: Game | null
  heldGame: Game | null
  flipped: boolean
  playing: Game | null
  nearConsole: boolean
}) {
  const hovering = hoverGame != null
  const holding = heldGame != null
  // Embedded (workshop) has no pointer-lock, so the HUD is always "active".
  const active = locked || embedded

  let prompt: string | null = null
  if (holding) {
    prompt = nearConsole
      ? "[E] / click — load into console     ·     [R] flip"
      : `[E] / click — set down     ·     [R] ${flipped ? "front" : "read back"}`
  } else if (nearConsole && playing) {
    prompt = "[E] / click — eject tape"
  } else if (hovering) {
    prompt = "[E] / click — pick up"
  }
  return (
    <>
      <div
        style={{
          ...YELLOW,
          top: 12,
          left: 14,
          fontSize: "var(--bb-text-hud)",
          lineHeight: 1.5,
        }}
      >
        BOXBUSTER — PS1 video store
        <br />
        <span style={{ color: "#9fc8ff" }}>
          {embedded
            ? "WASD / arrows · drag to look · click or [E] grab"
            : "WASD / arrows · mouse look · click or [E] grab · Esc release"}
        </span>
      </div>

      {/* centre reticle — turns amber over a grabbable tape */}
      {active && (
        <div
          style={{
            ...YELLOW,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: hovering || holding ? 12 : 6,
            height: hovering || holding ? 12 : 6,
            borderRadius: "50%",
            border: `2px solid ${hovering || holding ? "#f2c100" : "#9fc8ff"}`,
            background: hovering ? "rgba(242,193,0,0.35)" : "transparent",
            transition: "all 80ms",
          }}
        />
      )}

      {/* title of the tape you're looking at */}
      {active && hovering && !holding && (
        <div
          style={{
            ...YELLOW,
            bottom: 90,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: "var(--bb-text-title)",
          }}
        >
          {hoverGame.title}
        </div>
      )}

      {/* contextual action prompt */}
      {active && prompt && (
        <div
          style={{
            ...YELLOW,
            bottom: 48,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: "var(--bb-text-prompt)",
          }}
        >
          {prompt}
        </div>
      )}

      {!active && (
        <div
          style={{
            ...YELLOW,
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "var(--bb-text-enter)",
            background: "rgba(5,6,12,0.55)",
          }}
        >
          ▶ CLICK TO ENTER
        </div>
      )}
    </>
  )
}
