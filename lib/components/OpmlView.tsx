'use client'

import React, { FC, useState, useRef, useMemo } from 'react'
import { Folder, Rss, GitPullRequest } from 'lucide-react'
import { Button } from './Button'
import {
  describeOpmlDiff,
  formatOpmlIssueBody,
  buildIssueUrl,
  MAX_URL_LENGTH,
  OPML_ISSUE_TITLE
} from '../opml-diff'
import { generateOpml, parseOpml, type OpmlCategory } from '../opml'
import { Category } from '../storage/types'

interface OpmlViewProps {
  active?: boolean
  onBack?: () => void
  initialOpml?: string
  categories?: Category[]
}

const DEFAULT_STARTER_OPML: OpmlCategory[] = [
  {
    category: 'Category1',
    items: [
      {
        type: 'rss',
        text: '@llun story',
        title: '@llun story',
        xmlUrl: 'https://www.llun.me/feeds/main',
        htmlUrl: 'https://www.llun.me/'
      }
    ]
  }
]

function categoriesToOpmlModel(categories?: Category[]): OpmlCategory[] {
  if (!categories || categories.length === 0) {
    return DEFAULT_STARTER_OPML
  }
  return categories.map((cat) => ({
    category: cat.title,
    items: cat.sites.map((s) => ({
      type: 'rss',
      title: s.title,
      text: s.title,
      xmlUrl: s.xmlUrl || s.htmlUrl || '',
      htmlUrl: s.htmlUrl || ''
    }))
  }))
}

function parseOpmlSafe(src: string): { cats?: OpmlCategory[]; error?: string } {
  try {
    if (!src || !src.trim()) {
      return { error: 'Empty OPML source.' }
    }
    if (!src.includes('<opml') && !src.includes('<outline')) {
      return { error: 'Invalid XML — check the markup.' }
    }
    const cats = parseOpml(src)
    if (!cats.length) {
      return { error: 'No <outline> elements found inside <body>.' }
    }
    return { cats }
  } catch {
    return { error: 'Invalid XML — check the markup.' }
  }
}

function getRepositoryName(): string {
  if (process.env.NEXT_PUBLIC_GITHUB_REPOSITORY) {
    return process.env.NEXT_PUBLIC_GITHUB_REPOSITORY
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host.endsWith('.github.io')) {
      const owner = host.replace(/\.github\.io$/, '')
      const parts = window.location.pathname.split('/').filter(Boolean)
      const repo = parts[0] || 'feeds'
      return `${owner}/${repo}`
    }
    const saved = window.localStorage.getItem('feeds_github_repo')
    if (saved) return saved
  }
  return ''
}

export const OpmlView: FC<OpmlViewProps> = ({
  active = true,
  onBack,
  initialOpml,
  categories
}) => {
  const defaultInitial = useMemo(() => {
    if (initialOpml) return initialOpml
    return generateOpml(categoriesToOpmlModel(categories), 'Feeds')
  }, [initialOpml, categories])

  const [src, setSrc] = useState<string>(defaultInitial)
  const [mode, setMode] = useState<'form' | 'xml'>('form')
  const [copied, setCopied] = useState(false)
  const [repo, setRepo] = useState<string>(() => getRepositoryName())
  const taRef = useRef<HTMLTextAreaElement>(null)

  const pristine = defaultInitial
  const dirty = src !== pristine
  const parsed = useMemo(() => parseOpmlSafe(src), [src])

  const diffResult = useMemo(
    () => describeOpmlDiff(pristine, src),
    [pristine, src]
  )

  const issueUrl = useMemo(() => {
    const targetRepo = repo || 'owner/repo'
    const body = formatOpmlIssueBody(diffResult.summary, src)
    return buildIssueUrl(targetRepo, OPML_ISSUE_TITLE, body)
  }, [repo, diffResult.summary, src])

  const isUrlTooLarge = issueUrl.length > MAX_URL_LENGTH

  const saveOpml = () => {
    let targetRepo = repo
    if (!targetRepo && typeof window !== 'undefined') {
      const input = window.prompt('Enter your GitHub repository (owner/repo):')
      if (input) {
        targetRepo = input.trim()
        window.localStorage.setItem('feeds_github_repo', targetRepo)
        setRepo(targetRepo)
      }
    }
    if (!targetRepo) return

    const body = formatOpmlIssueBody(diffResult.summary, src)
    const url = buildIssueUrl(targetRepo, OPML_ISSUE_TITLE, body)
    if (url.length <= MAX_URL_LENGTH) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const copy = () => {
    const done = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(src).then(done, () => {
        fallback()
        done()
      })
    } else {
      fallback()
      done()
    }

    function fallback() {
      if (!taRef.current) return
      taRef.current.select()
      try {
        document.execCommand('copy')
      } catch {}
      window.getSelection()?.removeAllRanges()
    }
  }

  const edit = (fn: (model: OpmlCategory[]) => void) => {
    const model: OpmlCategory[] = (parsed.cats || []).map((c) => ({
      category: c.category,
      items: c.items.map((item) => ({ ...item }))
    }))
    fn(model)
    setSrc(generateOpml(model, 'Feeds'))
  }

  return (
    <section
      className={`fk-pane fk-opml ${active ? 'is-active' : ''}`}
      aria-label="Edit OPML"
    >
      <div className="fk-backbar">
        <Button
          variant="ghost"
          size="sm"
          iconLeft="chevron-left"
          onClick={onBack}
        >
          Feeds
        </Button>
      </div>

      <div className="fk-list-head">
        <div className="fk-list-titlebar">
          <h1 className="fk-list-title">feeds.opml</h1>
          <div className="fk-list-tools" style={{ gap: 6 }}>
            <span className="fk-opml-seg" role="group" aria-label="Editor mode">
              <Button
                variant={mode === 'form' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setMode('form')}
              >
                Editor
              </Button>
              <Button
                variant={mode === 'xml' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setMode('xml')}
              >
                XML
              </Button>
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty}
              onClick={() => setSrc(pristine)}
            >
              Reset
            </Button>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={copied ? 'check' : undefined}
              onClick={copy}
            >
              {copied ? 'Copied' : 'Copy OPML'}
            </Button>
            <Button
              variant="brand"
              size="sm"
              iconLeft={<GitPullRequest size={14} />}
              disabled={!dirty || Boolean(parsed.error) || isUrlTooLarge}
              title={
                isUrlTooLarge
                  ? 'OPML is too large for GitHub URL limit. Please copy and commit manually.'
                  : undefined
              }
              onClick={saveOpml}
            >
              Save OPML
            </Button>
          </div>
        </div>
        <p className="fk-opml-hint">
          {isUrlTooLarge
            ? 'OPML content exceeds the GitHub URL limit. Copy the output and commit feeds.opml to your repository manually.'
            : 'Save OPML creates a GitHub issue to update feeds.opml automatically, or you can copy and commit manually.'}
        </p>
      </div>

      {mode === 'form' ? (
        <div className="fk-opml-form">
          {parsed.error ? (
            <div className="fk-opml-err">
              {parsed.error} Fix it in the{' '}
              <Button variant="link" size="sm" onClick={() => setMode('xml')}>
                XML tab
              </Button>{' '}
              or reset.
            </div>
          ) : (
            <>
              {parsed.cats?.map((c, ci) => {
                const isUncategorized = c.category === 'default'
                return (
                  <section className="fk-opml-fcat" key={ci}>
                    <div className="fk-opml-frow fk-opml-fcat-head">
                      <Folder size={15} />
                      <input
                        className="fk-opml-in fk-opml-in-cat"
                        value={isUncategorized ? '' : c.category}
                        placeholder={
                          isUncategorized ? 'Uncategorized' : 'Category name'
                        }
                        aria-label="Category name"
                        disabled={isUncategorized}
                        onChange={(e) => {
                          const v = e.target.value
                          edit((m) => {
                            m[ci].category = v
                          })
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft="x"
                        aria-label="Remove category"
                        title="Remove category"
                        onClick={() => {
                          edit((m) => {
                            m.splice(ci, 1)
                          })
                        }}
                      />
                    </div>

                    {c.items.map((f, fi) => (
                      <div className="fk-opml-frow" key={fi}>
                        <Rss size={13} />
                        <input
                          className="fk-opml-in"
                          value={f.title || f.text}
                          placeholder="Feed title"
                          aria-label="Feed title"
                          onChange={(e) => {
                            const v = e.target.value
                            edit((m) => {
                              m[ci].items[fi].title = v
                              m[ci].items[fi].text = v
                            })
                          }}
                        />
                        <input
                          className="fk-opml-in fk-opml-in-url"
                          value={f.xmlUrl}
                          placeholder="https://site.com/rss.xml"
                          aria-label="Feed URL"
                          onChange={(e) => {
                            const v = e.target.value
                            edit((m) => {
                              m[ci].items[fi].xmlUrl = v
                            })
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          iconLeft="x"
                          aria-label="Remove feed"
                          title="Remove feed"
                          onClick={() => {
                            edit((m) => {
                              m[ci].items.splice(fi, 1)
                            })
                          }}
                        />
                      </div>
                    ))}

                    <div className="fk-opml-addfeed">
                      <Button
                        variant="link"
                        size="sm"
                        iconLeft="plus"
                        onClick={() => {
                          edit((m) => {
                            m[ci].items.push({
                              type: 'rss',
                              title: '',
                              text: '',
                              xmlUrl: '',
                              htmlUrl: ''
                            })
                          })
                        }}
                      >
                        Add feed
                      </Button>
                    </div>
                  </section>
                )
              })}

              <Button
                variant="outline"
                size="sm"
                iconLeft="plus"
                onClick={() => {
                  edit((m) => {
                    m.push({ category: 'New category', items: [] })
                  })
                }}
              >
                Add category
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="fk-opml-body">
          <textarea
            className="fk-opml-src"
            ref={taRef}
            value={src}
            spellCheck={false}
            aria-label="OPML source"
            onChange={(e) => setSrc(e.target.value)}
          />
          <div className="fk-opml-preview" aria-label="Subscription preview">
            <div className="fk-opml-pvhead">Preview</div>
            {parsed.error ? (
              <div className="fk-opml-err">{parsed.error}</div>
            ) : (
              parsed.cats?.map((c, i) => (
                <div key={i}>
                  {c.category !== 'default' ? (
                    <div className="fk-opml-cat">
                      <Folder size={14} /> {c.category}
                      <span className="fk-opml-n">
                        {c.items ? c.items.length : 0}
                      </span>
                    </div>
                  ) : null}
                  {c.items?.map((f, j) => (
                    <div className="fk-opml-feed" key={j}>
                      <Rss size={13} />
                      <div>
                        <div className="fk-opml-feed-t">
                          {f.title || f.text || 'Untitled'}
                        </div>
                        <div className="fk-opml-feed-u">
                          {f.xmlUrl || 'missing xmlUrl'}
                        </div>
                      </div>
                    </div>
                  ))}
                  {!c.items?.length ? (
                    <div className="fk-opml-feed fk-opml-feed-u">no feeds</div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  )
}
