// The site and its data are published together, so a data request names the
// build it belongs to. A browser cache then never hands one build's page
// another build's files, which matters most for the sqlite database: it is
// read in ranges, and ranges from two builds make a corrupt database.
export const withDataVersion = (url: string, version?: string | null) =>
  version
    ? `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`
    : url
