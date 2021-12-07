import Link from 'next/link'
import { Fragment } from 'react'
import { GithubConfigs } from '../data'

interface Props {
  githubConfigs: GithubConfigs
  categories: string[]
}
const Navigation = ({ githubConfigs, categories }: Props) => {
  return (
    <aside className="prose w-full sm:w-48 xl:w-96 flex-shrink-0 p-6 block">
      <h1>Feeds</h1>
      <h2 className="cursor-pointer">
        <Link href={`${githubConfigs.repository}/all`}>All sites</Link>
      </h2>
      {categories.map((category) => (
        <Fragment key={category}>
          <h2 className="cursor-pointer">{category}</h2>
        </Fragment>
      ))}
      <div className="pb-8"></div>
    </aside>
  )
}

export default Navigation
