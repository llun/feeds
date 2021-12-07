import { Category, GithubConfigs } from '../data'
import Navigation from './Navigation'

interface Props {
  githubConfigs: GithubConfigs
  categories: Category[]
}
const Application = ({ githubConfigs, categories }: Props) => {
  return (
    <div className="container mx-auto flex flex-row w-screen h-screen">
      <Navigation githubConfigs={githubConfigs} categories={categories} />
    </div>
  )
}

export default Application
