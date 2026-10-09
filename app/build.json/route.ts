// Published next to the site so an open tab can tell, without reloading,
// whether the site was rebuilt since it loaded (see lib/freshness.ts).
export const dynamic = 'force-static'

export const GET = () =>
  Response.json({ buildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? null })
