import React, { useEffect } from 'react'
import { Content } from '../storage/types'
import { format, formatDistance } from 'date-fns'
import { BackButton } from './BackButton'
import parse from 'html-react-parser'

interface ReactParserNode {
  name: string
  attribs?: {
    [key in string]: string
  }
}

interface ItemContentProps {
  content?: Content
  selectBack?: () => void
}

export const ItemContent = ({ content, selectBack }: ItemContentProps) => {
  let element: HTMLElement | null = null
  useEffect(() => {
    if (!element) return
    element.scrollTo(0, 0)
  }, [content])

  if (!content) {
    return (
      <div
        className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 p-8 text-center"
        role="status"
      >
        <p>Select an item from the list to view its content.</p>
      </div>
    )
  }

  return (
    <article className="h-full overflow-hidden flex flex-col">
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="md:hidden p-4 border-b border-gray-200 dark:border-gray-700">
          <BackButton onClickBack={selectBack} />
        </div>
        <div className="p-6 pb-3">
          <h1 className="text-2xl font-bold break-words">{content.title}</h1>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-2 flex flex-wrap gap-2 items-center">
            <time dateTime={new Date(content.timestamp * 1000).toISOString()}>
              Published:{' '}
              {formatDistance(content.timestamp * 1000, new Date(), {
                addSuffix: true
              })}
            </time>
            <span aria-hidden="true">|</span>
            <a
              href={content.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 rounded-md px-1 break-all"
            >
              View Original
            </a>
          </div>
        </div>
      </header>
      <div
        className="p-6 pt-4 prose dark:prose-invert lg:prose-xl max-w-full overflow-y-auto flex-1 overflow-x-hidden break-words [&_a]:underline [&_a:hover]:text-blue-600 [&_a:hover]:dark:text-blue-400 [&_a]:break-words [&_img]:max-w-full [&_img]:h-auto [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_table]:overflow-x-auto [&_table]:block"
        ref={(contentPane) => {
          element = contentPane
        }}
      >
        {parse(content.content, {
          replace: (domNode) => {
            const node = domNode as ReactParserNode
            if (node.attribs && node.name === 'a') {
              node.attribs.target = '_blank'
              node.attribs.rel = 'noopener noreferrer'
              return node
            }
            return domNode
          }
        })}
      </div>
    </article>
  )
}
