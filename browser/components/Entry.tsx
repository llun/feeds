import React from 'react'
import { EntryData } from '../../action/eleventy/data'

export default ({ entry }: { entry?: EntryData }) => {
  return (
    <article className="prose flex-grow p-6 max-h-screen overflow-y-auto">
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
}
