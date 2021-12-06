import { GithubConfigs } from '../config'
import Navigation from './Navigation'

interface Props {
  githubConfigs: GithubConfigs
}
const Application = ({ githubConfigs }: Props) => {
  return (
    <div className="container mx-auto flex flex-row w-screen h-screen">
      <Navigation githubConfigs={githubConfigs} />
    </div>
  )
}

export default Application
