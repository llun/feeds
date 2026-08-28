'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import {
  FolderPlus,
  Rss,
  Trash2,
  Edit2,
  Plus,
  Upload,
  RotateCcw,
  ArrowLeft,
  Folder
} from 'lucide-react'
import { useOpmlEditor } from '../../opml/useOpmlEditor'
import { OpmlCategoryDialog } from './OpmlCategoryDialog'
import { OpmlFeedDialog } from './OpmlFeedDialog'
import { OpmlImportDialog } from './OpmlImportDialog'
import { OpmlXmlPreview } from './OpmlXmlPreview'
import { ThemeToggle } from '../ThemeToggle'
import { Logo } from '../Logo'
import { OpmlItem } from '../../opml'

export const OpmlEditor: React.FC = () => {
  const {
    state,
    generatedXml,
    totalFeeds,
    addCategory,
    removeCategory,
    renameCategory,
    addFeed,
    removeFeed,
    updateFeed,
    loadFromXml,
    reset
  } = useOpmlEditor()

  // Modal dialog states
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)
  const [editingCategoryName, setEditingCategoryName] = useState<
    string | undefined
  >()

  const [isFeedDialogOpen, setIsFeedDialogOpen] = useState(false)
  const [feedDialogTargetCategory, setFeedDialogTargetCategory] =
    useState<string>('Category1')
  const [editingFeed, setEditingFeed] = useState<OpmlItem | null>(null)

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)

  // Open add category
  const handleOpenAddCategory = () => {
    setEditingCategoryName(undefined)
    setIsCategoryDialogOpen(true)
  }

  // Open rename category
  const handleOpenRenameCategory = (catName: string) => {
    setEditingCategoryName(catName)
    setIsCategoryDialogOpen(true)
  }

  // Save category (add or rename)
  const handleSaveCategory = (name: string) => {
    if (editingCategoryName) {
      renameCategory(editingCategoryName, name)
    } else {
      addCategory(name)
    }
  }

  // Open add feed
  const handleOpenAddFeed = (catName: string) => {
    setFeedDialogTargetCategory(catName)
    setEditingFeed(null)
    setIsFeedDialogOpen(true)
  }

  // Open edit feed
  const handleOpenEditFeed = (catName: string, feed: OpmlItem) => {
    setFeedDialogTargetCategory(catName)
    setEditingFeed(feed)
    setIsFeedDialogOpen(true)
  }

  // Save feed (add or update)
  const handleSaveFeed = (
    category: string,
    feed: OpmlItem,
    oldXmlUrl?: string
  ) => {
    if (oldXmlUrl) {
      updateFeed(feedDialogTargetCategory, oldXmlUrl, feed, category)
    } else {
      addFeed(category, feed)
    }
  }

  const categoryNames = state.categories.map((c) => c.category)

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {/* Top Navigation Bar */}
      <header className="flex items-center justify-between border-b border-border bg-sidebar px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-ring"
            title="Return to Feeds Reader"
          >
            <ArrowLeft size={16} />
            <span>Back to Reader</span>
          </Link>
          <div className="h-4 w-px bg-border" />
          <span className="inline-flex items-center gap-2">
            <Logo size={24} />
            <h1 className="text-base font-bold tracking-wide">OPML EDITOR</h1>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsImportDialogOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-3 focus-ring"
            title="Import / Paste OPML"
          >
            <Upload size={14} />
            <span className="hidden sm:inline">Import OPML</span>
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-ring"
            title="Reset to default starter template"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">Reset</span>
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Workspace Split View */}
      <main className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* Left Column: Visual Tree Editor */}
        <section
          className="flex h-full w-full md:w-1/2 flex-col border-b md:border-b-0 md:border-r border-border bg-surface-1 overflow-hidden"
          aria-label="Feeds and Categories Editor"
        >
          {/* Section Toolbar */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-surface-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Categories &amp; Feeds
              </h2>
              <p className="text-xs text-muted-foreground">
                Add, remove, or edit feeds and categories in memory
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenAddCategory}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground transition-colors hover:bg-brand-hover focus-ring"
            >
              <FolderPlus size={14} />
              <span>Add Category</span>
            </button>
          </div>

          {/* Categories List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {state.categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <p className="text-sm font-medium">No categories in memory</p>
                <p className="mt-1 text-xs">
                  Click &ldquo;Add Category&rdquo; or &ldquo;Import OPML&rdquo;
                  to start.
                </p>
              </div>
            ) : (
              state.categories.map((category) => (
                <div
                  key={category.category}
                  className="rounded-lg border border-border bg-card p-3 shadow-xs"
                >
                  {/* Category Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <Folder size={16} className="text-brand shrink-0" />
                      <span className="font-semibold text-sm text-card-foreground">
                        {category.category === 'default'
                          ? 'Root (No Category)'
                          : category.category}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({category.items.length}{' '}
                        {category.items.length === 1 ? 'feed' : 'feeds'})
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenAddFeed(category.category)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-brand hover:bg-brand-subtle focus-ring"
                        title="Add feed to this category"
                      >
                        <Plus size={14} />
                        <span>Add Feed</span>
                      </button>
                      {category.category !== 'default' && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenRenameCategory(category.category)
                            }
                            className="rounded p-1 text-muted-foreground hover:bg-surface-3 hover:text-foreground focus-ring"
                            title="Rename category"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeCategory(category.category)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-ring"
                            title="Remove category"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Feeds inside Category */}
                  <div className="pt-2">
                    {category.items.length === 0 ? (
                      <p className="py-2 text-center text-xs text-muted-foreground italic">
                        No feeds in this category. Click &ldquo;Add Feed&rdquo;
                        above.
                      </p>
                    ) : (
                      <ul className="space-y-1.5" role="list">
                        {category.items.map((feed) => (
                          <li
                            key={feed.xmlUrl}
                            className="flex items-center justify-between rounded-md bg-surface-2 px-2.5 py-1.5 transition-colors hover:bg-surface-3"
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="flex items-center gap-1.5">
                                <Rss
                                  size={13}
                                  className="text-muted-foreground shrink-0"
                                />
                                <span className="truncate text-xs font-medium text-foreground">
                                  {feed.title || feed.text}
                                </span>
                              </div>
                              <p className="truncate text-[11px] text-muted-foreground font-mono pl-4">
                                {feed.xmlUrl}
                              </p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenEditFeed(category.category, feed)
                                }
                                className="rounded p-1 text-muted-foreground hover:text-foreground focus-ring"
                                title="Edit feed"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  removeFeed(category.category, feed.xmlUrl)
                                }
                                className="rounded p-1 text-muted-foreground hover:text-destructive focus-ring"
                                title="Remove feed"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Right Column: Generated OPML Preview */}
        <section
          className="flex h-full w-full md:w-1/2 flex-col overflow-hidden"
          aria-label="OPML Code Output"
        >
          <OpmlXmlPreview
            xmlContent={generatedXml}
            totalCategories={state.categories.length}
            totalFeeds={totalFeeds}
          />
        </section>
      </main>

      {/* Dialogs */}
      <OpmlCategoryDialog
        isOpen={isCategoryDialogOpen}
        initialName={editingCategoryName}
        existingCategories={categoryNames}
        onClose={() => setIsCategoryDialogOpen(false)}
        onSave={handleSaveCategory}
      />

      <OpmlFeedDialog
        isOpen={isFeedDialogOpen}
        initialCategory={feedDialogTargetCategory}
        initialFeed={editingFeed}
        categories={categoryNames}
        onClose={() => setIsFeedDialogOpen(false)}
        onSave={handleSaveFeed}
      />

      <OpmlImportDialog
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
        onImport={(opmlText) => loadFromXml(opmlText)}
      />
    </div>
  )
}
