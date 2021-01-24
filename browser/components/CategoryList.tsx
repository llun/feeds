import React, { Fragment, useState } from 'react'
import { CategoryData } from '../../action/eleventy/data'

const CategoryList = ({
  categories,
  selectCategory,
  selectSite
}: {
  categories: CategoryData[]
  selectCategory: (category: string) => Promise<void>
  selectSite: (siteHash: string) => Promise<void>
}) => {
  const [currentCategory, setCurrentCategory] = useState<string | undefined>()

  return (
    <aside className="prose w-96 flex-shrink-0 p-6 max-h-screen overflow-y-auto">
      <h1>Feeds</h1>
      <h2 className="cursor-pointer">
        <a onClick={() => selectSite('all')}>All sites</a>
      </h2>
      {categories.map((category) => (
        <Fragment key={category.name}>
          <h2 className="cursor-pointer">
            <a
              onClick={() => {
                selectCategory(category.name)
                setCurrentCategory(category.name)
              }}
            >
              {category.name}
            </a>
          </h2>
          {category.name === currentCategory && (
            <ul>
              {category.sites.map((site) => (
                <li key={site.siteHash} className="cursor-pointer">
                  <a onClick={() => selectSite(site.siteHash)}>{site.title}</a>
                </li>
              ))}
            </ul>
          )}
        </Fragment>
      ))}
    </aside>
  )
}
export default CategoryList
