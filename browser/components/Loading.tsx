import React from 'react'

interface Props {
  className?: string
  percentage?: number
}

const Loading = ({ className = '', percentage }: Props) => {
  if (!percentage) return null
  return (
    <>
      <div className={`h-1 w-screen bg-gray-100 ${className}`.trim()}>
        <div
          className="h-full w-0 bg-blue-400"
          style={{ width: `${percentage}%`, transition: 'width 0.5s' }}
        ></div>
      </div>
    </>
  )
}
export default Loading
