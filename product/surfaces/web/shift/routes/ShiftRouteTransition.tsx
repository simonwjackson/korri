/**
 * Shift route transition — directional push/pop between pages.
 *
 * Wraps the routed Outlet so navigating deeper (Home → Library → Detail) slides
 * the incoming page in from the right with a fade, and going back (East/history
 * pop) slides it in from the left. Direction comes from route depth, so it
 * tracks the hierarchy rather than guessing from history internals.
 *
 * Only the incoming page animates. TanStack's Outlet always renders the current
 * match, so an exiting clone would re-render the NEW route (and <Match> throws
 * for a pruned match), which would corrupt an outgoing slide. Animating the
 * entry over the surface-colored stage keeps it robust and — because the old
 * page unmounts immediately — sidesteps the DOM-focus double-mount that would
 * otherwise let the spatial engine focus a page on its way out.
 */
import { Outlet, useRouterState } from "@tanstack/react-router"
import {
  motion,
  type Transition,
  useReducedMotion,
  type Variants,
} from "framer-motion"
import { useEffect, useRef } from "react"
import { shiftRouteDepth, shiftSlideDirection } from "./shift-route-depth"

export function ShiftRouteTransition() {
  const pathname = useRouterState({ select: state => state.location.pathname })
  const reduce = useReducedMotion()

  const depth = shiftRouteDepth(pathname)
  const prevDepth = useRef(depth)
  const direction = shiftSlideDirection(prevDepth.current, depth)
  useEffect(() => {
    prevDepth.current = depth
  }, [depth])

  // Skip the entrance on the very first paint (app boot) so home doesn't slide
  // in from nowhere; every later navigation animates.
  const booted = useRef(false)
  const initial = booted.current ? "enter" : false
  useEffect(() => {
    booted.current = true
  }, [])

  const offset = reduce ? 0 : 22
  const variants: Variants = {
    enter: (dir: number) => ({
      opacity: 0,
      x: `${dir < 0 ? -offset : offset}%`,
    }),
    center: { opacity: 1, x: "0%" },
  }
  const transition: Transition = reduce
    ? { duration: 0.16, ease: "easeOut" }
    : {
        type: "spring",
        stiffness: 340,
        damping: 36,
        mass: 0.9,
        opacity: { duration: 0.24, ease: "easeOut" },
      }

  return (
    <div className="shift-route-stage">
      <motion.div
        key={pathname}
        className="h-full w-full"
        custom={direction}
        variants={variants}
        initial={initial}
        animate="center"
        transition={transition}
      >
        <Outlet />
      </motion.div>
    </div>
  )
}
