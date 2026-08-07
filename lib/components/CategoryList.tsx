import React, { useState } from 'react'
import { formatDistance } from 'date-fns'
import { Folder, Inbox } from 'lucide-react'
import { Category } from '../storage/types'
import { ThemeToggle } from './ThemeToggle'
import { Logo } from './Logo'

interface CategoryListProps {
  categories: Category[]
  totalEntries: number | null
  version?: string
  buildTime?: string | null
  selectCategory?: (category: string) => void
  selectSite?: (siteKey: string, siteTitle: string) => void
}

// The sidebar sits one step above the page, so its rows hover to surface-3
// rather than the page-level surface-2, which is the sidebar's own color.
const navItemClassName =
  'flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-subtle transition-colors hover:bg-surface-3 hover:text-foreground focus-ring'

const selectedNavItemClassName =
  'bg-brand-subtle font-semibold text-brand-emphasis hover:bg-brand-subtle hover:text-brand-emphasis'

const countClassName = 'shrink-0 text-xs tabular-nums text-muted-foreground'

export const CategoryList = ({
  categories,
  totalEntries,
  version,
  buildTime,
  selectCategory,
  selectSite
}: CategoryListProps) => {
  const [currentCategory, setCurrentCategory] = useState<string | undefined>()
  return (
    <nav
      className="flex h-full flex-col border-border bg-sidebar text-sidebar-foreground md:border-r"
      aria-label="Categories and feeds"
    >
      <div className="flex items-center justify-between p-4 pb-2.5">
        <span className="inline-flex items-center gap-2">
          <Logo size={30} />
          <h1 className="text-xl font-bold tracking-wide">FEEDS</h1>
        </span>
        <ThemeToggle />
      </div>

      {/* pt-1 keeps the first row's focus ring clear of the scroll clip */}
      <div className="flex-1 overflow-y-auto px-3 pt-1 pb-4">
        <button
          type="button"
          onClick={() => {
            setCurrentCategory(undefined)
            selectSite?.('all', 'All Items')
          }}
          className={navItemClassName}
        >
          <Inbox size={16} className="shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">All Items</span>
          <span className={countClassName}>{totalEntries ?? 0}</span>
        </button>

        {categories.length > 0 && (
          <p className="feeds-eyebrow mx-2 mt-4 mb-1.5">Categories</p>
        )}

        {categories.map((category) => {
          const selected = category.title === currentCategory
          return (
            <div key={category.title}>
              <button
                type="button"
                onClick={() => {
                  setCurrentCategory(category.title)
                  selectCategory?.(category.title)
                }}
                className={`${navItemClassName} ${
                  selected ? selectedNavItemClassName : ''
                }`}
                aria-expanded={selected}
                aria-current={selected ? true : undefined}
              >
                <Folder
                  size={16}
                  className={`shrink-0 ${
                    selected ? 'text-brand' : 'text-muted-foreground'
                  }`}
                />
                <span className="flex-1 truncate">{category.title}</span>
                <span className={countClassName}>{category.totalEntries}</span>
              </button>
              {selected && (
                <ul className="mt-0.5 space-y-0.5" role="list">
                  {category.sites.map((site) => (
                    <li key={site.key}>
                      <button
                        type="button"
                        onClick={() => {
                          selectSite?.(site.key, site.title)
                        }}
                        className="flex min-h-7.5 w-full items-center gap-2 rounded-md py-1 pr-2 pl-7 text-left text-sm text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-ring"
                      >
                        <span className="flex-1 truncate">{site.title}</span>
                        <span className={countClassName}>
                          {site.totalEntries}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}

        {!categories.length && (
          <p className="px-2 pt-4 text-sm text-muted-foreground" role="status">
            No categories found.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-3.5 py-2.5 text-xs text-muted-foreground">
        {buildTime && (
          <span className="min-w-0 truncate">
            Updated{' '}
            {formatDistance(new Date(buildTime), new Date(), {
              addSuffix: true
            })}
          </span>
        )}
        {version && <span className="ml-auto shrink-0">v{version}</span>}
      </div>
    </nav>
  )
}
