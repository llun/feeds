import React, { useEffect } from 'react'
import { Content } from '../storage/types'
import { ExternalLink } from 'lucide-react'
import { BackButton } from './BackButton'
import { Button } from './Button'
import { formatRelativeTime } from '../utils'
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
  missing?: boolean
  loading?: boolean
  selectBack?: () => void
}

export const ItemContent = ({
  content,
  missing,
  loading,
  selectBack
}: ItemContentProps) => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
  let element: HTMLElement | null = null
  useEffect(() => {
    if (!element) return
    element.scrollTo(0, 0)
  }, [content])

  if (!content && missing) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="fk-backbar md:hidden">
          <BackButton onClickBack={selectBack} />
        </div>
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3.5 p-8 text-center text-sm text-muted-foreground"
          role="status"
        >
          <p className="max-w-[260px] leading-[1.5]">
            This item is no longer available.
          </p>
          <Button variant="ghost" size="sm" onClick={selectBack}>
            Back to list
          </Button>
        </div>
      </div>
    )
  }

  if (!content && loading) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="fk-backbar md:hidden">
          <BackButton onClickBack={selectBack} />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3.5 p-8">
          <div
            className="feeds-spinner size-7"
            role="status"
            aria-label="Loading"
          ></div>
          <p className="text-sm leading-[1.5] text-muted-foreground">
            Loading…
          </p>
        </div>
      </div>
    )
  }

  if (!content) {
    return (
      <div
        className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground"
        role="status"
      >
        <p className="max-w-[260px] leading-[1.5]">
          Select an item from the list to read it here.
        </p>
      </div>
    )
  }

  return (
    <article className="flex h-full flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="px-6.5 pt-5.5 pb-[15px] md:pt-9.5">
          <div className="fk-backbar mb-4 md:hidden">
            <BackButton onClickBack={selectBack} />
          </div>
          <h1 className="break-words text-2xl leading-[1.2] font-bold tracking-tight">
            {content.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm leading-[1.2] text-muted-foreground">
            {content.siteTitle && <span>{content.siteTitle}</span>}
            {content.siteTitle && <span className="text-faint">•</span>}
            <time dateTime={new Date(content.timestamp * 1000).toISOString()}>
              {formatRelativeTime(content.timestamp * 1000)}
            </time>
            <span className="text-faint">•</span>
            <a
              href={content.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 break-all rounded-sm transition-colors hover:text-link focus-ring"
            >
              View Original
              <ExternalLink size={14} className="shrink-0" />
            </a>
          </div>
        </div>
      </header>
      <div
        className="flex-1 overflow-x-hidden overflow-y-auto px-6.5 pt-5.5 pb-12"
        ref={(contentPane) => {
          element = contentPane
        }}
      >
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
    </article>
  )
}
