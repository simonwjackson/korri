---
title: Snap, don't slide — motion timing for "attached" UI affordances
date: 2026-05-01
category: best-practices
module: korri/shared/design-system + ui-motion
problem_type: best_practice
component: tooling
severity: low
applies_when:
  - Building UI where one element should appear "owned by" or "attached to" another (caption under a tile, label next to a node, badge on an item, tooltip above a control)
  - The owning target updates instantly when state changes (focus, selection, hover, active row) and a paired element needs to follow it
  - Tempted to add `transition: transform Nms` to make the paired element "smoothly track" its target across position changes
  - Designing motion for paired UI elements that should read as one connected unit
related_components:
  - frontend_stimulus
tags:
  - motion-design
  - css-transitions
  - focus
  - spatial-navigation
  - ui-attachment
  - paired-elements
  - tilegrid
---

# Snap, don't slide — motion timing for "attached" UI affordances

## Context

The Sunlit home-screen exploration has a caption block below a horizontal rail of game tiles. The caption shows the focused tile's title (and a relative-time chip when the resume target is focused). The product brief said "the caption should feel attached to the focused tile."

The first implementation was the obvious one: caption sits below the rail, on focus change the caption's `transform: translateX(...)` updates to align with the focused tile's left edge, and a `transition: transform 280ms ease` smooths the move. Geometry was correct. Motion was wrong.

The user feedback was immediate and clear: *"the transition is very awkward, can we make it instant."* Removing the transition produced an instant snap to the new position. That read as attached. The slide had not.

This was counterintuitive — smooth animation usually reads as "polished." The first reflex when implementing "follow the target" is to animate. That reflex is wrong here, and it's worth understanding why.

## Guidance

**Paired UI elements should share timing characteristics with their partner.** When one element updates instantly, the element attached to it should also update instantly. When one element animates, the attached element should animate with the same easing and duration.

For "attached" affordances tied to a focusable or selectable target:

- The target's state cue (focus halo, selection ring, hover lift) almost always transitions in tens of milliseconds or instantly. Match that.
- The attached element's **position** updates should be **instantaneous** — the same frame as the target's state change.
- The attached element's **content** (text, icons) can crossfade or otherwise animate to signal the content has changed, because that's a different message than position.

```css
/* Attached caption that tracks a focused tile. */
.sunlit-caption {
  /* No transition on transform. Position snaps to the new target the
     same frame the focus halo appears on it. */
  /* transition: transform 280ms ease; */  /* ❌ reads as chasing */
}

/* Inner content can still crossfade — it's signaling 'content updated',
   not 'position changed'. The two messages are independent. */
.sunlit-caption-text {
  animation: caption-cross 220ms ease-out;
}
@keyframes caption-cross {
  from { opacity: 0; transform: translateY(2px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

The position update is set from JS (`style={{ transform: \`translateX(${captionX}px)\` }}`) and snaps because there's no CSS transition listed for `transform`. The text crossfade is a separate keyframe on a re-keyed inner element.

## Why This Matters

The mistake is reaching for `transition: transform Nms` because "smooth = polished." Three things go wrong:

1. **Temporal mismatch breaks the bond.** The focused tile's halo, ring, glow, or scale change is essentially instantaneous (often `transition: 180ms` but the visual switchover happens on the first few frames). If the caption animates over 280ms, it's *late* relative to the halo. For ~250ms there is a state where the halo is on tile B but the caption is still over tile A. Your eye reads that as two unrelated elements that happen to be near each other, not as one attached unit.

2. **Sliding turns the eye into a chaser.** Animation directs attention. A caption that visibly travels from old position to new position invites your eye to track its motion. Tracking motion is the opposite of "this caption belongs there" — it's "this caption is going there." The journey, not the destination, becomes the message.

3. **Snap matches the partner's instantaneity.** When the halo flashes onto the new tile and the caption is *already there*, both elements share a single update frame. They read as one event: "tile X is now selected, here is its label." Snap is not the absence of polish — it is *temporal coupling*, and temporal coupling is what "attached" actually means.

A useful test: after removing the transition, does the caption read as *more* attached, not less? If yes, the slide was creating chase semantics, not polish. If the snap reads as jarring (e.g., the caption jumps a long distance and the user loses track), the answer isn't "add the slide back" — it's usually that the surrounding context lacks a paired state cue (focus halo, scroll position) to anchor where the caption went, or the underlying interaction itself moves too far in one step.

There are real cases where animated tracking is correct — but they're not "attached" cases:

- **Reordering** (a list item moves to a new index because the user reordered, not because they selected something). The motion *is* the message.
- **Continuous gesture-following** (a tooltip following the mouse during drag). Position is the message because the user is producing it directly.
- **Entering / leaving** (the element appearing or disappearing, not changing which target it belongs to).

The discriminator: ask whether the motion *is* the message, or whether the motion is decorating a state change that has its own message. If the latter, the decoration competes with the message and loses.

## When to Apply

- Captions, labels, or callouts paired with a focusable / selectable target where focus or selection drives which target the paired element belongs to.
- Selection rings, highlights, badges, or annotations attached to a list item, grid cell, graph node, or table row.
- Spotlight / focus indicators that follow the active element across an array of similar elements.
- Tooltips and popovers that re-anchor when their target changes (not when the mouse moves continuously over a single target).
- Any "is-attached-to-X" UI where X is determined by a fast state cue (focus, selection, hover-active).

In each case: the position update should match the timing of the underlying state cue. If the state cue is instant, the position update is instant. The polish goes into the *content* of the paired element (crossfade, fade-in, content morph) and the *target's state cue* (halo, ring, lift), not into the journey of the paired element.

## Examples

### The Sunlit caption (the case this learning came from)

```tsx
function HomeSunlit() {
  const [focusedId, setFocusedId] = useState(resumeTarget.id)
  const [captionX, setCaptionX] = useState(0)
  const railRef = useRef<HTMLDivElement | null>(null)

  // Recompute caption x-offset on focus change, rail scroll, window resize.
  useEffect(() => {
    const region = railRef.current
    if (!region) return
    const compute = () => {
      const tile = region.querySelector<HTMLElement>(
        `[data-tile-id="${CSS.escape(focusedId)}"]`,
      )
      if (!tile) return
      const tileRect = tile.getBoundingClientRect()
      const regionRect = region.getBoundingClientRect()
      const paddingLeft =
        Number.parseFloat(getComputedStyle(region).paddingLeft) || 0
      setCaptionX(Math.round(tileRect.left - regionRect.left - paddingLeft))
    }
    compute()
    region.addEventListener("scroll", compute, { capture: true, passive: true })
    window.addEventListener("resize", compute)
    return () => {
      region.removeEventListener("scroll", compute, true)
      window.removeEventListener("resize", compute)
    }
  }, [focusedId])

  return (
    <Caption captionX={captionX} game={focused} ... />
  )
}

function Caption({ game, captionX, ... }) {
  return (
    <div
      className="sunlit-caption"
      // Inline transform — no CSS transition on the outer element.
      // Snaps the same frame the focus halo updates.
      style={{ transform: `translateX(${captionX}px)` }}
    >
      <div key={game.id} className="sunlit-caption-text">
        {/* Inner element re-mounts on game.id; keyframe runs to crossfade
            text content. Content change has its own message, separate
            from position. */}
        <span>{getGameDisplayName(game)}</span>
        ...
      </div>
    </div>
  )
}
```

```css
/* No transition on .sunlit-caption itself — snap is the contract. */
.sunlit-caption-text {
  animation: caption-cross 220ms ease-out;
}
```

### Anti-pattern: smooth tracking

```css
/* ❌ Tempting and wrong. The caption now chases its target across
   ~280ms, during which the focus halo (instant) and the caption
   (mid-animation) belong to different tiles. */
.sunlit-caption {
  transition: transform 280ms ease;
}
```

Result: the user feedback was *"awkward."* Specifically: between focus changes the caption is partway between targets, decoupled from both the halo's state and the data's state. The eye watches it travel, dissolving the bond.

### Selection annotation following a list item

```tsx
// ✓ Snap, with a target-side cue providing the polish.
<ListItem isSelected={isSelected} className="transition-colors duration-150">
  ...
</ListItem>
<Annotation
  // Position is set from the selected item's offset; no transition on it.
  style={{ top: selectedOffset }}
>
  {selectedItem.label}
</Annotation>

// ❌ Annotation slides between rows; reads as chasing.
<Annotation
  className="transition-all duration-200"
  style={{ top: selectedOffset }}
>
  {selectedItem.label}
</Annotation>
```

### Tooltip re-anchoring on target change

```tsx
// User Tab-keys between buttons. Tooltip should appear attached to whichever
// is focused, not slide between them.
<Tooltip
  // ✓ Snap to new anchor instantly. The fade-in animation on the tooltip
  // body itself communicates "new tooltip"; sliding adds nothing.
  style={{ left: focusedAnchorX, top: focusedAnchorY }}
>
  {focusedTooltipText}
</Tooltip>
```

### When sliding IS right — the discriminator in action

```tsx
// ✓ The user explicitly reorders items. The motion IS the message —
// "this item moved from index 3 to index 0." Sliding the items into
// their new positions reinforces the action's outcome.
<ReorderableList items={items} onReorder={handleReorder}>
  {/* Item position transitions because position itself is what changed. */}
</ReorderableList>

// ✓ Tooltip following a continuous drag gesture. The user is directly
// producing the position; smooth motion mirrors the smoothness of input.
<DraggableTooltip x={pointer.x} y={pointer.y} />
```

In both cases the motion isn't decorating an underlying state change — it *is* the state change. That's when smoothness adds rather than competes.

## Related

- `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md` — the Tilegrid primitive whose rail Root the Sunlit exploration uses. This learning is the motion-design counterpart for any consumer that pairs caption-style UI with a focusable rail.
- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — describes the geometric LRUD focus engine that drives the focused-tile state cue this learning hinges on.
- `docs/solutions/best-practices/evolving-shared-context-layout-primitives-2026-05-01.md` — the additive-context evolution that delivered the rectangular-cell rail Sunlit consumes; this doc is the motion sibling.
- Sunlit caption + tracking implementation: `korri/shared/design-system/explorations/home-screens/HomeSunlit.stories.tsx`.
