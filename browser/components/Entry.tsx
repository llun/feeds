import React, { useEffect } from 'react'
import { EntryData } from '../../action/eleventy/data'
import type { PageState } from '../index'

interface Props {
  className?: string
  entry?: EntryData
  page: PageState
  selectBack?: () => void
}

const Entry = ({ className, entry, page, selectBack }: Props) => {
  let element: HTMLElement | null = null
  useEffect(() => {
    if (!element) return
    if (page !== 'article') return
    element.scrollTo(0, 0)
  })

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
      {entry && (
        <div>
          <h3>
            <a href={entry.link} target="_blank">
              {entry.title}
            </a>
          </h3>
          <div dangerouslySetInnerHTML={{ __html: entry.content }} />
        </div>
      )}
      <div className="pb-8"></div>
    </article>
  )
}

export default Entry
