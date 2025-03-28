import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './lib/components/**/*.{js,ts,jsx,tsx}',
    './lib/components2/**/*.{js,ts,jsx,tsx}',
    './lib/page.{js,jsx,ts,tsx}',
    './lib/utils.ts'
  ],
  theme: {
    extend: {}
  },
  plugins: [typography]
}

export default config
