import { formatDistance } from 'date-fns'
import parse from 'html-react-parser'
import { useEffect } from 'react'

import { Content } from '../storage/types'

interface ReactParserNode {
  name: string
  attribs?: {
    [key in string]: string
  }
}

interface Props {
  className?: string
  content: Content | null
  selectBack?: () => void
}

const Entry = ({ className, content, selectBack }: Props) => {
  let element: HTMLElement | null = null
  useEffect(() => {
    if (!element) return
    element.scrollTo(0, 0)
  }, [content])

  return (
    <article
      ref={(article) => {
        element = article
      }}
      className={`pb-4 max-w-full break-words flex-grow p-6 xl:overflow-auto overscroll-contain ${className}`}
    >
      <a className="cursor-pointer xl:hidden" onClick={selectBack}>
        ← Back
      </a>
      {content && (
        <div>
          <h2>
            <a
              className="font-serif font-bold no-underline hover:underline"
              href={content.url}
              target="_blank"
            >
              {content.title}
            </a>
          </h2>
          <div className="xl:hidden">
            <strong>{content.siteTitle}</strong>
            <span>
              , {formatDistance(content.timestamp * 1000, new Date())}
            </span>
          </div>
          <div>
            {parse(content.content, {
              replace: (domNode) => {
                const node = domNode as ReactParserNode
                if (node.attribs && node.name === 'a') {
                  node.attribs.target = '_blank'
                  return node
                }
                return domNode
              }
            })}
          </div>
        </div>
      )}
      <div className="pb-8"></div>
    </article>
  )
}

export default Entry
