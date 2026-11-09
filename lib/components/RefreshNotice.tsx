import React from 'react'
import { AlertCircle, Check, Info, X } from 'lucide-react'
import type { RefreshState } from '../freshness'

interface RefreshNoticeProps {
  state: RefreshState
  onLoadLatest?: () => void
  onDismiss?: () => void
}

const NoticeBox = ({
  tone,
  icon,
  text,
  action,
  onAction,
  onDismiss
}: {
  tone: 'info' | 'error' | 'success'
  icon: React.ReactNode
  text: string
  action?: string
  onAction?: () => void
  onDismiss?: () => void
}) => (
  <div className="fk-net-box" data-tone={tone}>
    {icon}
    <span className="fk-net-text">{text}</span>
    {action && (
      <button
        type="button"
        className="btn-edge hit-target-y"
        onClick={onAction}
      >
        {action}
      </button>
    )}
    {onDismiss && (
      <button
        type="button"
        className="btn-ghost hit-target px-2"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={onDismiss}
      >
        <X size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
    )}
  </div>
)

// A kit net-box strip under the top bar. A refresh in progress shows as the
// top bar's busy band instead, and is only announced here.
export const RefreshNotice = ({
  state,
  onLoadLatest,
  onDismiss
}: RefreshNoticeProps) => {
  const iconProps = { size: 16, strokeWidth: 1.5, 'aria-hidden': true }
  // The live region stays mounted so screen readers announce each message;
  // one added together with its text is often not read.
  return (
    <div role="status" className="fk-notices">
      {state === 'refreshing' && (
        <span className="sr-only">Loading the latest feeds…</span>
      )}
      {state === 'refreshed' && (
        <NoticeBox
          tone="success"
          icon={<Check {...iconProps} />}
          text="Feeds updated."
        />
      )}
      {state === 'available' && (
        <NoticeBox
          tone="info"
          icon={<Info {...iconProps} />}
          text="New feeds are available."
          action="Load latest"
          onAction={onLoadLatest}
          onDismiss={onDismiss}
        />
      )}
      {state === 'failed' && (
        <NoticeBox
          tone="error"
          icon={<AlertCircle {...iconProps} />}
          text="Couldn't load the latest feeds."
          action="Try again"
          onAction={onLoadLatest}
          onDismiss={onDismiss}
        />
      )}
    </div>
  )
}
