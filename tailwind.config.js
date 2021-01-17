module.exports = {
  purge: ['./src/**/*.njk', './src/**/*.html'],
  darkMode: false, // or 'media' or 'class'
  theme: {
    extend: {}
  },
  variants: {
    extend: {}
  },
  plugins: [require('@tailwindcss/typography')]
}
