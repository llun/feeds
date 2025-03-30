import React, { useState } from 'react'
import Image from 'next/image'
import { Category } from '../storage/types'
import { ThemeToggle } from './ThemeToggle'

interface CategoryListProps {
  categories: Category[]
  totalEntries: number | null
  selectCategory?: (category: string) => void
  selectSite?: (siteKey: string, siteTitle: string) => void
}

export const CategoryList = ({
  categories,
  totalEntries,
  selectCategory,
  selectSite
}: CategoryListProps) => {
  const [currentCategory, setCurrentCategory] = useState<string | undefined>()
  return (
    <nav className="space-y-4 p-4 border-r border-gray-200 dark:border-gray-700 h-full overflow-y-auto">
      <div className="mb-6 flex items-center justify-between">
        <span className="inline-flex items-center">
          <Image
            src="/logo.svg"
            alt="RSS Feed Icon"
            width={32}
            height={32}
            className="dark:invert"
            priority
          />
          <h1 className="text-xl font-bold ml-2">FEEDS</h1>
        </span>
        <ThemeToggle />
      </div>
      <div className="mb-4">
        <button
          onClick={() => {
            selectSite?.('all', 'All Items')
          }}
          className={`block font-medium hover:text-blue-600 dark:hover:text-blue-400`}
        >
          All Items
          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
            ({totalEntries ?? 0})
          </span>
        </button>
      </div>
      {categories.map((category) => (
        <div key={category.title} className="mb-4">
          <button
            onClick={() => {
              setCurrentCategory(category.title)
              selectCategory?.(category.title)
            }}
            className={`block font-medium hover:text-blue-600 dark:hover:text-blue-400 text-left ${
              category.title === currentCategory
                ? 'text-blue-700 dark:text-blue-500'
                : ''
            }`}
          >
            {category.title}
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
              ({category.totalEntries})
            </span>
          </button>
          {currentCategory === category.title && (
            <ul className="ml-4 mt-2 space-y-1">
              {category.sites.map((site) => (
                <li key={site.key}>
                  <button
                    onClick={() => {
                      selectSite?.(site.key, site.title)
                    }}
                    className={`block text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 text-left`}
                  >
                    {site.title}
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      ({site.totalEntries})
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {!categories.length && (
        <p className="text-sm text-gray-500">No categories found.</p>
      )}
    </nav>
  )
}
