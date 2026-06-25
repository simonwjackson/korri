import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { createPS1Material } from "./ps1-material"
import {
  ATLAS_COLS,
  ATLAS_ROWS,
  CONSOLE_POS,
  GONDOLA_X,
  GONDOLA_Z,
  LEVELS,
  ROOM,
} from "./scene"
import type { Game } from "./steamgriddb"
import { COVER_RATIO, gameBackAtlas } from "./textures"
import { getTopple, TOPPLE_SECS, toppledGondolas } from "./topple"

const REACH = 3.0 // how close you must be to grab a tape
const CONSOLE_RANGE = 2.6 // how close to the console to insert/eject
const SHELF_SPAN = 3.5 // how far a toppled shelf lies along the floor (≈ its height)
const AXIS_Y = new THREE.Vector3(0, 1, 0)
const AXIS_Z = new THREE.Vector3(0, 0, 1)

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// Remap one face's UVs onto atlas cell (rx,ry). BoxGeometry builds faces in
// order px,nx,py,ny,pz,nz (4 verts each): +X (front) = verts 0..3, -X (back) =
// verts 4..7. The (1 - (ry+1)/rows) accounts for THREE's flipY.
function remapFace(
  geo: THREE.BoxGeometry,
  face: 0 | 1,
  rx: number,
  ry: number,
) {
  const uv = geo.attributes.uv as THREE.BufferAttribute
  const u0 = rx / ATLAS_COLS
  const v0 = 1 - (ry + 1) / ATLAS_ROWS
  const start = face * 4
  for (let i = start; i < start + 4; i++) {
    uv.setXY(i, u0 + uv.getX(i) / ATLAS_COLS, v0 + uv.getY(i) / ATLAS_ROWS)
  }
  uv.needsUpdate = true
}

interface Tape {
  geo: THREE.BoxGeometry
  base: THREE.Vector3 // its shelf slot
  game: Game
  gi: number // which gondola (index into GONDOLA_X) this tape sits on
  // where the tape currently rests when not held (shelf slot, or dropped on floor)
  home: { pos: THREE.Vector3; quat: THREE.Quaternion; dropped: boolean }
}

export function VhsBoxes({
  atlas,
  onHover,
  onHeld,
  onFlip,
  onPlay,
  onNear,
  games,
  playing,
}: {
  atlas: THREE.Texture
  onHover?: (g: Game | null) => void
  onHeld?: (g: Game | null) => void
  onFlip?: (flipped: boolean) => void
  onPlay?: (g: Game | null) => void
  onNear?: (near: boolean) => void
  games: readonly Game[]
  playing: Game | null
}) {
  const { camera, raycaster } = useThree()
  // [+X front cover, -X back details, +Y, -Y, +Z, -Z edges] — matches BoxGeometry groups
  const mats = useMemo(() => {
    const cover = createPS1Material({ map: atlas })
    const back = createPS1Material({
      map: gameBackAtlas(ATLAS_COLS, ATLAS_ROWS),
    })
    const edge = createPS1Material({ color: "#0d0d10" })
    return [cover, back, edge, edge, edge, edge]
  }, [atlas])

  // Individual boxes (not merged) so each tape is its own pickable object.
  // Each shelf slot holds a tape facing EACH aisle (back-to-back), so you always
  // see a front cover whichever side of the gondola you're on.
  const tapes = useMemo<Tape[]>(() => {
    const list: Tape[] = []
    if (games.length === 0) return list
    GONDOLA_X.forEach((gx, gi) => {
      LEVELS.forEach((ly, li) => {
        const r = rng(gi * 100 + li * 7 + 3)
        const spacing = 0.46
        const count = Math.floor((GONDOLA_Z * 2) / spacing)
        for (let i = 0; i < count; i++) {
          const z = -GONDOLA_Z + 0.4 + i * spacing
          const h = 0.6 + r() * 0.08
          const w = h * COVER_RATIO // 2:3 cover face (matches SteamGridDB art)
          for (const side of [1, -1] as const) {
            if (r() < 0.08) continue // independent gap per side
            const rx = (r() * ATLAS_COLS) | 0
            const ry = (r() * ATLAS_ROWS) | 0
            const game = games[(ry * ATLAS_COLS + rx) % games.length]
            if (!game) continue
            const geo = new THREE.BoxGeometry(0.15, h, w)
            remapFace(geo, 0, rx, ry) // front cover (+X)
            remapFace(geo, 1, rx, ry) // back details (-X)
            const base = new THREE.Vector3(
              gx + side * 0.095,
              ly + h / 2,
              z + (r() - 0.5) * 0.04,
            )
            // the -X-side tape is turned 180° so its front cover faces that aisle
            const quat = new THREE.Quaternion()
            if (side < 0) quat.setFromAxisAngle(AXIS_Y, Math.PI)
            list.push({
              geo,
              base,
              game,
              gi,
              home: { pos: base.clone(), quat, dropped: false },
            })
          }
        }
      })
    })
    return list
  }, [games])

  const meshes = useRef<THREE.Mesh[]>([])
  const hovered = useRef(-1)
  const held = useRef(-1)
  const inserted = useRef(-1) // tape index loaded in the console
  const near = useRef(false) // within range of the console
  const flipped = useRef(false) // showing the back?
  const flipAngle = useRef(0) // animated 0..PI
  const dir = useMemo(() => new THREE.Vector3(), [])
  const off = useMemo(() => new THREE.Vector3(), [])

  // shelves already handled, and the tapes currently mid-spill to the floor
  const handledTopple = useRef(new Set<number>())
  const fallingMeshes = useRef(new Set<THREE.Mesh>())
  const falling = useRef<
    {
      idx: number
      t: number
      from: THREE.Vector3
      fromQ: THREE.Quaternion
      to: THREE.Vector3
      toQ: THREE.Quaternion
    }[]
  >([])

  const nearConsole = () => {
    const dx = camera.position.x - CONSOLE_POS.x
    const dz = camera.position.z - CONSOLE_POS.z
    return dx * dx + dz * dz < CONSOLE_RANGE * CONSOLE_RANGE
  }

  useEffect(() => {
    ;(window as unknown as { __tapes?: THREE.Mesh[] }).__tapes = meshes.current // dev hook
    // apply each tape's resting transform (esp. the 180° turn on -X-side tapes)
    tapes.forEach((tp, i) => {
      const m = meshes.current[i]
      if (m) {
        m.position.copy(tp.home.pos)
        m.quaternion.copy(tp.home.quat)
      }
    })
  }, [tapes])

  // pick up the looked-at tape, or put the held one back. One-shot listener
  // setup that reads live refs/props; re-running on dep changes would rebind the
  // key/click handlers each frame.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot listener setup; reads live refs, must bind once.
  useEffect(() => {
    const toggle = () => {
      if (held.current >= 0) {
        // at the console: load the tape instead of setting it down
        if (nearConsole()) {
          const idx = held.current
          meshes.current[idx].visible = false // it's in the console now
          inserted.current = idx
          held.current = -1
          flipped.current = false
          flipAngle.current = 0
          onHeld?.(null)
          onFlip?.(false)
          onPlay?.(tapes[idx].game)
          return
        }
        // otherwise set it down on the floor (never teleport it back to a shelf)
        drop()
      } else if (inserted.current >= 0 && nearConsole()) {
        // eject the loaded tape back into your hands
        const idx = inserted.current
        meshes.current[idx].visible = true
        inserted.current = -1
        held.current = idx
        onPlay?.(null)
        onHeld?.(tapes[idx].game)
        hovered.current = -1
        onHover?.(null)
      } else if (playing && nearConsole()) {
        onPlay?.(null)
      } else if (hovered.current >= 0) {
        held.current = hovered.current
        onHeld?.(tapes[held.current].game)
        hovered.current = -1
        onHover?.(null)
      }
    }
    const flip = () => {
      if (held.current >= 0) {
        flipped.current = !flipped.current
        onFlip?.(flipped.current)
      }
    }
    const drop = () => {
      if (held.current < 0) return
      const idx = held.current
      const tp = tapes[idx]
      camera.getWorldDirection(dir)
      dir.y = 0
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1)
      dir.normalize()
      // lay it flat on the floor a step ahead, facing your walking direction
      tp.home.pos.set(
        camera.position.x + dir.x * 0.9,
        0.09,
        camera.position.z + dir.z * 0.9,
      )
      const q = new THREE.Quaternion().setFromAxisAngle(AXIS_Z, Math.PI / 2) // cover faces up
      q.premultiply(
        new THREE.Quaternion().setFromAxisAngle(
          AXIS_Y,
          Math.atan2(dir.x, dir.z),
        ),
      )
      tp.home.quat.copy(q)
      tp.home.dropped = true
      const m = meshes.current[idx]
      m.position.copy(tp.home.pos)
      m.quaternion.copy(tp.home.quat)
      m.scale.setScalar(1)
      held.current = -1
      flipped.current = false
      flipAngle.current = 0
      hovered.current = -1
      onHeld?.(null)
      onFlip?.(false)
      onHover?.(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyE" || e.code === "KeyF") toggle()
      else if (e.code === "KeyR") flip()
      else if (e.code === "KeyG") drop()
    }
    const onDown = (e: MouseEvent) => {
      if (e.button === 0) toggle()
      else if (e.button === 2) flip() // right-click flips
    }
    const onCtx = (e: Event) => e.preventDefault() // suppress context menu
    window.addEventListener("keydown", onKey)
    window.addEventListener("mousedown", onDown)
    window.addEventListener("contextmenu", onCtx)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("contextmenu", onCtx)
    }
  }, [tapes, onHeld, onHover, onFlip, onPlay, playing])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime

    // report console proximity (only on change)
    const n = nearConsole()
    if (n !== near.current) {
      near.current = n
      onNear?.(n)
    }

    // --- a toppled shelf spills its tapes onto the floor ---
    for (const gi of toppledGondolas()) {
      if (handledTopple.current.has(gi)) continue
      handledTopple.current.add(gi)
      const ent = getTopple(gi)
      if (!ent) continue
      tapes.forEach((tp, i) => {
        if (tp.gi !== gi) return
        if (held.current === i || inserted.current === i) return
        const m = meshes.current[i]
        if (!m || !m.visible) return
        // fling the games CLEAR — land them beyond where the toppled shelf
        // comes to rest (it lies ≈ SHELF_SPAN deep), fanned along its length, so
        // they end up strewn in front of the fallen shelf instead of under it
        const beyond = SHELF_SPAN + 0.5 + Math.random() * 2.2
        const to = new THREE.Vector3(
          THREE.MathUtils.clamp(
            GONDOLA_X[gi] + ent.dirSign * beyond,
            -ROOM.w / 2 + 0.7,
            ROOM.w / 2 - 0.7,
          ),
          0.09,
          THREE.MathUtils.clamp(
            tp.base.z + (Math.random() - 0.5) * 3,
            -ROOM.d / 2 + 0.7,
            ROOM.d / 2 - 0.7,
          ),
        )
        const toQ = new THREE.Quaternion()
          .setFromAxisAngle(AXIS_Z, Math.PI / 2) // cover faces up
          .premultiply(
            new THREE.Quaternion().setFromAxisAngle(
              AXIS_Y,
              Math.random() * Math.PI * 2,
            ),
          )
        tp.home.pos.copy(to)
        tp.home.quat.copy(toQ)
        tp.home.dropped = true
        falling.current.push({
          idx: i,
          t: 0,
          from: m.position.clone(),
          fromQ: m.quaternion.clone(),
          to,
          toQ,
        })
        fallingMeshes.current.add(m)
        if (hovered.current === i) hovered.current = -1
      })
    }
    if (falling.current.length > 0) {
      const rate = dt / TOPPLE_SECS
      for (const fo of falling.current) {
        fo.t = Math.min(1, fo.t + rate)
        const m = meshes.current[fo.idx]
        if (!m) continue
        const e = fo.t * fo.t // easeIn — accelerate as it drops
        m.position.lerpVectors(fo.from, fo.to, e)
        m.position.y += Math.sin(fo.t * Math.PI) * 0.7 // arc up and over the shelf
        m.quaternion.slerpQuaternions(fo.fromQ, fo.toQ, e)
        m.scale.setScalar(1)
      }
      falling.current = falling.current.filter(fo => {
        if (fo.t < 1) return true
        const m = meshes.current[fo.idx]
        if (m) fallingMeshes.current.delete(m)
        return false
      })
    }

    // --- holding: carry the tape low/aside; raise it to inspect when flipped ---
    if (held.current >= 0) {
      const m = meshes.current[held.current]
      const target = flipped.current ? Math.PI : 0
      flipAngle.current += (target - flipAngle.current) * Math.min(1, dt * 9)
      const f = flipAngle.current / Math.PI // 0 = carry, 1 = inspect
      const fwd = THREE.MathUtils.lerp(0.85, 0.6, f) // distance ahead
      const downV = THREE.MathUtils.lerp(0.26, 0.05, f) // tucked low while carrying
      const rightV = THREE.MathUtils.lerp(0.18, 0.0, f) // off to the side while carrying
      const scl = THREE.MathUtils.lerp(0.68, 1.05, f)
      const wobble = flipped.current ? 0.05 : 0.14
      // place relative to the camera basis (local -Z is forward)
      off
        .set(rightV, -downV + Math.sin(t * 1.5) * 0.01, -fwd)
        .applyQuaternion(camera.quaternion)
      m.position.copy(camera.position).add(off)
      m.quaternion.copy(camera.quaternion)
      // -PI/2 puts +X (front cover) toward you; +PI/2 (flipped) shows the back
      m.rotateY(-Math.PI / 2 + flipAngle.current + Math.sin(t * 0.8) * wobble)
      m.rotateX(Math.sin(t * 0.6) * 0.05)
      m.scale.setScalar(scl)
      return
    }

    // --- aiming: raycast from screen centre, pop the tape you're looking at ---
    camera.getWorldDirection(dir)
    raycaster.set(camera.position, dir)
    raycaster.far = REACH
    const candidates = meshes.current.filter(
      m => m?.visible && !fallingMeshes.current.has(m),
    )
    const hit = raycaster.intersectObjects(candidates, false)[0]
    const idx = hit ? meshes.current.indexOf(hit.object as THREE.Mesh) : -1

    if (idx !== hovered.current) {
      if (hovered.current >= 0) {
        const p = meshes.current[hovered.current]
        const hm = tapes[hovered.current].home
        p.position.copy(hm.pos)
        p.quaternion.copy(hm.quat)
        p.scale.setScalar(1)
      }
      hovered.current = idx
      onHover?.(idx >= 0 ? tapes[idx].game : null)
    }

    if (idx >= 0) {
      const m = meshes.current[idx]
      const hm = tapes[idx].home
      const pulse = 1.06 + Math.sin(t * 6) * 0.02
      if (hm.dropped) {
        // a dropped tape just lifts a touch off the floor
        m.position.set(hm.pos.x, hm.pos.y + 0.06, hm.pos.z)
        m.quaternion.copy(hm.quat)
      } else {
        // a shelved tape pops out toward your aisle
        const gx = tapes[idx].base.x
        const sign = Math.sign(camera.position.x - gx) || 1
        m.position.set(
          gx + sign * 0.12,
          tapes[idx].base.y + 0.03,
          tapes[idx].base.z,
        )
        m.quaternion.copy(hm.quat)
      }
      m.scale.setScalar(pulse)
    }
  })

  return (
    <group>
      {tapes.map((tape, i) => (
        <mesh
          key={`${tape.base.x}:${tape.base.y}:${tape.base.z}`}
          ref={el => {
            if (el) meshes.current[i] = el
          }}
          geometry={tape.geo}
          material={mats}
          position={tape.base}
        />
      ))}
    </group>
  )
}
