import { Option } from "effect"

/**
 * Bundle a tagged union's case list with its matcher.
 *
 * `.tags` is the single source of truth a preview, gallery, or test reads to
 * enumerate the states a value can be in — it never keeps its own hand-written
 * copy. `.select(tag)` narrows a value to one case as an `Option`.
 *
 * This is the shared shape that domain state models (catalog, launch, …) build
 * on; each model still owns its own `fromResult`/constructors and adds whatever
 * domain refinements it needs. See the "State modeling" standard and the lattice
 * react skill.
 */
export interface StateMachine<S extends { readonly _tag: string }> {
  readonly tags: readonly S["_tag"][]
  readonly select: <Tag extends S["_tag"]>(
    tag: Tag,
  ) => (state: S) => Option.Option<Extract<S, { readonly _tag: Tag }>>
}

export const stateMachine = <S extends { readonly _tag: string }>(
  tags: readonly S["_tag"][],
): StateMachine<S> => ({
  tags,
  select:
    <Tag extends S["_tag"]>(tag: Tag) =>
    (state: S): Option.Option<Extract<S, { readonly _tag: Tag }>> =>
      state._tag === tag
        ? Option.some(state as Extract<S, { readonly _tag: Tag }>)
        : Option.none(),
})
