'use client'

import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface OpmlCategoryDialogProps {
  isOpen: boolean
  initialName?: string
  existingCategories: string[]
  onClose: () => void
  onSave: (name: string) => void
}

export const OpmlCategoryDialog: React.FC<OpmlCategoryDialogProps> = ({
  isOpen,
  initialName = '',
  existingCategories,
  onClose,
  onSave
}) => {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(initialName)
    setError(null)
  }, [initialName, isOpen])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Category name cannot be empty')
      return
    }
    if (
      trimmed.toLowerCase() !== initialName.toLowerCase() &&
      existingCategories.some((c) => c.toLowerCase() === trimmed.toLowerCase())
    ) {
      setError('A category with this name already exists')
      return
    }
    onSave(trimmed)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl animate-pop-in">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <h3 className="text-lg font-semibold text-card-foreground">
            {initialName ? 'Rename Category' : 'Add Category'}
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
              htmlFor="category-name"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Category Name
            </label>
            <input
              id="category-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              placeholder="e.g. Technology, News, Podcasts"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-ring"
              autoFocus
            />
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>

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
              {initialName ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
