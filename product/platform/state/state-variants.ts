import type { StateMachine } from "./state-machine"

/**
 * Derive one labeled variant per state from a state machine's `.tags`.
 *
 * This is the bridge from "a value is always one of these tagged cases" to
 * "show/test every one of those cases" — without anyone hand-listing the states
 * a second time. `produce` is keyed by EVERY tag in the union, so the type
 * checker refuses to compile when a state is missing: a gallery or test built on
 * this can never silently skip a state, and adding a new case to the machine
 * forces every consumer to handle it.
 *
 * The variant value is generic (`V`) — a React node, a props object, a seeded
 * input — so this stays framework-agnostic and lives next to the machine itself.
 * The per-tag producer is the one irreducible bit of taste (what a state should
 * look like); the *enumeration* is derived.
 */
export interface StateVariant<Tag extends string, V> {
  readonly tag: Tag
  readonly label: string
  readonly value: V
}

/** Default label: split a PascalCase tag into words ("LoadError" -> "Load error"). */
export function humanizeTag(tag: string): string {
  const spaced = tag.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

export function stateVariants<Tag extends string, V>(
  source: Pick<StateMachine<{ readonly _tag: Tag }>, "tags">,
  produce: { readonly [K in Tag]: () => V },
  options?: { readonly label?: (tag: Tag) => string },
): readonly StateVariant<Tag, V>[] {
  return source.tags.map(tag => ({
    tag,
    label: options?.label?.(tag) ?? humanizeTag(tag),
    value: produce[tag](),
  }))
}
