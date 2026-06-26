import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { createPS1Material } from "./ps1-material"
import { fetchCoverImage, type Game, loadCoverImage } from "./steamgriddb"
import {
  bannerTexture,
  carpetTexture,
  ceilingTexture,
  posterTexture,
  vhsAtlas,
  wallTexture,
} from "./textures"
import type { StoreLayout } from "./layout"
import { getStress, getTopple, TOPPLE_SECS } from "./topple"
import { VhsBoxes } from "./vhs"

export const ROOM_H = 4.2 // store + viewing-room ceiling height
export const ATLAS_COLS = 8
export const ATLAS_ROWS = 8

// A second room ("the viewing booth") behind the store's back wall, reached
// through a doorway. The store back wall is at z = -ROOM.d/2 (-22).
export const DOOR_HALF = 1.8 // doorway half-width
export const BACK_ROOM = {
  halfX: 7,
  zNear: -22, // store back wall is pinned here; the viewing room never scales with the library
  zFar: -37,
} // -22 .. -37
export const CONSOLE_POS = new THREE.Vector3(0, 0, -34)
// where the camera looks when a game loads ("sit down to watch")
export const TV_FOCUS = new THREE.Vector3(0, 2.0, BACK_ROOM.zFar + 1.66)

// A gondola shelf. Ram it head-on hard enough (see controls.tsx) and it tips
// over about its base edge; vhs.tsx spills this shelf's tapes onto the floor.
function Gondola({
  gi,
  gx,
  gondCenterZ,
  halfLen,
  levels,
  boardMat,
}: {
  gi: number
  gx: number
  gondCenterZ: number
  halfLen: number
  levels: number[]
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
    <group ref={ref} position={[gx, 0, gondCenterZ]}>
      {/* central backing */}
      <mesh position={[0, 1.6, 0]} material={boardMat}>
        <boxGeometry args={[0.1, 3.2, halfLen * 2]} />
      </mesh>
      {/* shelf boards under each level */}
      {levels.map(ly => (
        <mesh key={`b${ly}`} position={[0, ly, 0]} material={boardMat}>
          <boxGeometry args={[0.62, 0.06, halfLen * 2]} />
        </mesh>
      ))}
      {/* end caps */}
      {[-halfLen, halfLen].map(z => (
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
  games,
  layout,
}: {
  onHover?: (g: Game | null) => void
  onHeld?: (g: Game | null) => void
  onFlip?: (flipped: boolean) => void
  onPlay?: (g: Game | null) => void
  onNear?: (near: boolean) => void
  playing?: Game | null
  games: readonly Game[]
  layout: StoreLayout
}) {
  const { room, centerZ, backWallZ, frontWallZ, aisleXs, halfLen, levels, gondCenterZ } =
    layout
  const built = useMemo(() => {
    const carpet = carpetTexture()
    carpet.repeat.set(room.w / 2, room.d / 2)
    const wall = wallTexture()
    wall.repeat.set(room.w / 3, room.h / 3)
    const ceil = ceilingTexture()
    ceil.repeat.set(room.w / 2, room.d / 2)
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
  }, [room.w, room.d, room.h])

  const halfW = room.w / 2

  // ceiling light panels — two columns spaced evenly down the store's depth
  const lightRows = Math.max(2, Math.round(room.d / 8))
  const lightZs = Array.from({ length: lightRows }, (_, i) =>
    lightRows === 1
      ? centerZ
      : backWallZ + 3 + ((room.d - 6) * i) / (lightRows - 1),
  )
  const lightXs = [-halfW * 0.45, halfW * 0.45]

  // side-wall posters — a few down each wall within the store's depth
  const posterCount = Math.max(2, Math.min(4, Math.round(room.d / 7)))
  const posterZs = Array.from({ length: posterCount }, (_, i) =>
    posterCount === 1
      ? centerZ
      : backWallZ + 3.5 + ((room.d - 7) * i) / (posterCount - 1),
  )

  return (
    <group>
      {/* floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, centerZ]}
        material={built.floorMat}
      >
        <planeGeometry args={[room.w, room.d, room.w, room.d]} />
      </mesh>
      {/* ceiling */}
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, room.h, centerZ]}
        material={built.ceilMat}
      >
        <planeGeometry args={[room.w, room.d, room.w, room.d]} />
      </mesh>

      {/* back wall — split around a doorway to the viewing room */}
      {(() => {
        const seg = (halfW - DOOR_HALF) / 2 // width of each side segment
        const doorH = 2.6
        return (
          <>
            <mesh
              position={[-(DOOR_HALF + seg), room.h / 2, backWallZ]}
              material={built.wallMat}
            >
              <planeGeometry args={[seg * 2, room.h, 4, 4]} />
            </mesh>
            <mesh
              position={[DOOR_HALF + seg, room.h / 2, backWallZ]}
              material={built.wallMat}
            >
              <planeGeometry args={[seg * 2, room.h, 4, 4]} />
            </mesh>
            {/* header above the door */}
            <mesh
              position={[0, (doorH + room.h) / 2, backWallZ]}
              material={built.wallMat}
            >
              <planeGeometry args={[DOOR_HALF * 2, room.h - doorH, 2, 2]} />
            </mesh>
          </>
        )
      })()}
      {/* front wall (the entrance) */}
      <mesh
        position={[0, room.h / 2, frontWallZ]}
        rotation={[0, Math.PI, 0]}
        material={built.wallMat}
      >
        <planeGeometry args={[room.w, room.h, room.w, 4]} />
      </mesh>
      {/* side walls */}
      <mesh
        position={[-halfW, room.h / 2, centerZ]}
        rotation={[0, Math.PI / 2, 0]}
        material={built.wallMat}
      >
        <planeGeometry args={[room.d, room.h, room.d, 4]} />
      </mesh>
      <mesh
        position={[halfW, room.h / 2, centerZ]}
        rotation={[0, -Math.PI / 2, 0]}
        material={built.wallMat}
      >
        <planeGeometry args={[room.d, room.h, room.d, 4]} />
      </mesh>

      {/* ceiling light panels */}
      {lightZs.map(z =>
        lightXs.map(x => (
          <mesh
            key={`l${x}_${z}`}
            position={[x, room.h - 0.06, z]}
            rotation={[Math.PI / 2, 0, 0]}
            material={built.lightMat}
          >
            <planeGeometry args={[2.4, 1.0]} />
          </mesh>
        )),
      )}

      {/* gondolas: backing board + shelf boards + the VHS rows */}
      {aisleXs.map((gx, gi) => (
        <Gondola
          key={`g${gi}`}
          gi={gi}
          gx={gx}
          gondCenterZ={gondCenterZ}
          halfLen={halfLen}
          levels={levels}
          boardMat={built.boardMat}
        />
      ))}

      {/* VHS tapes — individual, pickable */}
      <VhsBoxes
        atlas={built.atlas}
        onHover={onHover}
        onHeld={onHeld}
        onFlip={onFlip}
        onPlay={onPlay}
        onNear={onNear}
        games={games}
        playing={playing ?? null}
        layout={layout}
      />

      {/* signage: door sign over the doorway + store name on the front wall */}
      <Banner
        text="◄ VIEWING ROOM"
        position={[0, 3.4, backWallZ + 0.06]}
        width={3.4}
      />
      <Banner
        text="BOXBUSTER"
        position={[0, 2.9, frontWallZ - 0.06]}
        rotation={[0, Math.PI, 0]}
        width={Math.min(12, room.w - 2)}
        bg="#c81d25"
        fg="#f2c100"
      />

      {/* side-wall posters */}
      {posterZs.map((z, i) => (
        <Poster
          key={`pl${i}`}
          seed={i + 1}
          position={[-halfW + 0.06, 2.1, z]}
          rotation={[0, Math.PI / 2, 0]}
        />
      ))}
      {posterZs.map((z, i) => (
        <Poster
          key={`pr${i}`}
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
        position={[0, ROOM_H, cz]}
        material={built.ceilMat}
      >
        <planeGeometry args={[w, d, w, d]} />
      </mesh>
      {/* left / right / far walls */}
      <mesh
        position={[-BACK_ROOM.halfX, ROOM_H / 2, cz]}
        rotation={[0, Math.PI / 2, 0]}
        material={built.wallMat}
      >
        <planeGeometry args={[d, ROOM_H, d, 4]} />
      </mesh>
      <mesh
        position={[BACK_ROOM.halfX, ROOM_H / 2, cz]}
        rotation={[0, -Math.PI / 2, 0]}
        material={built.wallMat}
      >
        <planeGeometry args={[d, ROOM_H, d, 4]} />
      </mesh>
      <mesh position={[0, ROOM_H / 2, BACK_ROOM.zFar]} material={built.wallMat}>
        <planeGeometry args={[w, ROOM_H, w, 4]} />
      </mesh>
      {/* dim ceiling lights so the room + console are visible before the TV is on */}
      {[cz + 4.5, cz - 3].map(z => (
        <mesh
          key={z}
          position={[0, ROOM_H - 0.06, z]}
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
    const imagePromise = playing.coverUrl
      ? loadCoverImage(playing.coverUrl).catch(() => null)
      : fetchCoverImage(playing.title)

    imagePromise.then(img => {
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
