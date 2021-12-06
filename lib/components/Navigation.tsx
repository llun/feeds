import Link from 'next/link'
import { GithubConfigs } from '../config'

interface Props {
  githubConfigs: GithubConfigs
}
const Navigation = ({ githubConfigs }: Props) => {
  return (
    <aside className="prose w-full sm:w-48 xl:w-96 flex-shrink-0 p-6 block">
      <h1>Feeds</h1>
      <h2 className="cursor-pointer">
        <Link href={`${githubConfigs.repository}/all`}>All sites</Link>
      </h2>
    </aside>
  )
}

export default Navigation
