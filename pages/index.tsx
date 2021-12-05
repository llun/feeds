import { GetStaticPropsContext } from 'next'
import React from 'react'
import Meta from '../lib/components/Meta'

export async function getStaticProps(context: GetStaticPropsContext) {
  return {
    props: {}
  }
}

export default function Home() {
  return (
    <>
      <Meta />
      <div className="container mx-auto flex flex-row w-screen h-screen"></div>
    </>
  )
}
