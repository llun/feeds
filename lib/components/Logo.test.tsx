import test from 'ava'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Logo } from './Logo'

test('#Logo draws the app icon mark in currentColor', (t) => {
  const html = renderToStaticMarkup(<Logo />)
  t.regex(html, /viewBox="0 0 512 512"/)
  t.regex(html, /stroke="currentColor"/)
  t.regex(html, /stroke-width="80"/)
  t.regex(html, /stroke-linecap="round"/)
  t.regex(html, /d="M220 92C220 202.457 309.543 292 420 292"/)
  t.regex(html, /d="M88 92C88 275.359 236.641 424 420 424"/)
  t.regex(html, /<circle cx="392" cy="120" r="72" fill="currentColor"/)
})

test('#Logo uses the requested size and stays hidden from assistive tech', (t) => {
  const html = renderToStaticMarkup(<Logo size={22} className="brand" />)
  t.regex(html, /width="22"/)
  t.regex(html, /height="22"/)
  t.regex(html, /class="brand"/)
  t.regex(html, /aria-hidden="true"/)
  t.regex(html, /focusable="false"/)
})
