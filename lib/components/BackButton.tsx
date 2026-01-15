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
      className="md:hidden inline-flex items-center text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 rounded-md px-2 py-1 mr-3"
      aria-label="Go back"
    >
      <ChevronLeft className="h-5 w-5 mr-1" /> Back
    </button>
  )
}
