import React from 'react'
import 'tailwindcss/tailwind.css'
import './global.css'

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default MyApp
