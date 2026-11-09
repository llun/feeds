import test from 'ava'
import { nextThemeMode, themeToggleLabel, toThemeMode } from './ThemeToggle'

test('#nextThemeMode cycles system, light, dark and back', (t) => {
  t.is(nextThemeMode('system'), 'light')
  t.is(nextThemeMode('light'), 'dark')
  t.is(nextThemeMode('dark'), 'system')
  // Before next-themes knows the theme, the button acts as system
  t.is(nextThemeMode(undefined), 'light')
  t.is(toThemeMode('sepia'), 'system')
})

test('#themeToggleLabel names the current mode and the next one', (t) => {
  t.is(themeToggleLabel('dark'), 'Colour theme: dark. Switch to system')
  t.is(themeToggleLabel(undefined), 'Colour theme: system. Switch to light')
})
