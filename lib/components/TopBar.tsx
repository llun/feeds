import React, { MouseEvent } from 'react'
import { LogoTile } from './Logo'
import { ThemeToggle } from './ThemeToggle'
import { formatRelativeTime } from '../utils'

interface TopBarProps {
  basePath?: string
  version?: string
  buildTime?: string | null
  loading?: boolean
  // A newer build is loading: a band runs along the bottom of the bar
  busy?: boolean
  // In-app navigation to the reader; the brand still works as a plain link
  selectReader?: () => void
}

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
export const inApp =
  (action?: () => void) =>
  (
    event: Pick<
      MouseEvent,
      | 'button'
      | 'metaKey'
      | 'ctrlKey'
      | 'shiftKey'
      | 'altKey'
      | 'preventDefault'
    >
  ) => {
    if (!action) return
    if (event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    action()
  }

// The 48px bar over the panes: the brand, the status note and the theme
// button. The OPML editor is reached from the sidebar's Edit OPML link.
export const TopBar = ({
  basePath,
  version,
  buildTime,
  loading,
  busy,
  selectReader
}: TopBarProps) => (
  <header className="fk-topbar" data-busy={busy ? '' : undefined}>
    {/* The page's one h1; the panes' titles are h2 */}
    <h1 className="fk-brand-h">
      <a
        className="fk-brand hit-target-y"
        href={appHref(basePath, '/')}
        onClick={inApp(selectReader)}
      >
        <LogoTile />
        <span>Feeds</span>
      </a>
    </h1>
    <p className="fk-topbar-status">
      {statusText(loading ? null : buildTime, version)}
    </p>
    <ThemeToggle />
    {busy && <span className="fk-busy" aria-hidden="true" />}
  </header>
)
