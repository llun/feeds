import React, { useEffect } from 'react'
import { Content } from '../storage'

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
      className={`pb-4 max-w-full break-words flex-grow p-6 xl:overflow-auto ${className}`}
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
          <div dangerouslySetInnerHTML={{ __html: content.content }} />
        </div>
      )}
      <div className="pb-8"></div>
    </article>
  )
}

export default Entry
