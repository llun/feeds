module.exports = {
  purge: ['./pages/**/*.njk', './_site/**/*.html'],
  darkMode: false, // or 'media' or 'class'
  theme: {
    extend: {}
  },
  variants: {
    extend: {}
  },
  plugins: [require('@tailwindcss/typography')]
}
