import React, { Fragment, useState } from 'react'
import { Category } from '../storage'

interface Props {
  className?: string
  categories: Category[]
  totalEntries: number | null
  selectCategory?: (category: string) => void
  selectSite?: (site: string) => void
}
const CategoryList = ({
  className,
  categories,
  totalEntries,
  selectCategory,
  selectSite
}: Props) => {
  const [currentCategory, setCurrentCategory] = useState<string | undefined>()

  return (
    <aside
      className={`prose max-w-none w-full sm:w-48 xl:w-96 flex-shrink-0 p-6 ${className}`}
    >
      <h1>Feeds</h1>
      <h2 className="cursor-pointer">
        <a className="mr-2" onClick={() => selectSite && selectSite('all')}>
          All sites
        </a>
        {totalEntries !== null && (
          <small className="text-sm font-light">({totalEntries})</small>
        )}
      </h2>
      {categories.map((category) => (
        <Fragment key={category.title}>
          <h2 className="cursor-pointer">
            <a
              className="mr-2"
              onClick={() => setCurrentCategory(category.title)}
            >
              {category.title}
            </a>
            <small className="text-sm font-light">
              ({category.totalEntries})
            </small>
          </h2>
          {category.title === currentCategory && (
            <ul>
              <li className="cursor-pointer">
                <a
                  onClick={() =>
                    selectCategory && selectCategory(currentCategory)
                  }
                >
                  All sites
                </a>
              </li>
              {category.sites.map((site) => (
                <li key={site.key} className="cursor-pointer">
                  <a onClick={() => selectSite && selectSite(site.key)}>
                    {site.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Fragment>
      ))}
      <div className="pb-8"></div>
    </aside>
  )
}

export default CategoryList
