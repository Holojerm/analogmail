// Stationery as the design system's own tokens, so a letter reads correctly
// in both colour modes. The choice is stored inside the encrypted letter.

import type { Stationery } from '../../shared/utils/letter-doc'

export const PAPER_CLASS: Record<Stationery['paper'], string> = {
  plain: 'bg-default',
  soft: 'bg-muted',
  card: 'bg-elevated',
}
export const FONT_CLASS: Record<Stationery['font'], string> = {
  serif: 'font-display text-xl leading-relaxed',
  sans: 'font-sans text-base leading-relaxed',
  typewriter: 'font-mono text-sm leading-loose',
}
export const INK_CLASS: Record<Stationery['ink'], string> = {
  black: 'text-default',
  accent: 'text-primary',
  faded: 'text-toned',
}

export const PAPER_LABEL: Record<Stationery['paper'], string> = {
  plain: 'Plain',
  soft: 'Soft',
  card: 'Card',
}
export const FONT_LABEL: Record<Stationery['font'], string> = {
  serif: 'Serif',
  sans: 'Sans',
  typewriter: 'Typewriter',
}
export const INK_LABEL: Record<Stationery['ink'], string> = {
  black: 'Black',
  accent: 'Coloured',
  faded: 'Faded',
}

export const stationeryClass = (stationery: Stationery) =>
  [PAPER_CLASS[stationery.paper], FONT_CLASS[stationery.font], INK_CLASS[stationery.ink]].join(' ')

/**
 * A pickup as "on Monday at 5:00 PM", in the sender's own time zone: the
 * post collects at 5 pm where they live, not where their device thinks it is.
 */
export function pickupTime(iso: string, zone: string): string {
  const at = new Date(iso)
  const weekday = at.toLocaleDateString(undefined, { weekday: 'long', timeZone: zone })
  const time = at.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: zone,
  })
  return `on ${weekday} at ${time}`
}

/** A calendar day ('YYYY-MM-DD') as "Friday 20 November". */
export function longDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}
