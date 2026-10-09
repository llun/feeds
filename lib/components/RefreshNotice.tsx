import React from 'react'
import { AlertCircle, Check, Info, RefreshCw } from 'lucide-react'
import { Button } from './Button'

// What the page is doing about data from an older build of the site
export type RefreshState =
  'refreshing' | 'refreshed' | 'available' | 'failed' | null

interface RefreshNoticeProps {
  state: RefreshState
  onLoadLatest?: () => void
  onDismiss?: () => void
}

export const RefreshNotice = ({
  state,
  onLoadLatest,
  onDismiss
}: RefreshNoticeProps) => {
  if (!state) return null
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-center">
      <div
        role="status"
        className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-lg border border-border bg-popover px-3.5 py-2.5 text-sm leading-[1.4] text-popover-foreground shadow-md animate-pop-in"
      >
        {state === 'refreshing' && (
          <>
            <RefreshCw
              size={16}
              aria-hidden="true"
              className="shrink-0 animate-spin text-brand"
            />
            <span>Loading the latest feeds…</span>
          </>
        )}
        {state === 'refreshed' && (
          <>
            <Check
              size={16}
              aria-hidden="true"
              className="shrink-0 text-success"
            />
            <span>Feeds updated.</span>
          </>
        )}
        {state === 'available' && (
          <>
            <Info size={16} aria-hidden="true" className="shrink-0 text-link" />
            <span>New feeds are available.</span>
            <Button variant="link" size="sm" onClick={onLoadLatest}>
              Load latest
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconLeft="x"
              aria-label="Dismiss"
              title="Dismiss"
              onClick={onDismiss}
            />
          </>
        )}
        {state === 'failed' && (
          <>
            <AlertCircle
              size={16}
              aria-hidden="true"
              className="shrink-0 text-destructive"
            />
            <span>Couldn&apos;t load the latest feeds.</span>
            <Button variant="link" size="sm" onClick={onLoadLatest}>
              Try again
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconLeft="x"
              aria-label="Dismiss"
              title="Dismiss"
              onClick={onDismiss}
            />
          </>
        )}
      </div>
    </div>
  )
}
