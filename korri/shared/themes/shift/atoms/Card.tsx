import type { MouseEventHandler } from "react"

export interface CardProps {
  imageUrl?: string
  alt?: string
  onClick?: MouseEventHandler<HTMLButtonElement>
  ariaLabel?: string
}

/**
 * Image-only rounded card with hover border. Theme-agnostic primitive that
 * higher levels (organisms, templates) compose into grids.
 */
export function Card({ imageUrl, alt, onClick, ariaLabel }: CardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? alt}
      className="shift-card block w-full"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={alt ?? ""}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-neutral-500">
          No image
        </div>
      )}
    </button>
  )
}
