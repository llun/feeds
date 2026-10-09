import React from 'react'
import { ChevronLeft } from 'lucide-react'

interface Props {
  onClickBack: () => void
}

export const BackButton = ({ onClickBack }: Props) => {
  return (
    <button
      type="button"
      onClick={onClickBack}
      className="inline-flex size-7 items-center justify-center rounded-md hit-target text-subtle transition-colors hover:bg-accent hover:text-foreground focus-ring md:hidden"
      aria-label="Go back"
    >
      <ChevronLeft size={16} />
    </button>
  )
}
