import { withDataVersion } from './storage/version'

// The action rebuilds the site and its data together, so the build time names
// the data a page was built against. A tab left open across a republish keeps
// asking for the old data, and those requests fail or come back empty;
// comparing build times tells that apart from an item that really is gone.
export const BUILD_INFO_FILE = 'build.json'

export type FreshnessCheck =
  // The site was rebuilt; reload the data for this build time
  | { status: 'newer'; buildTime: string }
  // Still the build this page loaded, so a failure is real
  | { status: 'current' }
  // The site could not be reached, so nothing can be told
  | { status: 'unreachable' }

export const checkPublishedBuild = async (
  basePath: string,
  currentBuildTime: string | null
): Promise<FreshnessCheck> => {
  let response: Response
  try {
    response = await fetch(
      // The query keeps any cache between here and the site out of it
      withDataVersion(`${basePath}/${BUILD_INFO_FILE}`, `${Date.now()}`),
      { cache: 'no-store' }
    )
  } catch {
    return { status: 'unreachable' }
  }
  // A site published before build.json existed has nothing to compare
  if (response.status === 404) return { status: 'current' }
  if (response.status !== 200) return { status: 'unreachable' }

  let published: unknown
  try {
    published = (await response.json())?.buildTime
  } catch {
    return { status: 'unreachable' }
  }
  if (
    !currentBuildTime ||
    typeof published !== 'string' ||
    !published ||
    published === currentBuildTime
  ) {
    return { status: 'current' }
  }
  return { status: 'newer', buildTime: published }
}

// One check at a time: a list and an article failing together share it, so
// the data reloads once.
export class BuildWatcher {
  private pending: Promise<FreshnessCheck> | null = null

  constructor(
    private basePath: string,
    private buildTime: string | null
  ) {}

  get currentBuildTime() {
    return this.buildTime
  }

  check(): Promise<FreshnessCheck> {
    if (!this.pending) {
      const run = checkPublishedBuild(this.basePath, this.buildTime)
      this.pending = run
      run.finally(() => {
        if (this.pending === run) this.pending = null
      })
    }
    return this.pending
  }

  // The data for this build is loaded
  accept(buildTime: string) {
    this.buildTime = buildTime
  }
}
