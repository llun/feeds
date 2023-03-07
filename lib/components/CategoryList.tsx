import { Fragment, useState } from 'react'
import { Category } from '../storage/types'

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
      className={`w-full sm:w-1/3 xl:w-1/5 flex-shrink-0 p-6 sm:overflow-auto overscroll-contain ${className}`}
    >
      <h1 className="font-serif">Feeds</h1>
      <h2 className="cursor-pointer">
        <a
          className="font-serif no-underline hover:underline mr-2"
          onClick={() => selectSite && selectSite('all')}
        >
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
              className="font-serif no-underline hover:underline mr-2"
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
                  className="font-serif no-underline hover:underline"
                  onClick={() =>
                    selectCategory && selectCategory(currentCategory)
                  }
                >
                  All sites
                </a>
              </li>
              {category.sites.map((site) => (
                <li key={site.key} className="cursor-pointer">
                  <a
                    className="font-serif no-underline hover:underline mr-2"
                    onClick={() => selectSite && selectSite(site.key)}
                  >
                    {site.title}
                  </a>
                  <small className="text-sm font-light">
                    ({site.totalEntries})
                  </small>
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
