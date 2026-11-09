import React, { useEffect } from 'react'
import { Content } from '../storage/types'
import { ExternalLink } from 'lucide-react'
import { BackButton } from './BackButton'
import { Button } from './Button'
import { ArticleSkeleton } from './Skeleton'
import { EntryProblem, formatRelativeTime, formatShortDate } from '../utils'
import parse from 'html-react-parser'
import sanitizeHtml from 'sanitize-html'
import {
  isLocalMediaPath,
  mapUrlAttributes,
  resolveAgainstEntry,
  withBasePath
} from '../entry-urls'
import { ENTRY_CONTENT_SANITIZE_OPTIONS } from '../../action/feeds/sanitize'

interface ReactParserNode {
  name: string
  attribs?: {
    [key in string]: string
  }
}

interface ItemContentProps {
  content?: Content
  problem?: EntryProblem
  loading?: boolean
  selectBack?: () => void
  retry?: () => void
  // The list the article was opened from, named in the phone's back band
  backLabel?: string
}

// The article's 41px action strip, the only part that stays put: on phones the
// back button and the list's name, then "View original" on the right.
const ActionStrip = ({
  selectBack,
  backLabel,
  children
}: {
  selectBack?: () => void
  backLabel?: string
  children?: React.ReactNode
}) => (
  <div className="fk-band fk-strip">
    <div className="flex min-w-0 items-center gap-2.5">
      <BackButton onClickBack={selectBack} label={backLabel} />
      {backLabel && (
        <span className="fk-backband-label md:hidden" aria-hidden="true">
          {backLabel}
        </span>
      )}
      <span className="fk-label hidden md:inline">Reading</span>
    </div>
    {children}
  </div>
)

export const ItemContent = ({
  content,
  problem,
  loading,
  selectBack,
  retry,
  backLabel
}: ItemContentProps) => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
  let element: HTMLElement | null = null
  useEffect(() => {
    if (!element) return
    element.scrollTo(0, 0)
  }, [content])

  if (!content && problem) {
    return (
      <div className="fk-pane">
        <ActionStrip selectBack={selectBack} backLabel={backLabel} />
        <div className="fk-empty" role="status">
          {problem === 'unreachable' ? (
            <>
              <p>
                Couldn&apos;t load this item. Check your connection and try
                again.
              </p>
              <Button variant="outline" size="sm" onClick={retry}>
                Try again
              </Button>
            </>
          ) : (
            <>
              <p>This item is no longer available.</p>
              <Button variant="outline" size="sm" onClick={selectBack}>
                Back to list
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (!content && loading) {
    return (
      <div className="fk-pane">
        <ActionStrip selectBack={selectBack} backLabel={backLabel} />
        <ArticleSkeleton />
      </div>
    )
  }

  if (!content) {
    return (
      <div className="fk-hatch" role="status">
        <div className="fk-hatch-panel">
          <p>Pick a story to read.</p>
          <span className="fk-keys">
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            <span className="ml-1">previous and next</span>
          </span>
        </div>
      </div>
    )
  }

  const time = content.timestamp * 1000

  return (
    <article className="fk-pane">
      <ActionStrip selectBack={selectBack} backLabel={backLabel}>
        <a
          href={content.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-text hit-target-y"
        >
          View original
          <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
        </a>
      </ActionStrip>
      <div
        className="fk-scroll"
        ref={(contentPane) => {
          element = contentPane
        }}
      >
        <div className="fk-article-body">
          <div className="fk-article-col">
            <header>
              <p className="fk-kicker">
                {content.siteTitle && <span>{content.siteTitle}</span>}
                {content.siteTitle && (
                  <span className="fk-dot" aria-hidden="true">
                    ·
                  </span>
                )}
                <time dateTime={new Date(time).toISOString()}>
                  {formatShortDate(time)}
                </time>
                <span className="fk-dot" aria-hidden="true">
                  ·
                </span>
                <span>{formatRelativeTime(time)}</span>
              </p>
              <h2 className="fk-article-title">{content.title}</h2>
            </header>
            <hr className="fk-article-rule" />
            <div className="feeds-prose">
              {parse(
                sanitizeHtml(content.content, ENTRY_CONTENT_SANITIZE_OPTIONS),
                {
                  replace: (domNode) => {
                    const node = domNode as ReactParserNode
                    if (!node.attribs) return domNode

                    // Downloaded media is served from this site, so it only needs the
                    // base path. Everything else resolves against the entry, which is
                    // what stops a URL stored before the action resolved them from
                    // pointing at the reader's own domain. Links and media both take
                    // the entry as their base here, and so does the action, so a
                    // given relative URL lands on the same absolute one whichever
                    // half of the pipeline handles it.
                    node.attribs = mapUrlAttributes(node.attribs, (url) =>
                      isLocalMediaPath(url)
                        ? withBasePath(url, basePath)
                        : resolveAgainstEntry(url, content.url)
                    )

                    if (node.name === 'a') {
                      node.attribs.target = '_blank'
                      node.attribs.rel = 'noopener noreferrer'
                    }
                    if (
                      node.name === 'img' &&
                      !node.attribs.src?.startsWith('data:')
                    ) {
                      // Images that could not be downloaded still point at their
                      // origin, where a referrer often triggers hotlink protection.
                      node.attribs.referrerpolicy = 'no-referrer'
                      node.attribs.loading = node.attribs.loading || 'lazy'
                    }
                    return node
                  }
                }
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
