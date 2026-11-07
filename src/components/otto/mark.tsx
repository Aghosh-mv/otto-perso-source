'use client'

import { useOtto } from './store'

interface OttoMarkProps {
  size?: number
  withSignal?: boolean
}

// Otto brand mark — a 2x2 grid where the bottom-right quadrant is the signal red.
// Sharp, Swiss, instantly recognizable. Represents: structure + one signal.
export function OttoMark({ size = 18, withSignal = true }: OttoMarkProps) {
  const stroke = 'var(--ink)'
  const signal = 'var(--signal)'
  const cell = (size - 2) / 2
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="0.5" y="0.5" width="17" height="17" stroke={stroke} />
      <line x1="9" y1="0.5" x2="9" y2="17.5" stroke={stroke} strokeWidth="0.5" opacity="0.4" />
      <line x1="0.5" y1="9" x2="17.5" y2="9" stroke={stroke} strokeWidth="0.5" opacity="0.4" />
      {withSignal && <rect x="9.5" y="9.5" width="8" height="8" fill={signal} />}
    </svg>
  )
}

export function OttoWordmark({ size = 18 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <OttoMark size={size} />
      <span
        className="font-semibold tracking-tight text-foreground"
        style={{ fontSize: size * 0.95 }}
      >
        Otto<span className="text-muted-foreground font-normal"> Perso</span>
      </span>
    </span>
  )
}
