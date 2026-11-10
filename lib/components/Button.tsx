import React, { FC, ButtonHTMLAttributes, ReactNode } from 'react'
import {
  ChevronLeft,
  Check,
  Plus,
  X,
  Folder,
  Rss,
  Settings,
  Inbox
} from 'lucide-react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'brand' | 'secondary' | 'outline' | 'ghost' | 'link'
  size?: 'sm' | 'md' | 'lg'
  iconLeft?: string | ReactNode
  iconRight?: string | ReactNode
  block?: boolean
}

const renderIcon = (icon: string | ReactNode, size: number) => {
  if (typeof icon !== 'string') return icon
  switch (icon) {
    case 'chevron-left':
      return <ChevronLeft size={size} strokeWidth={1.5} />
    case 'check':
      return <Check size={size} strokeWidth={1.5} />
    case 'plus':
      return <Plus size={size} strokeWidth={1.5} />
    case 'x':
      return <X size={size} strokeWidth={1.5} />
    case 'folder':
      return <Folder size={size} strokeWidth={1.5} />
    case 'rss':
      return <Rss size={size} strokeWidth={1.5} />
    case 'settings':
      return <Settings size={size} strokeWidth={1.5} />
    case 'inbox':
      return <Inbox size={size} strokeWidth={1.5} />
    default:
      return null
  }
}

// Each variant maps onto a labs kit control: primary (brand, primary), edge
// outline with accent text (outline, secondary), ghost and link; a button
// with only an icon is the kit's edge icon button.
const VARIANT_CLASS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'btn-primary',
  brand: 'btn-primary',
  secondary: 'btn-text',
  outline: 'btn-text',
  ghost: 'btn-ghost',
  link: 'btn-link'
}

// The 44px touch target: both ways for a square icon button, vertical only
// for the rest so it never reaches into a neighbour. A caller that passes its
// own hit-target class keeps it.
const hitTargetClassName = (
  variant: ButtonProps['variant'],
  iconOnly: boolean,
  className: string
): string => {
  if (/(^|\s)hit-target/.test(className)) return ''
  return iconOnly && variant !== 'link' ? 'hit-target' : 'hit-target-y'
}

export const buttonClassName = ({
  variant = 'secondary',
  size = 'md',
  iconOnly = false,
  block = false,
  className = ''
}: {
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  iconOnly?: boolean
  block?: boolean
  className?: string
}): string =>
  [
    iconOnly && variant !== 'link' ? 'btn-icon' : VARIANT_CLASS[variant],
    hitTargetClassName(variant, iconOnly, className),
    size === 'lg' ? 'btn-lg' : '',
    block ? 'btn-block' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

export const Button: FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  iconLeft,
  iconRight,
  block = false,
  type = 'button',
  className = '',
  ...rest
}) => {
  const iconOnly = !children && Boolean(iconLeft || iconRight)
  const iconSize = size === 'lg' ? 18 : iconOnly ? 16 : 14

  const cls = buttonClassName({ variant, size, iconOnly, block, className })

  return (
    <button type={type} className={cls} {...rest}>
      {iconLeft ? renderIcon(iconLeft, iconSize) : null}
      {children ? <span>{children}</span> : null}
      {iconRight ? renderIcon(iconRight, iconSize) : null}
    </button>
  )
}
