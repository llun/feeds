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
  variant?:
    | 'primary'
    | 'brand'
    | 'secondary'
    | 'outline'
    | 'ghost'
    | 'link'
    | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  iconLeft?: string | ReactNode
  iconRight?: string | ReactNode
  block?: boolean
}

const renderIcon = (icon: string | ReactNode, size: number) => {
  if (typeof icon !== 'string') return icon
  switch (icon) {
    case 'chevron-left':
      return <ChevronLeft size={size} />
    case 'check':
      return <Check size={size} />
    case 'plus':
      return <Plus size={size} />
    case 'x':
      return <X size={size} />
    case 'folder':
      return <Folder size={size} />
    case 'rss':
      return <Rss size={size} />
    case 'settings':
      return <Settings size={size} />
    case 'inbox':
      return <Inbox size={size} />
    default:
      return null
  }
}

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
  const iconOnly = !children && (iconLeft || iconRight)
  const iconSize = size === 'lg' ? 18 : 16

  const cls = [
    'feeds-btn',
    `feeds-btn--${variant}`,
    `feeds-btn--${size}`,
    iconOnly ? 'feeds-btn--icononly' : '',
    block ? 'feeds-btn--block' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={cls} {...rest}>
      {iconLeft ? renderIcon(iconLeft, iconSize) : null}
      {children ? <span>{children}</span> : null}
      {iconRight ? renderIcon(iconRight, iconSize) : null}
    </button>
  )
}
