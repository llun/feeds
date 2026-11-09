import React, { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'

interface Props {
  onClickBack?: () => void
  // The pane the button goes back to, for its accessible name
  label?: string
}

// An edge icon button, shown on phones only
export const BackButton = ({ onClickBack, label }: Props) => {
  return (
    <button
      type="button"
      onClick={onClickBack}
      className="btn-icon hit-target md:hidden"
      aria-label={label ? `Back to ${label}` : 'Go back'}
    >
      <ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" />
    </button>
  )
}

interface BandProps extends Props {
  children?: ReactNode
}

// The phone's 41px back band: the back button and the parent's name, with
// room for actions on the right.
export const BackBand = ({ onClickBack, label, children }: BandProps) => (
  <div className="fk-band fk-backband md:hidden">
    <BackButton onClickBack={onClickBack} label={label} />
    {label && (
      <span className="fk-backband-label" aria-hidden="true">
        {label}
      </span>
    )}
    {children}
  </div>
)
