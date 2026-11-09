import React from 'react'
import { Folder, Inbox, Rss, Settings } from 'lucide-react'
import { Category } from '../storage/types'
import type { FeedManifestMap } from '../feed-manifest'
import { NavSkeleton } from './Skeleton'
import { Button } from './Button'
import { LocationState, getNavSelection } from '../utils'

interface CategoryListProps {
  categories: Category[]
  totalEntries: number | null
  locationState?: LocationState
  loading?: boolean
  // The feed set could not be loaded; the list pane says so
  failed?: boolean
  retry?: () => void
  feedManifest?: FeedManifestMap | null
  selectCategory?: (category: string) => void
  selectSite?: (siteKey: string, siteTitle: string) => void
  selectOpml?: () => void
}

const rowClassName = (current: boolean, extra = '') =>
  `fk-nav-row ${current ? 'fk-current' : ''} ${extra}`

const NavIcon = ({ Icon }: { Icon: typeof Folder }) => (
  <Icon size={16} strokeWidth={1.5} className="fk-nav-icon" aria-hidden />
)

// Opens a category's (or all items') Atom feed. A sibling of the row's
// button, never inside it, and above the button's full-row hit area.
const FeedLink = ({ href, name }: { href: string; name: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    type="application/atom+xml"
    aria-label={`Open Atom feed for ${name}`}
    title={`Open Atom feed for ${name}`}
    className="fk-feed-link hit-target"
    onClick={(e) => e.stopPropagation()}
  >
    <Rss size={13} strokeWidth={1.5} aria-hidden="true" />
  </a>
)

export const CategoryList = ({
  categories,
  totalEntries,
  locationState,
  loading,
  failed,
  retry,
  feedManifest,
  selectCategory,
  selectSite,
  selectOpml
}: CategoryListProps) => {
  const selection = getNavSelection(locationState ?? null, categories)
  const isOpml = selection.kind === 'opml'
  const isAll = selection.kind === 'all'

  return (
    <nav className="fk-scroll h-full" aria-label="Categories and feeds">
      <div className="fk-nav">
        <div className={rowClassName(isAll)}>
          <button
            type="button"
            aria-current={isAll ? true : undefined}
            onClick={() => {
              selectSite?.('all', 'All Items')
            }}
            className="fk-nav-hit"
          >
            <NavIcon Icon={Inbox} />
            <span className="truncate">All Items</span>
          </button>
          <span className="fk-count">{totalEntries ?? ''}</span>
          {feedManifest?.allHref && (
            <FeedLink href={feedManifest.allHref} name="All Items" />
          )}
        </div>

        {(categories.length > 0 || (loading && !failed)) && (
          <p className="fk-label fk-nav-head">Categories</p>
        )}

        {!categories.length && loading && !failed && <NavSkeleton />}

        {/* On a phone the sidebar is the only pane after Back; wider, the
            list pane already says so */}
        {!categories.length && failed && (
          <div
            className="flex flex-col items-start gap-2 px-2 pt-4 text-muted-foreground md:hidden"
            role="status"
          >
            <p>Couldn&apos;t load feeds.</p>
            <Button variant="outline" size="sm" onClick={retry}>
              Try again
            </Button>
          </div>
        )}

        {categories.map((category) => {
          const expanded = category.title === selection.expandedCategory
          const selected = expanded && selection.kind === 'category'
          const categoryFeedHref = feedManifest?.categories.get(category.title)
          return (
            <div key={category.title}>
              <div className={rowClassName(selected)}>
                <button
                  type="button"
                  onClick={() => {
                    selectCategory?.(category.title)
                  }}
                  className="fk-nav-hit"
                  aria-expanded={expanded}
                  aria-current={selected ? true : undefined}
                >
                  <NavIcon Icon={Folder} />
                  <span className="truncate">{category.title}</span>
                </button>
                <span className="fk-count">{category.totalEntries}</span>
                {categoryFeedHref && (
                  <FeedLink href={categoryFeedHref} name={category.title} />
                )}
              </div>
              {expanded && (
                <ul role="list">
                  {category.sites.map((site) => {
                    const siteSelected = site.key === selection.siteKey
                    return (
                      <li key={site.key}>
                        <button
                          type="button"
                          onClick={() => {
                            selectSite?.(site.key, site.title)
                          }}
                          aria-current={siteSelected ? true : undefined}
                          className={rowClassName(siteSelected, 'is-site')}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {site.title}
                          </span>
                          <span className="fk-count">{site.totalEntries}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}

        {!categories.length && !loading && (
          <p className="px-2 pt-4 text-muted-foreground" role="status">
            No categories found.
          </p>
        )}

        <p className="fk-label fk-nav-head">Subscriptions</p>
        <button
          type="button"
          onClick={() => {
            selectOpml?.()
          }}
          className={rowClassName(isOpml)}
          aria-current={isOpml ? true : undefined}
        >
          <NavIcon Icon={Settings} />
          <span className="min-w-0 flex-1 truncate">Edit OPML</span>
        </button>
      </div>
    </nav>
  )
}
