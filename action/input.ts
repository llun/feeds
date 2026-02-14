interface InputOptions {
  required?: boolean
}

function inputKeys(name: string) {
  const compact = `INPUT_${name.toUpperCase()}`
  const snake = `INPUT_${name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toUpperCase()}`
  return [compact, snake]
}

export function getInput(name: string, options: InputOptions = {}) {
  const keys = inputKeys(name)
  for (const key of keys) {
    const value = process.env[key]
    if (value !== undefined) {
      return value
    }
  }
  if (options.required) {
    throw new Error(`Input required and not supplied: ${name}`)
  }
  return ''
}

export function setFailed(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : JSON.stringify(error)
  console.error(`::error::${message}`)
}

export function getRepositoryContext() {
  const repository = process.env['GITHUB_REPOSITORY'] || ''
  const [owner, repo] = repository.split('/')
  if (!owner || !repo) {
    throw new Error(
      'Invalid GITHUB_REPOSITORY. Expected format "owner/repo".'
    )
  }
  return { owner, repo }
}

export function getRefBranch() {
  const ref = process.env['GITHUB_REF'] || ''
  if (ref.startsWith('refs/heads/')) {
    return ref.substring('refs/heads/'.length)
  }
  return ref
}
