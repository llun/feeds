import Link from 'next/link'
import { Fragment } from 'react'
import { Category, GithubConfigs } from '../data'

interface Props {
  githubConfigs: GithubConfigs
  categories: Category[]
}
const Navigation = ({ githubConfigs, categories }: Props) => {
  return (
    <aside className="prose max-w-none w-full sm:w-48 xl:w-96 flex-shrink-0 p-6 block">
      <h1>Feeds</h1>
      <h2 className="cursor-pointer">
        <Link href={`${githubConfigs.repository}/all`}>All sites</Link>
      </h2>
      {categories.map((category) => (
        <Fragment key={category.name}>
          <h2 className="cursor-pointer">{category.name}</h2>
          <ul>
            <li>All sites</li>
            {category.sites.map((site) => (
              <li key={site.id} className="cursor-pointer">
                {site.name}
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
