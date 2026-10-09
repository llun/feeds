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

  async check(): Promise<FreshnessCheck> {
    if (!this.pending) {
      const run = checkPublishedBuild(this.basePath, this.buildTime)
      this.pending = run
      run.finally(() => {
        if (this.pending === run) this.pending = null
      })
    }
    const result = await this.pending
    // A reload may have loaded that build while the check ran
    if (result.status === 'newer' && result.buildTime === this.buildTime) {
      return { status: 'current' }
    }
    return result
  }

  // The data for this build is loaded
  accept(buildTime: string) {
    this.buildTime = buildTime
  }
}

// What the page is doing about data from an older build of the site
export type RefreshState =
  'refreshing' | 'refreshed' | 'available' | 'failed' | null

// What happened when a failed load asked whether the site was republished:
// the data was reloaded for the new build, the build is the same (so the
// failure stands), or the site could not be reached to tell.
export type RecoveryResult = 'reloaded' | 'current' | 'unreachable'

interface DataRefresherOptions<T> {
  watcher: BuildWatcher
  // Loads a build's data without touching what is on screen
  load: (buildTime: string) => Promise<T>
  // Puts a loaded build on screen
  apply: (buildTime: string, data: T) => void
  onStateChange: (state: RefreshState) => void
}

// Moves the page to a newer build's data without reloading the page. One
// reload runs at a time, and what is on screen only changes once the new
// build's data has loaded.
export class DataRefresher<T> {
  private running: Promise<boolean> | null = null
  private state: RefreshState = null
  // The newer build a notice offers, or the one a failed reload retries
  private pendingBuild: string | null = null

  constructor(private options: DataRefresherOptions<T>) {}

  private setState(state: RefreshState) {
    this.state = state
    this.options.onStateChange(state)
  }

  reload(buildTime: string): Promise<boolean> {
    if (this.running) return this.running
    const { watcher, load, apply } = this.options
    const run = (async () => {
      this.pendingBuild = buildTime
      this.setState('refreshing')
      try {
        const data = await load(buildTime)
        watcher.accept(buildTime)
        this.pendingBuild = null
        apply(buildTime, data)
        this.setState('refreshed')
        return true
      } catch {
        this.setState('failed')
        return false
      } finally {
        this.running = null
      }
    })()
    this.running = run
    return run
  }

  // Asked when a load fails. A tab left open across a republish asks for data
  // the new build moved or dropped, so the data is reloaded rather than the
  // failure shown.
  async recover(): Promise<RecoveryResult> {
    const check = await this.options.watcher.check()
    if (check.status !== 'newer') return check.status
    return (await this.reload(check.buildTime)) ? 'reloaded' : 'unreachable'
  }

  // Coming back to a tab that sat open is when a republish is most likely;
  // offer the new data rather than swapping the list under the reader.
  async offerNewer() {
    const check = await this.options.watcher.check()
    if (check.status !== 'newer' || this.running) return
    if (this.state !== null && this.state !== 'refreshed') return
    this.pendingBuild = check.buildTime
    this.setState('available')
  }

  // "Load latest" and "Try again" on the notice
  loadPending() {
    if (this.pendingBuild) return this.reload(this.pendingBuild)
    this.setState(null)
    return Promise.resolve(true)
  }

  dismiss(only?: RefreshState) {
    if (only === undefined || this.state === only) this.setState(null)
  }
}
