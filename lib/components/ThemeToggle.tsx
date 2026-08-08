import { useTheme } from 'next-themes'
import { Sun, Moon, Laptop, Check } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

const OPTIONS = [
  { value: 'light', label: 'Light', ariaLabel: 'Light mode', Icon: Sun },
  { value: 'dark', label: 'Dark', ariaLabel: 'Dark mode', Icon: Moon },
  {
    value: 'system',
    label: 'System',
    ariaLabel: 'System preference',
    Icon: Laptop
  }
] as const

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme()
  const [showModal, setShowModal] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const CurrentIcon =
    OPTIONS.find((option) => option.value === theme)?.Icon ?? Laptop

  // Handle escape key and click outside
  useEffect(() => {
    if (!showModal) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModal(false)
        buttonRef.current?.focus()
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (
        modalRef.current &&
        buttonRef.current &&
        !modalRef.current.contains(e.target as Node) &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowModal(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showModal])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        id="theme-toggle-button"
        onClick={() => setShowModal(!showModal)}
        className="inline-flex size-8.5 items-center justify-center rounded-md border border-border-strong text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-ring"
        aria-label="Toggle theme"
        aria-expanded={showModal}
        aria-haspopup="true"
      >
        <CurrentIcon size={16} />
      </button>

      {showModal && (
        <div
          ref={modalRef}
          className="absolute right-0 z-20 mt-2 flex min-w-36 flex-col gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg animate-pop-in"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="theme-toggle-button"
        >
          {OPTIONS.map(({ value, label, ariaLabel, Icon }) => {
            const selected = theme === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTheme(value)
                  setShowModal(false)
                  buttonRef.current?.focus()
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-ring ${
                  selected
                    ? 'bg-brand-subtle font-medium text-brand-emphasis'
                    : 'hover:bg-surface-3'
                }`}
                role="menuitemradio"
                aria-checked={selected}
                aria-label={ariaLabel}
              >
                <Icon size={16} />
                <span>{label}</span>
                {selected && <Check size={15} className="ml-auto" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
