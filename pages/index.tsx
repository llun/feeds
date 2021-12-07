import { GetStaticPropsContext } from 'next'
import path from 'path'
import * as core from '@actions/core'
import React from 'react'

import { getCategories, getGithubConfigs, GithubConfigs } from '../lib/data'
import Application from '../lib/components/Application'
import Meta from '../lib/components/Meta'

export async function getStaticProps(context: GetStaticPropsContext) {
  const githubConfigs = getGithubConfigs({
    githubRootName: process.env['GITHUB_REPOSITORY'] || '',
    customDomain: core.getInput('customDomain')
  })
  const categories = getCategories(path.join(process.cwd(), 'contents'))
  return {
    props: {
      githubConfigs,
      categories
    }
  }
}

interface Props {
  githubConfigs: GithubConfigs
  categories: string[]
}
export default function Home({ githubConfigs, categories }: Props) {
  return (
    <>
      <Meta />
      <Application githubConfigs={githubConfigs} categories={categories} />
    </>
  )
}
