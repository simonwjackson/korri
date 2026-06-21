/**
 * Shift atom — circular avatar image.
 *
 * Visual identity (size, circular crop, surface-toned ring) lives in
 * `.shift-avatar` in shift.css. This wrapper is a native <img> with
 * `loading="lazy"` so off-screen avatars never block initial paint.
 *
 * Defaults `alt=""` because the avatar is decorative on the home
 * surface today; the surrounding context already communicates whose
 * profile it is. Consumers may override `alt` when the avatar carries
 * meaning.
 */

export interface ShiftAvatarProps {
  readonly src: string
  readonly alt?: string
}

export function ShiftAvatar({ src, alt = "" }: ShiftAvatarProps) {
  return <img src={src} alt={alt} className="shift-avatar" loading="lazy" />
}
