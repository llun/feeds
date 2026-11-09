import React, { MouseEvent, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { LogoTile } from './Logo'
import { ThemeToggle } from './ThemeToggle'
import { formatRelativeTime } from '../utils'

export type TopBarPage = 'reader' | 'subscriptions'

interface TopBarProps {
  page: TopBarPage
  basePath?: string
  version?: string
  buildTime?: string | null
  loading?: boolean
  // A newer build is loading: a band runs along the bottom of the bar
  busy?: boolean
  // In-app navigation; the links still work as plain links without it
  selectReader?: () => void
  selectSubscriptions?: () => void
}

const PAGES: { page: TopBarPage; label: string; path: string }[] = [
  { page: 'reader', label: 'Reader', path: '/sites/all' },
  { page: 'subscriptions', label: 'Subscriptions', path: '/opml' }
]

// The base path is '' or '/' at the root of a domain, or '/repo'
export const appHref = (basePath: string | undefined, path: string): string =>
  `${(basePath ?? '').replace(/\/+$/, '')}${path}`

// "updated 2 hours ago · v4.10.0", either half alone when the other is unknown
export const statusText = (
  buildTime: string | null | undefined,
  version: string | undefined,
  nowMs: number = Date.now()
): string => {
  const parts: string[] = []
  const built = buildTime ? new Date(buildTime).getTime() : NaN
  if (!Number.isNaN(built))
    parts.push(`updated ${formatRelativeTime(built, nowMs)}`)
  if (version) parts.push(`v${version}`)
  return parts.join(' · ')
}

// A plain left click navigates in the app; anything else (a new tab, a
// modified click) is left to the browser.
const inApp = (action?: () => void) => (event: MouseEvent) => {
  if (!action) return
  if (event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  action()
}

const PageSwitch = ({
  page,
  basePath,
  selectReader,
  selectSubscriptions
}: Pick<
  TopBarProps,
  'page' | 'basePath' | 'selectReader' | 'selectSubscriptions'
>) => {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const current = PAGES.find((item) => item.page === page) ?? PAGES[0]

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  const actions: Record<TopBarPage, (() => void) | undefined> = {
    reader: selectReader,
    subscriptions: selectSubscriptions
  }

  return (
    <div
      className="fk-page-switch"
      ref={rootRef}
      onBlur={(event) => {
        // Keyboard focus moved out of the switch and its menu
        const next = event.relatedTarget as Node | null
        if (open && next && !rootRef.current?.contains(next)) setOpen(false)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="btn-edge fk-page-switch-btn hit-target-y font-medium"
        aria-expanded={open}
        aria-controls={open ? 'fk-page-menu' : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{current.label}</span>
        <ChevronDown className="chev" strokeWidth={1.5} aria-hidden="true" />
      </button>
      {open && (
        <div className="fk-page-menu" id="fk-page-menu">
          {PAGES.map((item) => (
            <a
              key={item.page}
              href={appHref(basePath, item.path)}
              aria-current={item.page === page ? 'page' : undefined}
              onClick={(event) => {
                inApp(() => {
                  setOpen(false)
                  actions[item.page]?.()
                })(event)
              }}
            >
              {item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// The 48px bar over the panes: the brand, the page switch, the status note and
// the theme button.
export const TopBar = ({
  page,
  basePath,
  version,
  buildTime,
  loading,
  busy,
  selectReader,
  selectSubscriptions
}: TopBarProps) => (
  <header className="fk-topbar" data-busy={busy ? '' : undefined}>
    {/* The page's one h1; the panes' titles are h2 */}
    <h1 className="fk-brand-h">
      <a
        className="fk-brand"
        href={appHref(basePath, '/')}
        onClick={inApp(selectReader)}
      >
        <LogoTile />
        <span>Feeds</span>
      </a>
    </h1>
    <PageSwitch
      page={page}
      basePath={basePath}
      selectReader={selectReader}
      selectSubscriptions={selectSubscriptions}
    />
    <p className="fk-topbar-status">
      {statusText(loading ? null : buildTime, version)}
    </p>
    <ThemeToggle />
    {busy && <span className="fk-busy" aria-hidden="true" />}
  </header>
)
