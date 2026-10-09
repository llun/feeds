import React from 'react'
import { Folder, Inbox, Rss, Settings } from 'lucide-react'
import { Category } from '../storage/types'
import type { FeedManifestMap } from '../feed-manifest'
import { ThemeToggle } from './ThemeToggle'
import { Logo } from './Logo'
import { NavSkeleton } from './Skeleton'
import { LocationState, formatRelativeTime, getNavSelection } from '../utils'

interface CategoryListProps {
  categories: Category[]
  totalEntries: number | null
  version?: string
  buildTime?: string | null
  locationState?: LocationState
  loading?: boolean
  // The feed set could not be loaded; the list pane says so
  failed?: boolean
  feedManifest?: FeedManifestMap | null
  selectCategory?: (category: string) => void
  selectSite?: (siteKey: string, siteTitle: string) => void
  selectOpml?: () => void
}

// Idle and selected are kept mutually exclusive rather than layered: Tailwind
// emits same-property utilities in its own order, not the order they appear in
// the class string, so an override appended here would not reliably win.
// The sidebar sits one step above the page, so rows hover to surface-3 rather
// than the page-level surface-2, which is the sidebar's own color.
const navItemClassName =
  'relative flex min-h-8 w-full items-center pointer-coarse:min-h-11 gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors'

const idleNavItemClassName =
  'font-medium text-subtle hover:bg-surface-3 hover:text-foreground'

const selectedNavItemClassName =
  'bg-surface-3 font-semibold text-brand-emphasis'

const countClassName = 'shrink-0 text-xs tabular-nums text-faint'

export const CategoryList = ({
  categories,
  totalEntries,
  version,
  buildTime,
  locationState,
  loading,
  failed,
  feedManifest,
  selectCategory,
  selectSite,
  selectOpml
}: CategoryListProps) => {
  const selection = getNavSelection(locationState ?? null, categories)
  const isOpml = selection.kind === 'opml'
  const isAll = selection.kind === 'all'

  return (
    <nav
      className="flex h-full flex-col border-border bg-sidebar text-sidebar-foreground md:border-r"
      aria-label="Categories and feeds"
    >
      <div className="flex items-center justify-between p-4 pb-2.5">
        <span className="inline-flex items-center gap-2">
          <Logo size={30} />
          <h1 className="text-xl leading-5 font-bold tracking-[0.02em]">
            FEEDS
          </h1>
        </span>
        <ThemeToggle />
      </div>

      {/* pt-1 keeps the first row's focus ring clear of the scroll clip */}
      <div className="flex-1 overflow-y-auto px-3 pt-1 pb-4">
        <div
          className={`${navItemClassName} ${
            isAll ? selectedNavItemClassName : idleNavItemClassName
          }`}
        >
          <button
            type="button"
            aria-current={isAll ? true : undefined}
            onClick={() => {
              selectSite?.('all', 'All Items')
            }}
            className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-ring after:absolute after:inset-0 after:rounded-md after:content-['']"
          >
            <Inbox
              size={16}
              className={`shrink-0 ${isAll ? 'text-brand' : 'text-faint'}`}
            />
            <span className="truncate">All Items</span>
          </button>
          <span className={countClassName}>{totalEntries ?? ''}</span>
          {feedManifest?.allHref && (
            <a
              href={feedManifest.allHref}
              target="_blank"
              rel="noopener noreferrer"
              type="application/atom+xml"
              aria-label="Open Atom feed for All Items"
              title="Open Atom feed for All Items"
              className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground hover:bg-surface-3 focus-ring"
              onClick={(e) => e.stopPropagation()}
            >
              <Rss size={13} aria-hidden="true" />
            </a>
          )}
        </div>

        {(categories.length > 0 || (loading && !failed)) && (
          <p className="feeds-eyebrow mx-1.5 mt-4 mb-1.5">Categories</p>
        )}

        {!categories.length && loading && !failed && <NavSkeleton />}

        {categories.map((category) => {
          const expanded = category.title === selection.expandedCategory
          const selected = expanded && selection.kind === 'category'
          const categoryFeedHref = feedManifest?.categories.get(category.title)
          return (
            <div key={category.title}>
              <div
                className={`${navItemClassName} ${
                  selected ? selectedNavItemClassName : idleNavItemClassName
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    selectCategory?.(category.title)
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-ring after:absolute after:inset-0 after:rounded-md after:content-['']"
                  aria-expanded={expanded}
                  aria-current={selected ? true : undefined}
                >
                  <Folder
                    size={16}
                    className={`shrink-0 ${
                      selected ? 'text-brand' : 'text-faint'
                    }`}
                  />
                  <span className="truncate">{category.title}</span>
                </button>
                <span className={countClassName}>{category.totalEntries}</span>
                {categoryFeedHref && (
                  <a
                    href={categoryFeedHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    type="application/atom+xml"
                    aria-label={`Open Atom feed for ${category.title}`}
                    title={`Open Atom feed for ${category.title}`}
                    className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground hover:bg-surface-3 focus-ring"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Rss size={13} aria-hidden="true" />
                  </a>
                )}
              </div>
              {expanded && (
                <ul className="my-0.5" role="list">
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
                          className={`flex min-h-7.5 w-full pointer-coarse:min-h-11 items-center gap-2 rounded-md py-1 pr-2 pl-7 text-left text-sm transition-colors focus-ring ${
                            siteSelected
                              ? 'bg-surface-3 font-semibold text-brand-emphasis'
                              : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground'
                          }`}
                        >
                          <span className="flex-1 truncate">{site.title}</span>
                          <span className={countClassName}>
                            {site.totalEntries}
                          </span>
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
          <p className="px-2 pt-4 text-xs leading-4 text-faint" role="status">
            No categories found.
          </p>
        )}

        <p className="feeds-eyebrow mx-1.5 mt-4 mb-1.5">Subscriptions</p>
        <button
          type="button"
          onClick={() => {
            selectOpml?.()
          }}
          className={`${navItemClassName} ${
            isOpml ? selectedNavItemClassName : idleNavItemClassName
          }`}
          aria-current={isOpml ? true : undefined}
        >
          <Settings
            size={16}
            className={`shrink-0 ${isOpml ? 'text-brand' : 'text-faint'}`}
          />
          <span className="flex-1 truncate">Edit OPML</span>
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-3.5 py-2.5 text-xs text-faint">
        {buildTime && !loading && (
          <span className="min-w-0 truncate">
            Updated {formatRelativeTime(new Date(buildTime).getTime())}
          </span>
        )}
        {version && <span className="ml-auto shrink-0">v{version}</span>}
      </div>
    </nav>
  )
}
