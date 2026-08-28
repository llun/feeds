'use client'

import React, { useState } from 'react'
import { X, Upload } from 'lucide-react'

interface OpmlImportDialogProps {
  isOpen: boolean
  onClose: () => void
  onImport: (opmlXml: string) => void
}

export const OpmlImportDialog: React.FC<OpmlImportDialogProps> = ({
  isOpen,
  onClose,
  onImport
}) => {
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setContent(text || '')
      setError(null)
    }
    reader.onerror = () => {
      setError('Failed to read file')
    }
    reader.readAsText(file)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = content.trim()
    if (!trimmed) {
      setError('Please paste OPML XML or upload an OPML file')
      return
    }
    if (!trimmed.includes('<opml') && !trimmed.includes('<outline')) {
      setError('The provided content does not appear to be a valid OPML file')
      return
    }

    onImport(trimmed)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-6 shadow-xl animate-pop-in">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <h3 className="text-lg font-semibold text-card-foreground">
            Import OPML Content
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
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Upload .opml / .xml file
            </label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-brand hover:text-foreground">
              <Upload size={16} />
              <span>Choose file from device</span>
              <input
                type="file"
                accept=".opml,.xml"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <label
              htmlFor="opml-raw-content"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Or paste OPML XML directly:
            </label>
            <textarea
              id="opml-raw-content"
              rows={8}
              value={content}
              onChange={(e) => {
                setContent(e.target.value)
                setError(null)
              }}
              placeholder="<?xml version='1.0' encoding='UTF-8'?>&#10;<opml version='2.0'>&#10;  ..."
              className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground focus-ring"
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
              Load into Editor
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
