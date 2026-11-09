import React, { CSSProperties } from 'react'

// Placeholder blocks shaped like the content that is loading: the kit's square
// .sk blocks, with a shine band that stops under reduced motion.
export const Skeleton = ({
  className = '',
  style
}: {
  className?: string
  style?: CSSProperties
}) => <span aria-hidden="true" className={`sk ${className}`} style={style} />

const LoadingStatus = ({ label }: { label: string }) => (
  <span className="sr-only">{label}</span>
)

// Title widths for the list rows, so the rows don't read as a repeated block
const LIST_ROWS: [string, string, string][] = [
  ['92%', '58%', '38%'],
  ['86%', '70%', '34%'],
  ['95%', '44%', '40%'],
  ['80%', '62%', '30%'],
  ['90%', '52%', '36%'],
  ['84%', '66%', '42%'],
  ['93%', '48%', '32%'],
  ['88%', '60%', '38%']
]

// Shaped like the serif index rows: two title lines, then the mono meta
export const ListSkeleton = ({ label = 'Loading items…' }) => (
  <div role="status">
    <LoadingStatus label={label} />
    <ul aria-hidden="true">
      {LIST_ROWS.map(([first, second, meta], index) => (
        <li key={index} className="fk-row">
          <Skeleton className="mt-[3px] h-3.5" style={{ width: first }} />
          <Skeleton className="mt-2 h-3.5" style={{ width: second }} />
          <Skeleton className="mt-[11px] h-2.5" style={{ width: meta }} />
        </li>
      ))}
    </ul>
  </div>
)

const ARTICLE_PARAGRAPH = ['100%', '96%', '98%', '70%']

// Shaped like the article's title block (kicker, serif title, rule) and prose
export const ArticleSkeleton = () => (
  <div role="status" className="fk-scroll">
    <LoadingStatus label="Loading article…" />
    <div className="fk-article-body" aria-hidden="true">
      <div className="fk-article-col">
        <Skeleton className="h-2.5" style={{ width: '40%' }} />
        <Skeleton className="mt-5 h-7" style={{ width: '88%' }} />
        <Skeleton className="mt-2.5 h-7" style={{ width: '56%' }} />
        <hr className="fk-article-rule" />
        {[0, 1, 2].map((paragraph) => (
          <div key={paragraph} className="mb-7 flex flex-col gap-3">
            {ARTICLE_PARAGRAPH.map((width, line) => (
              <Skeleton key={line} className="h-3.5" style={{ width }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  </div>
)

const NAV_ROWS = ['62%', '50%', '70%', '56%']

// Shaped like the sidebar's menu rows
export const NavSkeleton = () => (
  <div role="status">
    <LoadingStatus label="Loading categories…" />
    {NAV_ROWS.map((width, index) => (
      <div
        key={index}
        aria-hidden="true"
        className="fk-nav-row pointer-events-none"
      >
        <Skeleton className="size-4 shrink-0" />
        <Skeleton className="h-2.5" style={{ width }} />
        <Skeleton className="ml-auto h-2.5 w-4 shrink-0" />
      </div>
    ))}
  </div>
)
