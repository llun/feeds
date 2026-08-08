import React, { useEffect } from 'react'
import { Content } from '../storage/types'
import { formatDistance } from 'date-fns'
import { ExternalLink } from 'lucide-react'
import { BackButton } from './BackButton'
import parse from 'html-react-parser'
import { isLocalMediaPath, rewriteLocalSrcSet, withBasePath } from '../media'

interface ReactParserNode {
  name: string
  attribs?: {
    [key in string]: string
  }
}

interface ItemContentProps {
  content?: Content
  selectBack?: () => void
}

export const ItemContent = ({ content, selectBack }: ItemContentProps) => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
  let element: HTMLElement | null = null
  useEffect(() => {
    if (!element) return
    element.scrollTo(0, 0)
  }, [content])

  if (!content) {
    return (
      <div
        className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground"
        role="status"
      >
        <p>Select an item from the list to read it here.</p>
      </div>
    )
  }

  return (
    <article className="flex h-full flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="border-b border-border px-2.5 py-2 md:hidden">
          <BackButton onClickBack={selectBack} />
        </div>
        <div className="px-5 py-4 md:px-6 md:pt-5 md:pb-4">
          <h1 className="break-words text-2xl font-bold leading-tight tracking-tight">
            {content.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
            {content.siteTitle && <span>{content.siteTitle}</span>}
            {content.siteTitle && <span className="text-faint">•</span>}
            <time dateTime={new Date(content.timestamp * 1000).toISOString()}>
              {formatDistance(content.timestamp * 1000, new Date(), {
                addSuffix: true
              })}
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
        className="flex-1 overflow-x-hidden overflow-y-auto px-5 py-4 pb-12 md:px-6"
        ref={(contentPane) => {
          element = contentPane
        }}
      >
        <div className="feeds-prose">
          {parse(content.content, {
            replace: (domNode) => {
              const node = domNode as ReactParserNode
              if (node.attribs && node.name === 'a') {
                node.attribs.target = '_blank'
                node.attribs.rel = 'noopener noreferrer'
                return node
              }
              if (node.attribs && node.name === 'img') {
                const { src, srcset } = node.attribs
                if (src?.startsWith('data:')) return node
                // Images that could not be downloaded still point at their
                // origin, where a referrer often triggers hotlink protection.
                node.attribs.referrerpolicy = 'no-referrer'
                node.attribs.loading = node.attribs.loading || 'lazy'
                if (isLocalMediaPath(src)) {
                  node.attribs.src = withBasePath(src, basePath)
                }
                if (srcset) {
                  node.attribs.srcset = rewriteLocalSrcSet(srcset, basePath)
                }
                return node
              }
              return domNode
            }
          })}
        </div>
      </div>
    </article>
  )
}
