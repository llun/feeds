import React, { CSSProperties } from 'react'

// Placeholder blocks shaped like the content that is loading. The shimmer is
// pinned to the viewport (see .feeds-skeleton), so every block on screen shares
// one sweep, and it stops under reduced motion.
export const Skeleton = ({
  className = '',
  style
}: {
  className?: string
  style?: CSSProperties
}) => (
  <span
    aria-hidden="true"
    className={`feeds-skeleton ${className}`}
    style={style}
  />
)

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

export const ListSkeleton = ({ label = 'Loading items…' }) => (
  <div role="status" className="p-1.5">
    <LoadingStatus label={label} />
    <ul className="divide-y divide-border" aria-hidden="true">
      {LIST_ROWS.map(([first, second, meta], index) => (
        <li key={index} className="px-3 py-2.5">
          <Skeleton className="h-3.5" style={{ width: first }} />
          <Skeleton className="mt-[5px] h-3.5" style={{ width: second }} />
          <Skeleton className="mt-2 h-3" style={{ width: meta }} />
        </li>
      ))}
    </ul>
  </div>
)

const ARTICLE_PARAGRAPH = ['100%', '96%', '98%', '70%']

export const ArticleSkeleton = () => (
  <div role="status" className="flex min-h-0 flex-1 flex-col">
    <LoadingStatus label="Loading article…" />
    <div className="border-b border-border px-6.5 pt-5.5 pb-[15px] md:pt-9.5">
      <Skeleton className="h-6" style={{ width: '85%' }} />
      <Skeleton className="mt-2 h-6" style={{ width: '55%' }} />
      <Skeleton className="mt-4 h-3.5" style={{ width: '45%' }} />
    </div>
    <div className="max-w-(--measure) overflow-hidden px-6.5 pt-5.5">
      {[0, 1, 2].map((paragraph) => (
        <div key={paragraph} className="mb-6 flex flex-col gap-3">
          {ARTICLE_PARAGRAPH.map((width, line) => (
            <Skeleton key={line} className="h-3.5" style={{ width }} />
          ))}
        </div>
      ))}
    </div>
  </div>
)

const NAV_ROWS = ['62%', '50%', '70%', '56%']

export const NavSkeleton = () => (
  <div role="status">
    <LoadingStatus label="Loading categories…" />
    {NAV_ROWS.map((width, index) => (
      <div
        key={index}
        aria-hidden="true"
        className="flex min-h-8 items-center gap-2 px-2 py-1.5"
      >
        <Skeleton className="size-4 shrink-0" />
        <Skeleton className="h-3" style={{ width }} />
        <Skeleton className="ml-auto h-2.5 w-4 shrink-0" />
      </div>
    ))}
  </div>
)
