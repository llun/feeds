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

function isLocalMediaPath(url?: string) {
  return !!url && /^\/media\/.+/.test(url)
}

function withBasePath(url: string) {
  if (!isLocalMediaPath(url)) return url
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
  return `${basePath}${url}`
}

function rewriteLocalSrcSet(srcSet?: string) {
  if (!srcSet) return ''
  const candidates = srcSet
    .split(',')
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0)

  const rewritten = candidates
    .map((candidate) => {
      const [urlPart, ...descriptorParts] = candidate.split(/\s+/)
      if (!isLocalMediaPath(urlPart)) return null
      const descriptor = descriptorParts.join(' ').trim()
      const source = withBasePath(urlPart)
      return descriptor ? `${source} ${descriptor}` : source
    })
    .filter((candidate) => candidate)

  return rewritten.join(', ')
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
            <span className="text-gray-400 dark:text-gray-500">•</span>
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
        className="p-6 pt-4 prose dark:prose-invert lg:prose-xl max-w-full overflow-y-auto flex-1 overflow-x-hidden break-words [&_a]:underline [&_a:hover]:text-blue-600 [&_a:hover]:dark:text-blue-400 [&_a]:break-words [&_img]:max-w-full [&_img]:h-auto [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_table]:overflow-x-auto [&_table]:block [&_iframe]:max-w-full [&_video]:max-w-full [&_embed]:max-w-full [&_object]:max-w-full [&_code]:break-all [&_figure]:max-w-full"
        ref={(contentPane) => {
          element = contentPane
        }}
      >
        {parse(content.content, {
          replace: (domNode) => {
            const node = domNode as ReactParserNode
            if (node.attribs && node.name === 'a') {
              const href = node.attribs.href
              if (isLocalMediaPath(href)) {
                node.attribs.href = withBasePath(href)
              }
              node.attribs.target = '_blank'
              node.attribs.rel = 'noopener noreferrer'
              return node
            }
            if (node.attribs && node.name === 'img') {
              const source = node.attribs.src
              if (!source) return <></>
              if (source.startsWith('data:')) return node
              if (!isLocalMediaPath(source)) return <></>

              node.attribs.src = withBasePath(source)
              const srcSet = rewriteLocalSrcSet(node.attribs.srcset)
              if (srcSet) {
                node.attribs.srcset = srcSet
              } else {
                delete node.attribs.srcset
              }
              return node
            }
            return domNode
          }
        })}
      </div>
    </article>
  )
}
