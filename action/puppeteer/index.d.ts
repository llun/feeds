export type ParseResponse = null | {
  /** article title */
  title: string
  /** author metadata */
  byline: string
  /** content direction */
  dir: string
  /** HTML of processed article content */
  content: string
  /** text content of the article (all HTML removed) */
  textContent: string
  /** length of an article, in characters */
  length: number
  /** article description, or short excerpt from the content */
  excerpt: string
  siteName: string
}

export declare const loadContent: (url: string) => Promise<string>
export declare const close: () => Promise<void>
