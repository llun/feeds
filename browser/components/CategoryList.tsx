import React, { Fragment, useState } from 'react'
import { CategoryData } from '../../action/eleventy/data'

interface Props {
  className?: string
  categories: CategoryData[]
  selectCategory: (category: string) => Promise<void>
  selectSite: (siteHash: string) => Promise<void>
}

const CategoryList = ({
  className,
  categories,
  selectCategory,
  selectSite
}: Props) => {
  const [currentCategory, setCurrentCategory] = useState<string | undefined>()

  return (
    <aside
      className={`prose w-full sm:w-48 xl:w-96 flex-shrink-0 p-6 ${className}`}
    >
      <h1>Feeds</h1>
      <h2 className="cursor-pointer">
        <a onClick={() => selectSite('all')}>All sites</a>
      </h2>
      {categories.map((category) => (
        <Fragment key={category.name}>
          <h2 className="cursor-pointer">
            <a onClick={() => setCurrentCategory(category.name)}>
              {category.name}
            </a>
          </h2>
          {category.name === currentCategory && (
            <ul>
              <li>
                <a
                  className="cursor-pointer"
                  onClick={() => selectCategory(currentCategory)}
                >
                  All sites in this category
                </a>
              </li>
              {category.sites.map((site) => (
                <li key={site.siteHash} className="cursor-pointer">
                  <a onClick={() => selectSite(site.siteHash)}>{site.title}</a>
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
