import Navigation from './Navigation'
import { Category } from '../storage'

interface Props {
  categories: Category[]
}
const Application = ({ categories }: Props) => {
  return (
    <div className="container mx-auto flex flex-row w-screen h-screen">
      <Navigation categories={categories} />
    </div>
  )
}

export default Application
