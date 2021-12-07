import { Fragment } from 'react'
import { Category, GithubConfigs } from '../data'

interface Props {
  githubConfigs: GithubConfigs
  categories: Category[]
  selectCategory?: (category: string) => Promise<void>
  selectSite?: (site: string) => Promise<void>
}
const Navigation = ({ categories, selectCategory, selectSite }: Props) => {
  return (
    <aside className="prose max-w-none w-full sm:w-48 xl:w-96 flex-shrink-0 p-6 block">
      <h1>Feeds</h1>
      <h2 className="cursor-pointer">
        <a onClick={() => selectSite && selectSite('all')}>All sites</a>
      </h2>
      {categories.map((category) => (
        <Fragment key={category.name}>
          <h2 className="cursor-pointer">
            <a onClick={() => selectCategory && selectCategory(category.name)}>
              {category.name}
            </a>
          </h2>
          <ul>
            <li>
              <a
                onClick={() => selectCategory && selectCategory(category.name)}
              >
                All sites
              </a>
            </li>
            {category.sites.map((site) => (
              <li key={site.id} className="cursor-pointer">
                <a onClick={() => selectSite && selectSite(site.id)}>
                  {site.name}
                </a>
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
      <div className="pb-8"></div>
    </aside>
  )
}

export default Navigation
