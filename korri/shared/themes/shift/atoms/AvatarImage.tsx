export interface AvatarImageProps {
  src: string
  alt?: string
  size?: number
}

export function AvatarImage({ src, alt = "", size = 24 }: AvatarImageProps) {
  return (
    <span
      className="inline-block overflow-hidden rounded-full border border-neutral-300 dark:border-white/20"
      style={{ width: size, height: size }}
    >
      <img src={src} alt={alt} className="h-full w-full object-cover" />
    </span>
  )
}
