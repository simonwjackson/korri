import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { createPS1Material } from "./ps1-material"
import { fetchCoverImage, type Game } from "./steamgriddb"
import {
  bannerTexture,
  carpetTexture,
  ceilingTexture,
  posterTexture,
  vhsAtlas,
  wallTexture,
} from "./textures"
import { getStress, getTopple, TOPPLE_SECS } from "./topple"
import { VhsBoxes } from "./vhs"

export const ROOM = { w: 26, d: 44, h: 4.2 }
export const GONDOLA_X = [-7, 0, 7]
export const GONDOLA_Z = 9 // half-length
export const LEVELS = [0.55, 1.25, 1.95, 2.65]
export const ATLAS_COLS = 8
export const ATLAS_ROWS = 8

// A second room ("the viewing booth") behind the store's back wall, reached
// through a doorway. The store back wall is at z = -ROOM.d/2 (-22).
export const DOOR_HALF = 1.8 // doorway half-width
export const BACK_ROOM = {
  halfX: 7,
  zNear: -ROOM.d / 2,
  zFar: -ROOM.d / 2 - 15,
} // -22 .. -37
export const CONSOLE_POS = new THREE.Vector3(0, 0, -34)
// where the camera looks when a game loads ("sit down to watch")
export const TV_FOCUS = new THREE.Vector3(0, 2.0, BACK_ROOM.zFar + 1.66)

// A gondola shelf. Ram it head-on hard enough (see controls.tsx) and it tips
// over about its base edge; vhs.tsx spills this shelf's tapes onto the floor.
function Gondola({
  gi,
  gx,
  boardMat,
}: {
  gi: number
  gx: number
  boardMat: THREE.Material
}) {
  const ref = useRef<THREE.Group>(null)
  const HALF = 0.31 // half the shelf footprint — the edge it pivots on

  useFrame((state, dt) => {
    const g = ref.current
    if (!g) return
    const t = getTopple(gi)
    if (t) {
      if (t.progress < 1)
        t.progress = Math.min(1, t.progress + dt / TOPPLE_SECS)
      const e = 1 - (1 - t.progress) ** 3 // easeOutCubic — quick tip, gentle settle
      const theta = -t.dirSign * (Math.PI / 2) * e
      // rotate the whole shelf about its base edge on the side it falls toward
      g.rotation.z = theta
      g.position.x = gx + t.dirSign * HALF * (1 - Math.cos(theta))
      g.position.y = -t.dirSign * HALF * Math.sin(theta)
      return
    }
    // not toppling: creak/wobble in place while it's being shoved — a warning
    // that grows with the shove charge, so you can back off before it goes over
    const s = getStress(gi)
    if (s > 0.001) {
      g.rotation.z =
        Math.sin(state.clock.elapsedTime * 36) * 0.03 * Math.min(1, s)
    } else if (g.rotation.z !== 0) {
      g.rotation.z = 0
    }
  })

  return (
    <group ref={ref} position={[gx, 0, 0]}>
      {/* central backing */}
      <mesh position={[0, 1.6, 0]} material={boardMat}>
        <boxGeometry args={[0.1, 3.2, GONDOLA_Z * 2]} />
      </mesh>
      {/* shelf boards under each level */}
      {LEVELS.map(ly => (
        <mesh key={`b${ly}`} position={[0, ly, 0]} material={boardMat}>
          <boxGeometry args={[0.62, 0.06, GONDOLA_Z * 2]} />
        </mesh>
      ))}
      {/* end caps */}
      {[-GONDOLA_Z, GONDOLA_Z].map(z => (
        <mesh key={`c${z}`} position={[0, 1.6, z]} material={boardMat}>
          <boxGeometry args={[0.62, 3.2, 0.1]} />
        </mesh>
      ))}
    </group>
  )
}

export function Scene({
  onHover,
  onHeld,
  onFlip,
  onPlay,
  onNear,
  playing,
}: {
  onHover?: (g: Game | null) => void
  onHeld?: (g: Game | null) => void
  onFlip?: (flipped: boolean) => void
  onPlay?: (g: Game | null) => void
  onNear?: (near: boolean) => void
  playing?: Game | null
}) {
  const built = useMemo(() => {
    const carpet = carpetTexture()
    carpet.repeat.set(ROOM.w / 2, ROOM.d / 2)
    const wall = wallTexture()
    wall.repeat.set(ROOM.w / 3, ROOM.h / 3)
    const ceil = ceilingTexture()
    ceil.repeat.set(ROOM.w / 2, ROOM.d / 2)
    const atlas = vhsAtlas(ATLAS_COLS, ATLAS_ROWS)

    const floorMat = createPS1Material({ map: carpet, side: THREE.DoubleSide })
    const wallMat = createPS1Material({ map: wall, side: THREE.DoubleSide })
    const ceilMat = createPS1Material({ map: ceil, side: THREE.DoubleSide })
    const boardMat = createPS1Material({ color: "#241a12" })
    const lightMat = createPS1Material({ color: "#fff6da", emissive: true })

    return {
      carpet,
      wall,
      ceil,
      atlas,
      floorMat,
      wallMat,
      ceilMat,
      boardMat,
      lightMat,
    }
  }, [])

  const halfW = ROOM.w / 2
  const halfD = ROOM.d / 2

  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={built.floorMat}>
        <planeGeometry args={[ROOM.w, ROOM.d, ROOM.w, ROOM.d]} />
      </mesh>
      {/* ceiling */}
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, ROOM.h, 0]}
        material={built.ceilMat}
      >
        <planeGeometry args={[ROOM.w, ROOM.d, ROOM.w, ROOM.d]} />
      </mesh>

      {/* walls — back wall is split around a doorway to the viewing room */}
      {(() => {
        const seg = (halfW - DOOR_HALF) / 2 // width of each side segment
        const doorH = 2.6
        return (
          <>
            <mesh
              position={[-(DOOR_HALF + seg), ROOM.h / 2, -halfD]}
              material={built.wallMat}
            >
              <planeGeometry args={[seg * 2, ROOM.h, 4, 4]} />
            </mesh>
            <mesh
              position={[DOOR_HALF + seg, ROOM.h / 2, -halfD]}
              material={built.wallMat}
            >
              <planeGeometry args={[seg * 2, ROOM.h, 4, 4]} />
            </mesh>
            {/* header above the door */}
            <mesh
              position={[0, (doorH + ROOM.h) / 2, -halfD]}
              material={built.wallMat}
            >
              <planeGeometry args={[DOOR_HALF * 2, ROOM.h - doorH, 2, 2]} />
            </mesh>
          </>
        )
      })()}
      <mesh
        position={[0, ROOM.h / 2, halfD]}
        rotation={[0, Math.PI, 0]}
        material={built.wallMat}
      >
        <planeGeometry args={[ROOM.w, ROOM.h, ROOM.w, 4]} />
      </mesh>
      <mesh
        position={[-halfW, ROOM.h / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        material={built.wallMat}
      >
        <planeGeometry args={[ROOM.d, ROOM.h, ROOM.d, 4]} />
      </mesh>
      <mesh
        position={[halfW, ROOM.h / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        material={built.wallMat}
      >
        <planeGeometry args={[ROOM.d, ROOM.h, ROOM.d, 4]} />
      </mesh>

      {/* ceiling light panels */}
      {[-12, -4, 4, 12].map(z =>
        [-6, 6].map(x => (
          <mesh
            key={`l${x}_${z}`}
            position={[x, ROOM.h - 0.06, z]}
            rotation={[Math.PI / 2, 0, 0]}
            material={built.lightMat}
          >
            <planeGeometry args={[2.4, 1.0]} />
          </mesh>
        )),
      )}

      {/* gondolas: backing board + shelf boards + the VHS rows */}
      {GONDOLA_X.map((gx, gi) => (
        <Gondola key={`g${gx}`} gi={gi} gx={gx} boardMat={built.boardMat} />
      ))}

      {/* VHS tapes — individual, pickable */}
      <VhsBoxes
        atlas={built.atlas}
        onHover={onHover}
        onHeld={onHeld}
        onFlip={onFlip}
        onPlay={onPlay}
        onNear={onNear}
      />

      {/* signage: door sign over the doorway + store name on the front wall */}
      <Banner
        text="◄ VIEWING ROOM"
        position={[0, 3.4, -halfD + 0.06]}
        width={3.4}
      />
      <Banner
        text="BOXBUSTER"
        position={[0, 2.9, halfD - 0.06]}
        rotation={[0, Math.PI, 0]}
        width={12}
        bg="#c81d25"
        fg="#f2c100"
      />

      {/* side-wall posters */}
      {[-14, -8, 8, 14].map((z, i) => (
        <Poster
          key={`pl${z}`}
          seed={i + 1}
          position={[-halfW + 0.06, 2.1, z]}
          rotation={[0, Math.PI / 2, 0]}
        />
      ))}
      {[-14, -8, 8, 14].map((z, i) => (
        <Poster
          key={`pr${z}`}
          seed={i + 5}
          position={[halfW - 0.06, 2.1, z]}
          rotation={[0, -Math.PI / 2, 0]}
        />
      ))}

      {/* the viewing room + console, through the doorway */}
      <ViewingRoom built={built} />
      <Console playing={playing ?? null} />
    </group>
  )
}

function ViewingRoom({
  built,
}: {
  built: {
    floorMat: THREE.Material
    ceilMat: THREE.Material
    wallMat: THREE.Material
    lightMat: THREE.Material
  }
}) {
  const w = BACK_ROOM.halfX * 2
  const d = BACK_ROOM.zNear - BACK_ROOM.zFar // 15
  const cz = (BACK_ROOM.zNear + BACK_ROOM.zFar) / 2 // -29.5
  const deco = useMemo(
    () => ({
      fabric: createPS1Material({ color: "#43314f" }), // couch
      wood: createPS1Material({ color: "#2a1d12" }), // table
      rug: createPS1Material({ color: "#5a1f2a" }),
      speaker: createPS1Material({ color: "#101218" }),
      cone: createPS1Material({ color: "#2a2f3a" }),
      pot: createPS1Material({ color: "#3a2614" }),
      leaf: createPS1Material({ color: "#1f6e34" }),
      snackA: createPS1Material({ color: "#c81d25" }),
      snackB: createPS1Material({ color: "#f2a200" }),
    }),
    [],
  )
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, cz]}
        material={built.floorMat}
      >
        <planeGeometry args={[w, d, w, d]} />
      </mesh>
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, ROOM.h, cz]}
        material={built.ceilMat}
      >
        <planeGeometry args={[w, d, w, d]} />
      </mesh>
      {/* left / right / far walls */}
      <mesh
        position={[-BACK_ROOM.halfX, ROOM.h / 2, cz]}
        rotation={[0, Math.PI / 2, 0]}
        material={built.wallMat}
      >
        <planeGeometry args={[d, ROOM.h, d, 4]} />
      </mesh>
      <mesh
        position={[BACK_ROOM.halfX, ROOM.h / 2, cz]}
        rotation={[0, -Math.PI / 2, 0]}
        material={built.wallMat}
      >
        <planeGeometry args={[d, ROOM.h, d, 4]} />
      </mesh>
      <mesh position={[0, ROOM.h / 2, BACK_ROOM.zFar]} material={built.wallMat}>
        <planeGeometry args={[w, ROOM.h, w, 4]} />
      </mesh>
      {/* dim ceiling lights so the room + console are visible before the TV is on */}
      {[cz + 4.5, cz - 3].map(z => (
        <mesh
          key={z}
          position={[0, ROOM.h - 0.06, z]}
          rotation={[Math.PI / 2, 0, 0]}
          material={built.lightMat}
        >
          <planeGeometry args={[2.6, 1.0]} />
        </mesh>
      ))}

      {/* --- furnishings --- */}
      {/* rug in front of the couch */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, -28.5]}
        material={deco.rug}
      >
        <planeGeometry args={[5, 6]} />
      </mesh>

      {/* couch facing the TV */}
      <group position={[0, 0, -25.6]}>
        <mesh position={[0, 0.35, 0]} material={deco.fabric}>
          <boxGeometry args={[3.2, 0.5, 1.2]} />
        </mesh>
        <mesh position={[0, 0.75, 0.5]} material={deco.fabric}>
          <boxGeometry args={[3.2, 0.8, 0.28]} />
        </mesh>
        {[-1.6, 1.6].map(x => (
          <mesh key={x} position={[x, 0.55, 0]} material={deco.fabric}>
            <boxGeometry args={[0.32, 0.6, 1.2]} />
          </mesh>
        ))}
      </group>

      {/* coffee table + snacks */}
      <group position={[0, 0, -28.4]}>
        <mesh position={[0, 0.2, 0]} material={deco.wood}>
          <boxGeometry args={[1.7, 0.36, 0.95]} />
        </mesh>
        <mesh position={[-0.4, 0.5, 0.1]} material={deco.snackA}>
          <boxGeometry args={[0.35, 0.28, 0.25]} />
        </mesh>
        <mesh position={[0.35, 0.46, -0.1]} material={deco.snackB}>
          <cylinderGeometry args={[0.13, 0.13, 0.22, 8]} />
        </mesh>
      </group>

      {/* speakers flanking the TV */}
      {[-2.5, 2.5].map(x => (
        <group key={x} position={[x, 0, BACK_ROOM.zFar + 1.0]}>
          <mesh position={[0, 0.8, 0]} material={deco.speaker}>
            <boxGeometry args={[0.55, 1.6, 0.5]} />
          </mesh>
          <mesh
            position={[0, 1.0, 0.26]}
            rotation={[Math.PI / 2, 0, 0]}
            material={deco.cone}
          >
            <cylinderGeometry args={[0.16, 0.16, 0.04, 10]} />
          </mesh>
          <mesh
            position={[0, 0.55, 0.26]}
            rotation={[Math.PI / 2, 0, 0]}
            material={deco.cone}
          >
            <cylinderGeometry args={[0.1, 0.1, 0.04, 10]} />
          </mesh>
        </group>
      ))}

      {/* potted plant in the corner */}
      <group position={[-BACK_ROOM.halfX + 0.9, 0, BACK_ROOM.zFar + 0.9]}>
        <mesh position={[0, 0.3, 0]} material={deco.pot}>
          <cylinderGeometry args={[0.3, 0.22, 0.6, 8]} />
        </mesh>
        {[
          [0, 1.0, 0],
          [0.18, 1.25, 0.1],
          [-0.18, 1.2, -0.05],
        ].map(([x, y, z], i) => (
          <mesh
            key={`${x}:${y}:${z}`}
            position={[x, y, z]}
            rotation={[0.3 * i, i, 0.2 * i]}
            material={deco.leaf}
          >
            <boxGeometry args={[0.12, 0.8, 0.12]} />
          </mesh>
        ))}
      </group>

      {/* posters on the side walls */}
      <Poster
        seed={11}
        position={[-BACK_ROOM.halfX + 0.06, 2.2, cz + 3]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <Poster
        seed={12}
        position={[-BACK_ROOM.halfX + 0.06, 2.2, cz - 3]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <Poster
        seed={13}
        position={[BACK_ROOM.halfX - 0.06, 2.2, cz + 3]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      <Poster
        seed={14}
        position={[BACK_ROOM.halfX - 0.06, 2.2, cz - 3]}
        rotation={[0, -Math.PI / 2, 0]}
      />
    </group>
  )
}

function Banner({
  text,
  position,
  rotation,
  width,
  bg,
  fg,
}: {
  text: string
  position: [number, number, number]
  rotation?: [number, number, number]
  width: number
  bg?: string
  fg?: string
}) {
  const mat = useMemo(
    () => createPS1Material({ map: bannerTexture(text, bg, fg) }),
    [text, bg, fg],
  )
  return (
    <mesh position={position} rotation={rotation} material={mat}>
      <planeGeometry args={[width, width / 4]} />
    </mesh>
  )
}

// TV + stand + the console you load tapes into, against the viewing room's far
// wall, facing the doorway. The screen lights up with the loaded game.
function Console({ playing }: { playing: Game | null }) {
  const mats = useMemo(
    () => ({
      body: createPS1Material({ color: "#15171f" }),
      stand: createPS1Material({ color: "#0e0f15" }),
      slot: createPS1Material({ color: "#39507a", emissive: true }),
    }),
    [],
  )
  return (
    <group position={[0, 0, BACK_ROOM.zFar + 1.4]}>
      {/* TV stand */}
      <mesh position={[0, 0.55, 0]} material={mats.stand}>
        <boxGeometry args={[3, 1.1, 1.2]} />
      </mesh>
      {/* TV body */}
      <mesh position={[0, 2.0, 0]} material={mats.body}>
        <boxGeometry args={[3.2, 2.2, 0.5]} />
      </mesh>
      <TvScreen playing={playing} />
      {/* console deck out front, with a glowing slot facing the player */}
      <group position={[0, 0, 1.7]}>
        <mesh position={[0, 0.5, 0]} material={mats.body}>
          <boxGeometry args={[1.7, 0.5, 1.0]} />
        </mesh>
        <mesh position={[0, 0.62, 0.51]} material={mats.slot}>
          <boxGeometry args={[1.1, 0.07, 0.04]} />
        </mesh>
      </group>
    </group>
  )
}

function TvScreen({ playing }: { playing: Game | null }) {
  const gear = useMemo(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 256
    canvas.height = 192 // 4:3 CRT
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("boxbuster: 2d canvas context unavailable")
    const texture = new THREE.CanvasTexture(canvas)
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.generateMipmaps = false
    texture.colorSpace = THREE.SRGBColorSpace
    const mat = createPS1Material({ map: texture, emissive: true })
    return { canvas, ctx, texture, mat }
  }, [])

  useEffect(() => {
    const { canvas, ctx, texture } = gear
    const W = canvas.width
    const H = canvas.height
    const scan = () => {
      ctx.fillStyle = "rgba(0,0,0,0.18)"
      for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1)
    }
    if (!playing) {
      // dark glassy CRT in standby: vertical gradient + reflection sheen + LED
      const grad = ctx.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, "#0b121c")
      grad.addColorStop(1, "#04060a")
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)
      ctx.save()
      ctx.globalAlpha = 0.1
      ctx.fillStyle = "#9fc8ff" // diagonal glass reflection
      ctx.beginPath()
      ctx.moveTo(0, H * 0.18)
      ctx.lineTo(W * 0.55, 0)
      ctx.lineTo(W * 0.85, 0)
      ctx.lineTo(0, H * 0.62)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      scan()
      ctx.fillStyle = "#a01b1b" // red standby LED
      ctx.fillRect(W - 14, H - 12, 6, 6)
      texture.needsUpdate = true
      return
    }
    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = "#22c55e"
    ctx.font = "bold 14px monospace"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("▶ LOADING…", 12, 26)
    texture.needsUpdate = true
    let alive = true
    fetchCoverImage(playing.title).then(img => {
      if (!alive || !img) return
      ctx.imageSmoothingEnabled = false
      // cover-crop the cover to the 4:3 screen
      const ar = W / H
      const sar = img.width / img.height
      let sw = img.width
      let sh = img.height
      let sx = 0
      let sy = 0
      if (sar > ar) {
        sw = sh * ar
        sx = (img.width - sw) / 2
      } else {
        sh = sw / ar
        sy = (img.height - sh) / 2
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H)
      ctx.fillStyle = "rgba(0,0,0,0.66)"
      ctx.fillRect(0, H - 26, W, 26)
      ctx.fillStyle = "#f2c100"
      ctx.font = "bold 12px monospace"
      ctx.fillText("▶ NOW PLAYING", 8, H - 9)
      scan()
      texture.needsUpdate = true
    })
    return () => {
      alive = false
    }
  }, [playing, gear])

  return (
    <mesh position={[0, 2.0, 0.26]} material={gear.mat}>
      <planeGeometry args={[2.6, 1.95]} />
    </mesh>
  )
}

function Poster({
  seed,
  position,
  rotation,
}: {
  seed: number
  position: [number, number, number]
  rotation: [number, number, number]
}) {
  const mat = useMemo(
    () => createPS1Material({ map: posterTexture(seed) }),
    [seed],
  )
  return (
    <mesh position={position} rotation={rotation} material={mat}>
      <planeGeometry args={[1.6, 2.4]} />
    </mesh>
  )
}
