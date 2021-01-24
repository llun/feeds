module.exports = {
  purge: [
    './browser/**/*.{js,jsx,ts,tsx}',
    './pages/**/*.njk',
    './_site/**/*.html'
  ],
  darkMode: false, // or 'media' or 'class'
  theme: {
    extend: {}
  },
  variants: {
    extend: {}
  },
  plugins: [require('@tailwindcss/typography')]
}
