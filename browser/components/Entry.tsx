import React, { useEffect } from 'react'
import { EntryData } from '../../action/eleventy/data'

const Entry = ({
  className,
  entry,
  selectBack
}: {
  className?: string
  entry?: EntryData
  selectBack?: () => void
}) => {
  let element: HTMLElement | null = null
  useEffect(() => {
    if (!element) return
    element.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
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
