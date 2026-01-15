import { useTheme } from 'next-themes'
import { Sun, Moon, Laptop } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme()
  const [showModal, setShowModal] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const getCurrentIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun size={16} />
      case 'dark':
        return <Moon size={16} />
      default:
        return <Laptop size={16} />
    }
  }

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
        className="flex items-center border rounded-md p-1.5 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        aria-label="Toggle theme"
        aria-expanded={showModal}
        aria-haspopup="true"
      >
        {getCurrentIcon()}
      </button>

      {showModal && (
        <div
          ref={modalRef}
          className="absolute right-0 mt-2 z-20 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md shadow-lg p-2 min-w-[140px]"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="theme-toggle-button"
        >
          <div className="flex flex-col space-y-2">
            <button
              type="button"
              onClick={() => {
                setTheme('light')
                setShowModal(false)
                buttonRef.current?.focus()
              }}
              className={`flex items-center space-x-2 p-2 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset text-left ${
                theme === 'light' ? 'bg-gray-200 dark:bg-gray-700' : ''
              }`}
              role="menuitem"
              aria-label="Light mode"
            >
              <Sun size={16} />
              <span>Light</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTheme('dark')
                setShowModal(false)
                buttonRef.current?.focus()
              }}
              className={`flex items-center space-x-2 p-2 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset text-left ${
                theme === 'dark' ? 'bg-gray-200 dark:bg-gray-700' : ''
              }`}
              role="menuitem"
              aria-label="Dark mode"
            >
              <Moon size={16} />
              <span>Dark</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTheme('system')
                setShowModal(false)
                buttonRef.current?.focus()
              }}
              className={`flex items-center space-x-2 p-2 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset text-left ${
                theme === 'system' ? 'bg-gray-200 dark:bg-gray-700' : ''
              }`}
              role="menuitem"
              aria-label="System preference"
            >
              <Laptop size={16} />
              <span>System</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
