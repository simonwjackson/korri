---
title: Focusable actions inside status clusters
last_updated: 2026-05-04
date: 2026-05-04
category: best-practices
module: korri/shared/themes/shift
problem_type: best_practice
component: frontend_stimulus
severity: low
applies_when:
  - Adding a focusable action to a decorative chrome row such as time, wifi, battery, or avatar
  - Mixing semantic buttons with aria-hidden status indicators in a TV or kiosk UI
  - A new top-bar action looks visually detached because it is composed as a separate flex group
tags: [shift-theme, status-cluster, labs, spatial-navigation, top-bar, focusable-actions]
---

# Focusable actions inside status clusters

## Context

The Shift Labs button initially rendered as a trailing top-bar action outside the status cluster. Functionally it worked, but visually it created a strange horizontal gap: the Labs icon read as its own large pill between search and the time/wifi/battery/avatar cluster instead of as part of the system chrome.

The fix was to make Labs an icon-sized focusable action inside `ShiftStatusCluster`, colocated with the theme/status icons, while keeping the decorative status items hidden from assistive tech.

## Guidance

When adding a focusable action to a status-chrome row, compose it inside the status cluster at the position where it visually belongs. Do not create a sibling flex wrapper that separates the action from the icon rhythm.

Keep these responsibilities split:

- The status cluster owns row rhythm and icon ordering.
- Decorative status indicators remain `aria-hidden`.
- Focusable actions remain native `<button>` elements with their own accessible names.
- The action should be icon-sized unless it is intentionally a pill or primary CTA.

In Shift, that means routing the top-bar action slot into `ShiftStatusCluster`:

```tsx
<ShiftStatusCluster
  time={time}
  avatarSrc={avatarSrc}
  iconActions={trailingActions}
/>
```

And placing the action among the status icons:

```tsx
<div className="flex items-center gap-6">
  <ShiftStatusIcon icon={Sun} />
  {iconActions}
  <ShiftStatusIcon icon={Wifi} />
  <ShiftStatusIcon icon={Battery} />
  <ShiftAvatar src={avatarSrc} />
</div>
```

The Labs button still uses a native button and an accessible label, but its visual dimensions match the surrounding status icons:

```css
[data-shift-home] .shift-labs-button {
  width: 1.4em;
  height: 1.4em;
  background: transparent;
  box-shadow: none;
}
```

## Why This Matters

Top-bar chrome works by rhythm. Time, brightness/theme, wifi, battery, and avatar form a tight visual grammar. A dev affordance like Labs is still a top-bar system affordance, so it should inherit that grammar unless the product deliberately wants it to stand out.

The accessibility nuance matters too: making the whole status cluster `aria-hidden` is fine when it is purely decorative, but it becomes wrong once a real action is injected. Hide only the decorative pieces; let the button remain reachable and named.

This preserves all of the kiosk/spatial-navigation rules:

- The control is still a native focusable button.
- Directional navigation can discover it from the DOM.
- The component does not import navigation libraries or focus hooks.
- The focus state is visual but quiet, matching status-icon weight instead of creating a large pill.

## When to Apply

- Adding debug, Labs, settings, profile, connectivity, or mode toggles to a status row.
- A top-bar action visually creates too much gap because it lives outside the chrome cluster.
- A decorative cluster needs to accept one or two semantic actions without becoming a generic toolbar.

## Examples

### Avoid: detached trailing action wrapper

```tsx
<div className="flex items-center gap-6">
  {trailingActions}
  <ShiftStatusCluster time={time} avatarSrc={avatarSrc} />
</div>
```

This makes the action feel like a separate region and often doubles the horizontal gap because both the wrapper and the cluster own spacing.

### Prefer: action slot inside the status cluster

```tsx
<ShiftStatusCluster
  time={time}
  avatarSrc={avatarSrc}
  iconActions={<ShiftLabsButton onActivate={openLabs} />}
/>
```

The cluster decides whether the action belongs after the clock, between theme/wifi, before avatar, or somewhere else in the status grammar.

### Accessibility shape

```tsx
<span aria-hidden>{time}</span>
<div className="flex items-center gap-6">
  <ShiftStatusIcon icon={Sun} />
  <ShiftLabsButton onActivate={openLabs} />
  <ShiftStatusIcon icon={Wifi} />
</div>
```

Do not put `aria-hidden` on an ancestor that contains `ShiftLabsButton`; it would hide a real action from assistive technology.

## Related

- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — components stay native; navigation discovers focusables from the DOM.
- `docs/solutions/best-practices/per-level-storybook-coverage-for-atomic-themes-2026-05-01.md` — Shift theme components should remain reviewable at the appropriate atomic level.
- `korri/shared/themes/shift/molecules/ShiftStatusCluster.tsx` — current status-cluster composition.
- `korri/shared/themes/shift/molecules/ShiftLabsButton.tsx` — current icon-sized focusable Labs action.
