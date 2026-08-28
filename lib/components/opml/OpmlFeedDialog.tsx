'use client'

import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { OpmlItem } from '../../opml'

interface OpmlFeedDialogProps {
  isOpen: boolean
  initialCategory: string
  initialFeed?: OpmlItem | null
  categories: string[]
  onClose: () => void
  onSave: (category: string, feed: OpmlItem, oldXmlUrl?: string) => void
}

export const OpmlFeedDialog: React.FC<OpmlFeedDialogProps> = ({
  isOpen,
  initialCategory,
  initialFeed,
  categories,
  onClose,
  onSave
}) => {
  const [category, setCategory] = useState(initialCategory)
  const [title, setTitle] = useState(initialFeed?.title || '')
  const [xmlUrl, setXmlUrl] = useState(initialFeed?.xmlUrl || '')
  const [htmlUrl, setHtmlUrl] = useState(initialFeed?.htmlUrl || '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCategory(initialCategory)
    setTitle(initialFeed?.title || '')
    setXmlUrl(initialFeed?.xmlUrl || '')
    setHtmlUrl(initialFeed?.htmlUrl || '')
    setError(null)
  }, [isOpen, initialCategory, initialFeed])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedTitle = title.trim()
    const trimmedXmlUrl = xmlUrl.trim()
    const trimmedHtmlUrl = htmlUrl.trim()

    if (!trimmedTitle) {
      setError('Feed title is required')
      return
    }
    if (!trimmedXmlUrl) {
      setError('Feed RSS/Atom URL is required')
      return
    }

    try {
      new URL(trimmedXmlUrl)
    } catch {
      setError(
        'Feed RSS/Atom URL must be a valid URL (e.g. https://example.com/rss)'
      )
      return
    }

    onSave(
      category,
      {
        type: initialFeed?.type || 'rss',
        title: trimmedTitle,
        text: trimmedTitle,
        xmlUrl: trimmedXmlUrl,
        htmlUrl: trimmedHtmlUrl || trimmedXmlUrl
      },
      initialFeed?.xmlUrl
    )
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl animate-pop-in">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <h3 className="text-lg font-semibold text-card-foreground">
            {initialFeed ? 'Edit Feed' : 'Add Feed'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-surface-3 hover:text-foreground focus-ring"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="feed-category"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Category
            </label>
            <select
              id="feed-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-ring"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'default' ? 'Root (No Category)' : cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="feed-title"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Feed Title *
            </label>
            <input
              id="feed-title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setError(null)
              }}
              placeholder="e.g. Hacker News, Ars Technica"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-ring"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="feed-xml-url"
              className="block text-sm font-medium text-foreground mb-1"
            >
              RSS / Atom Feed URL (xmlUrl) *
            </label>
            <input
              id="feed-xml-url"
              type="url"
              value={xmlUrl}
              onChange={(e) => {
                setXmlUrl(e.target.value)
                setError(null)
              }}
              placeholder="https://example.com/feed.xml"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-ring"
            />
          </div>

          <div>
            <label
              htmlFor="feed-html-url"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Website URL (htmlUrl)
            </label>
            <input
              id="feed-html-url"
              type="url"
              value={htmlUrl}
              onChange={(e) => setHtmlUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-ring"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground focus-ring"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-brand-foreground hover:bg-brand-hover focus-ring"
            >
              {initialFeed ? 'Save Changes' : 'Add Feed'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
