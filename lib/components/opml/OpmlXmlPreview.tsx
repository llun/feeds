'use client'

import React, { useState } from 'react'
import { Copy, Check, Download, FileCode } from 'lucide-react'

interface OpmlXmlPreviewProps {
  xmlContent: string
  totalCategories: number
  totalFeeds: number
}

export const OpmlXmlPreview: React.FC<OpmlXmlPreviewProps> = ({
  xmlContent,
  totalCategories,
  totalFeeds
}) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(xmlContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = xmlContent
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    const blob = new Blob([xmlContent], { type: 'text/xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'feeds.opml'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <section
      className="flex h-full flex-col overflow-hidden border-border bg-background"
      aria-label="Generated OPML preview"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-surface-2">
        <div className="flex items-center gap-2">
          <FileCode size={18} className="text-brand" />
          <h2 className="text-sm font-semibold text-foreground">
            OPML Output
          </h2>
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted-foreground font-medium">
            {totalCategories} categories • {totalFeeds} feeds
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            title="Download feeds.opml file"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-3 focus-ring"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            title="Copy OPML content to clipboard"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-xs font-medium text-brand-foreground transition-colors hover:bg-brand-hover focus-ring"
          >
            {copied ? (
              <>
                <Check size={14} className="text-white" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>Copy OPML</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="relative flex-1 p-3 overflow-hidden">
        <textarea
          readOnly
          value={xmlContent}
          className="h-full w-full resize-none rounded-md border border-border bg-surface-1 p-3 font-mono text-xs leading-relaxed text-foreground select-all focus-ring"
          aria-label="OPML XML Code"
        />
      </div>
    </section>
  )
}
