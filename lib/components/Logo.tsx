import React from 'react'

interface LogoProps {
  size?: number
  className?: string
}

/**
 * The Feeds mark from the app icon: a dot and two concentric quarter arcs
 * with round caps. Drawn with currentColor so it follows the theme instead of
 * relying on inverting a black asset.
 */
export const Logo = ({ size = 30, className }: LogoProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 512 512"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <g
      stroke="currentColor"
      strokeWidth="80"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M220 92C220 202.457 309.543 292 420 292" />
      <path d="M88 92C88 275.359 236.641 424 420 424" />
    </g>
    <circle cx="392" cy="120" r="72" fill="currentColor" />
  </svg>
)
