import React from 'react'

/**
 * The Feeds mark in --on-primary on a 24px --primary tile, the labs app tile
 * (rx 4 in a 32-unit viewBox).
 */
export const LogoTile = ({ className = 'fk-logo' }: { className?: string }) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <rect width="32" height="32" rx="4" fill="var(--primary)" />
    <svg x="7" y="7" width="18" height="18" viewBox="48 52 416 416" fill="none">
      <g
        stroke="var(--on-primary)"
        strokeWidth="80"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M220 92C220 202.457 309.543 292 420 292" />
        <path d="M88 92C88 275.359 236.641 424 420 424" />
      </g>
      <circle cx="392" cy="120" r="72" fill="var(--on-primary)" />
    </svg>
  </svg>
)
