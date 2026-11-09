import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'

// The labs kit's order: auto, then light, then dark, then back to auto
export const THEME_CYCLE: readonly ThemeMode[] = ['system', 'light', 'dark']

export const toThemeMode = (theme: string | undefined): ThemeMode =>
  theme === 'light' || theme === 'dark' ? theme : 'system'

export const nextThemeMode = (theme: string | undefined): ThemeMode => {
  const index = THEME_CYCLE.indexOf(toThemeMode(theme))
  return THEME_CYCLE[(index + 1) % THEME_CYCLE.length]
}

export const themeToggleLabel = (theme: string | undefined): string =>
  `Colour theme: ${toThemeMode(theme)}. Switch to ${nextThemeMode(theme)}`

// The kit's 16-unit icons: a half disc for system, a sun, a moon
const ThemeIcon = ({ mode }: { mode: ThemeMode }) => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    data-mode={mode}
  >
    {mode === 'system' && (
      <>
        <circle cx="8" cy="8" r="5.75" />
        <path d="M8 2.25a5.75 5.75 0 0 1 0 11.5z" fill="currentColor" />
      </>
    )}
    {mode === 'light' && (
      <>
        <circle cx="8" cy="8" r="2.75" />
        <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.58 3.58l1.06 1.06M11.36 11.36l1.06 1.06M3.58 12.42l1.06-1.06M11.36 4.64l1.06-1.06" />
      </>
    )}
    {mode === 'dark' && (
      <path d="M13.5 9.6A5.75 5.75 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1z" />
    )}
  </svg>
)

const noopSubscribe = () => () => {}

// One edge icon button that cycles system, light and dark
export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme()

  // next-themes reads localStorage synchronously on the client but not in the
  // prerender, so show the neutral state until mounted to match the HTML.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  )
  const mode = toThemeMode(mounted ? theme : undefined)
  const label = themeToggleLabel(mode)

  return (
    <button
      type="button"
      className="btn-icon fk-theme hit-target"
      onClick={() => setTheme(nextThemeMode(mode))}
      aria-label={label}
      title={label}
    >
      <ThemeIcon mode={mode} />
    </button>
  )
}
