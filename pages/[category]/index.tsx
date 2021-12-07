import { GetStaticPropsContext } from 'next'
import * as core from '@actions/core'
import { getGithubConfigs, GithubConfigs } from '../../lib/data'
import Meta from '../../lib/components/Meta'
import Application from '../../lib/components/Application'

export async function getStaticPaths() {
  const paths = [
    {
      params: {
        category: 'all'
      }
    }
  ]
  return { paths, fallback: false }
}

export async function getStaticProps(context: GetStaticPropsContext) {
  const githubConfigs = getGithubConfigs({
    githubRootName: process.env['GITHUB_REPOSITORY'] || '',
    customDomain: core.getInput('customDomain')
  })
  return {
    props: {
      githubConfigs
    }
  }
}

interface Props {
  githubConfigs: GithubConfigs
  categories: string[]
}
const Category = ({ githubConfigs, categories }: Props) => {
  return (
    <>
      <Meta />
      <Application githubConfigs={githubConfigs} categories={categories} />
    </>
  )
}
export default Category
