import test from 'ava'
import { buttonClassName } from './Button'

test('#buttonClassName maps each variant onto a kit control', (t) => {
  const cases: [Parameters<typeof buttonClassName>[0], string][] = [
    [{ variant: 'brand' }, 'btn-primary hit-target-y'],
    [{ variant: 'primary' }, 'btn-primary hit-target-y'],
    [{ variant: 'outline' }, 'btn-text hit-target-y'],
    [{ variant: 'secondary' }, 'btn-text hit-target-y'],
    [{}, 'btn-text hit-target-y'],
    [{ variant: 'ghost' }, 'btn-ghost hit-target-y'],
    [{ variant: 'destructive' }, 'btn-primary btn-danger hit-target-y'],
    // An icon-only button is the edge icon button, whatever its variant...
    [{ variant: 'ghost', iconOnly: true }, 'btn-icon hit-target-y'],
    [{ variant: 'brand', iconOnly: true }, 'btn-icon hit-target-y'],
    // ...except a link, which never gets a box or a taller hit target
    [{ variant: 'link', iconOnly: true }, 'btn-link'],
    [{ variant: 'link' }, 'btn-link'],
    [
      { variant: 'ghost', size: 'lg', block: true, className: 'extra' },
      'btn-ghost hit-target-y btn-lg btn-block extra'
    ]
  ]
  for (const [options, expected] of cases) {
    t.is(buttonClassName(options), expected, JSON.stringify(options))
  }
})
