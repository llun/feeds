module.exports = {
  mode: 'jit',
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './lib/components/**/*.{js,ts,jsx,tsx}',
    './lib/utils.ts'
  ],
  plugins: [require('@tailwindcss/typography')]
}
