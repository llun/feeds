import React from 'react'
import { EntryData } from '../../action/eleventy/data'

const Entry = ({
  className,
  entry,
  selectBack
}: {
  className?: string
  entry?: EntryData
  selectBack?: () => void
}) => (
  <article
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
  </article>
)

export default Entry
