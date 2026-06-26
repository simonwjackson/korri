import { PointerLockControls } from "@react-three/drei"
import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import type { StoreMap } from "./map"
import { BACK_ROOM } from "./scene"
import { getTopple, setStress, startTopple } from "./topple"

const EYE = 1.55
const SPEED = 4.2
const PLAYER_R = 0.4
const M = 0.6 // wall margin
const MIN_PUSH = 0.5 // how head-on you must be (0..~1.4) for a shove to count
const SHOVE_TO_TOPPLE = 1.4 // seconds of solid head-on shoving before it goes over
const SHOVE_DECAY = 2.5 // how fast the charge bleeds off once you ease up

// Navigation derived from the store MAP: gondola blockers (across all rooms) and
// the walkable region (every room rect ∪ archway passages ∪ the viewing room).
function buildNav(map: StoreMap) {
  const blockers = map.gondolas.map(g => ({
    gi: g.gi,
    minX: g.x - 0.5 - PLAYER_R,
    maxX: g.x + 0.5 + PLAYER_R,
    minZ: g.zc - g.half - 0.5 - PLAYER_R,
    maxZ: g.zc + g.half + 0.5 + PLAYER_R,
  }))
  const gondolaAt = (x: number, z: number): number => {
    for (const b of blockers) {
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return b.gi
    }
    return -1
  }
  const blocked = (x: number, z: number): boolean => {
    const gi = gondolaAt(x, z)
    return gi >= 0 && !getTopple(gi) // a toppled shelf no longer blocks the floor
  }
  const walkable = (x: number, z: number): boolean => {
    for (const r of map.walkRects) {
      if (x > r.minX + M && x < r.maxX - M && z > r.minZ + M && z < r.maxZ - M)
        return true
    }
    // viewing room (fixed, behind the hub)
    return (
      Math.abs(x) < BACK_ROOM.halfX - M &&
      z < BACK_ROOM.zNear - M &&
      z > BACK_ROOM.zFar + M
    )
  }
  const allowed = (x: number, z: number) => walkable(x, z) && !blocked(x, z)
  return { gondolaAt, allowed }
}

export function FirstPerson({
  focus,
  embedded = false,
  map,
  moveTarget,
}: {
  focus?: THREE.Vector3 | null
  embedded?: boolean
  map: StoreMap
  moveTarget: { current: { x: number; z: number } | null }
}) {
  const { camera, gl } = useThree()
  const keys = useRef<Record<string, boolean>>({})
  const fwd = useRef(new THREE.Vector3())
  const right = useRef(new THREE.Vector3())
  const aim = useRef<THREE.Vector3 | null>(null) // active "sit down to watch" target
  const mat = useMemo(() => new THREE.Matrix4(), [])
  const desired = useMemo(() => new THREE.Quaternion(), [])
  const nav = useMemo(() => buildNav(map), [map])
  const shove = useRef(0) // accumulated shove against shoveGi
  const shoveGi = useRef(-1) // which shelf we're currently leaning on

  // begin a brief auto-aim whenever a new focus target arrives (a game loads)
  useEffect(() => {
    if (focus) aim.current = focus
  }, [focus])

  useEffect(() => {
    camera.position.set(map.camStart.x, EYE, map.camStart.z)
    ;(window as unknown as { __cam?: THREE.Camera }).__cam = camera // dev hook

    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true
    }
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [camera, map.camStart.x, map.camStart.z])

  // Embedded mode (e.g. theme-workshop): no global pointer-lock — it would
  // hijack the whole window and block surrounding widgets. Drag-to-look instead,
  // captured to the canvas, so clicks outside it still reach the host chrome.
  useEffect(() => {
    if (!embedded) return
    const el = gl.domElement
    const euler = new THREE.Euler(0, 0, 0, "YXZ")
    let dragging = false
    let px = 0
    let py = 0
    // pointerdown starts a drag on the canvas; move/up live on window so the
    // look keeps tracking even if the cursor leaves the canvas mid-drag. When
    // not dragging, the window handlers early-out, so host clicks are untouched.
    const onDown = (e: PointerEvent) => {
      dragging = true
      px = e.clientX
      py = e.clientY
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - px
      const dy = e.clientY - py
      px = e.clientX
      py = e.clientY
      euler.setFromQuaternion(camera.quaternion)
      euler.y -= dx * 0.0028
      euler.x -= dy * 0.0028
      euler.x = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, euler.x),
      )
      camera.quaternion.setFromEuler(euler)
    }
    const onUp = () => {
      dragging = false
    }
    el.addEventListener("pointerdown", onDown)
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      el.removeEventListener("pointerdown", onDown)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [embedded, gl, camera])

  useFrame((_, dt) => {
    // "sit down to watch": ease the look toward the TV, release once aligned
    if (aim.current) {
      mat.lookAt(camera.position, aim.current, camera.up)
      desired.setFromRotationMatrix(mat)
      camera.quaternion.slerp(desired, 1 - 0.0008 ** dt)
      if (camera.quaternion.angleTo(desired) < 0.02) aim.current = null
    }

    const k = keys.current
    const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)
    const s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0)

    // tap-to-move (point-and-go): glide toward the tapped spot until reached or
    // blocked. Any manual steering (WASD) cancels it.
    if (f !== 0 || s !== 0) {
      moveTarget.current = null
    } else if (moveTarget.current) {
      const tgt = moveTarget.current
      const dx = tgt.x - camera.position.x
      const dz = tgt.z - camera.position.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.5) {
        moveTarget.current = null
      } else {
        const step = Math.min(dt, 0.05) * SPEED
        let nx = camera.position.x + (dx / dist) * step
        let nz = camera.position.z + (dz / dist) * step
        if (!nav.allowed(nx, camera.position.z)) nx = camera.position.x
        if (!nav.allowed(nx, nz)) nz = camera.position.z
        if (
          Math.abs(nx - camera.position.x) < 1e-4 &&
          Math.abs(nz - camera.position.z) < 1e-4
        ) {
          moveTarget.current = null // wedged against something — stop
        } else {
          camera.position.x = nx
          camera.position.z = nz
          camera.position.y = EYE
        }
      }
    }

    if (f === 0 && s === 0) {
      // standing still: bleed off any shove charge so the shelf settles back
      if (shoveGi.current >= 0) {
        shove.current = Math.max(0, shove.current - dt * SHOVE_DECAY)
        setStress(shoveGi.current, shove.current / SHOVE_TO_TOPPLE)
        if (shove.current === 0) shoveGi.current = -1
      }
      return
    }

    camera.getWorldDirection(fwd.current)
    fwd.current.y = 0
    fwd.current.normalize()
    right.current.crossVectors(fwd.current, camera.up).normalize()

    const step = Math.min(dt, 0.05) * SPEED
    const moveX = fwd.current.x * f + right.current.x * s
    let nx = camera.position.x + moveX * step
    let nz =
      camera.position.z + (fwd.current.z * f + right.current.z * s) * step

    // A shelf only topples under a *sustained* head-on shove — a brief bump
    // bounces off, and it visibly wobbles first as a warning. Tapes react to
    // the topple in vhs.tsx.
    const giHit = nav.gondolaAt(nx, camera.position.z)
    const shoving =
      giHit >= 0 &&
      !getTopple(giHit) &&
      Math.abs(moveX) > MIN_PUSH &&
      !nav.allowed(nx, camera.position.z) // pressed up against it, not sliding by
    if (shoving) {
      if (shoveGi.current !== giHit) {
        if (shoveGi.current >= 0) setStress(shoveGi.current, 0)
        shoveGi.current = giHit
        shove.current = 0
      }
      shove.current += Math.abs(moveX) * dt
      setStress(giHit, shove.current / SHOVE_TO_TOPPLE)
      if (shove.current >= SHOVE_TO_TOPPLE) {
        startTopple(giHit, Math.sign(moveX))
        shove.current = 0
        shoveGi.current = -1
      }
    } else if (shoveGi.current >= 0) {
      // moving, but no longer into that shelf: bleed the charge back down
      shove.current = Math.max(0, shove.current - dt * SHOVE_DECAY)
      setStress(shoveGi.current, shove.current / SHOVE_TO_TOPPLE)
      if (shove.current === 0) shoveGi.current = -1
    }

    // per-axis resolve against walls/gondolas so you slide along surfaces
    if (!nav.allowed(nx, camera.position.z)) nx = camera.position.x
    if (!nav.allowed(nx, nz)) nz = camera.position.z

    camera.position.x = nx
    camera.position.z = nz
    camera.position.y = EYE
  })

  return embedded ? null : <PointerLockControls />
}
