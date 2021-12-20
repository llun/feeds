import React, { Fragment, useState } from 'react'
import { Category } from '../storage'

interface Props {
  className?: string
  categories: Category[]
  selectCategory?: (category: string) => void
  selectSite?: (site: string) => void
}
const Navigation = ({
  className,
  categories,
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
        <a onClick={() => selectSite && selectSite('all')}>All sites</a>
      </h2>
      {categories.map((category) => (
        <Fragment key={category.title}>
          <h2 className="cursor-pointer">
            <a onClick={() => setCurrentCategory(category.title)}>
              {category.title}
            </a>
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

export default Navigation
