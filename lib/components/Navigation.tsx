import { Fragment, useState } from 'react'
import { Category } from '../storage'

interface Props {
  categories: Category[]
  selectCategory?: (category: string) => Promise<void>
  selectSite?: (site: string) => Promise<void>
}
const Navigation = ({ categories, selectCategory, selectSite }: Props) => {
  const [currentCategory, setCurrentCategory] = useState<string | undefined>()

  return (
    <aside className="prose max-w-none w-full sm:w-48 xl:w-96 flex-shrink-0 p-6 block">
      <h1>Feeds</h1>
      <h2 className="cursor-pointer">
        <a onClick={() => selectSite && selectSite('all')}>All sites</a>
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
                <a>All sites</a>
              </li>
              {category.sites.map((site) => (
                <li key={site.key} className="cursor-pointer">
                  <a onClick={() => selectSite(site.key)}>{site.name}</a>
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
