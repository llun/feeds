import { useTheme } from 'next-themes'
import { Sun, Moon, Laptop } from 'lucide-react'
import { useState } from 'react'

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme()
  const [showModal, setShowModal] = useState(false)

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

  return (
    <div className="relative">
      <button
        onClick={() => setShowModal(!showModal)}
        className="flex items-center border rounded-md p-1.5 dark:border-gray-700"
        aria-label="Toggle theme"
      >
        {getCurrentIcon()}
      </button>

      {showModal && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowModal(false)}
          />
          <div className="absolute right-0 mt-2 z-20 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md shadow-lg p-2">
            <div className="flex flex-col space-y-2">
              <button
                onClick={() => {
                  setTheme('light')
                  setShowModal(false)
                }}
                className={`flex items-center space-x-2 p-2 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  theme === 'light' ? 'bg-gray-200 dark:bg-gray-700' : ''
                }`}
                aria-label="Light mode"
              >
                <Sun size={16} />
                <span>Light</span>
              </button>
              <button
                onClick={() => {
                  setTheme('dark')
                  setShowModal(false)
                }}
                className={`flex items-center space-x-2 p-2 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  theme === 'dark' ? 'bg-gray-200 dark:bg-gray-700' : ''
                }`}
                aria-label="Dark mode"
              >
                <Moon size={16} />
                <span>Dark</span>
              </button>
              <button
                onClick={() => {
                  setTheme('system')
                  setShowModal(false)
                }}
                className={`flex items-center space-x-2 p-2 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  theme === 'system' ? 'bg-gray-200 dark:bg-gray-700' : ''
                }`}
                aria-label="System preference"
              >
                <Laptop size={16} />
                <span>System</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
