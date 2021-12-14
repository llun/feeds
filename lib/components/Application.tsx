import Navigation from './Navigation'

interface Props {
  categories: string[]
}
const Application = ({ categories }: Props) => {
  return (
    <div className="container mx-auto flex flex-row w-screen h-screen">
      <Navigation categories={categories} />
    </div>
  )
}

export default Application
