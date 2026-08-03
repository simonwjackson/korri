/**
 * Shift — the public entry point.
 *
 * Two ways in, one implementation:
 *   - `shiftSurface` satisfies the framework-agnostic `KorriSurface` treaty, so
 *     a host can mount Shift without knowing it is React.
 *   - `ShiftSurface` is the React component, for a host that already renders
 *     React and wants Shift inside its own tree.
 *
 * Nothing else is exported. Everything below this file is Shift's business and
 * may change without a host caring.
 */
export { ShiftSurface, type ShiftSurfaceProps } from "./ShiftSurface"
export { shiftSurface } from "./mount"
import "./shift.css"
