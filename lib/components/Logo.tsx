import React from 'react'

interface LogoProps {
  size?: number
  className?: string
}

/**
 * The Feeds mark, drawn with currentColor so it follows the theme instead of
 * relying on inverting a black asset.
 */
export const Logo = ({ size = 30, className }: LogoProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 512 512"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <g fill="none" stroke="currentColor" strokeWidth="32">
      <path d="M 448 256 C 448 362.038666 362.038666 448 256 448 C 149.961334 448 64 362.038666 64 256 C 64 149.961334 149.961334 64 256 64 C 362.038666 64 448 149.961334 448 256 Z" />
      <path d="M 160 256 C 160 202.980652 202.980667 160 256 160" />
    </g>
    <circle cx="256" cy="256" r="40" fill="currentColor" />
  </svg>
)
