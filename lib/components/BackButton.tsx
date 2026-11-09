import React, { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'

interface Props {
  onClickBack?: () => void
  // The pane the button goes back to: its visible text and accessible name
  label?: string
}

// One edge button (chevron and the parent's name), shown on phones only
export const BackButton = ({ onClickBack, label }: Props) => {
  return (
    <button
      type="button"
      onClick={onClickBack}
      className="btn-edge fk-backbtn hit-target-y md:hidden"
      aria-label={label ? `Back to ${label}` : 'Go back'}
    >
      <ChevronLeft size={14} strokeWidth={1.5} aria-hidden="true" />
      <span className="fk-backbtn-label">{label ?? 'Back'}</span>
    </button>
  )
}

interface BandProps extends Props {
  children?: ReactNode
}

// The phone's back band (--band-h): the back button, with room for actions on the
// right.
export const BackBand = ({ onClickBack, label, children }: BandProps) => (
  <div className="fk-band fk-backband md:hidden">
    <BackButton onClickBack={onClickBack} label={label} />
    {children}
  </div>
)
