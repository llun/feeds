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
      className={`prose pb-4 max-w-full break-words flex-grow p-6 lg:overflow-auto ${className}`}
    >
      <a className="cursor-pointer lg:hidden" onClick={selectBack}>
        ← Back
      </a>
      {content && (
        <div>
          <h3>
            <a href={content.url} target="_blank">
              {content.title}
            </a>
          </h3>
          <div dangerouslySetInnerHTML={{ __html: content.content }} />
        </div>
      )}
      <div className="pb-8"></div>
    </article>
  )
}

export default Entry
