import { cn } from '@/lib/utils'

/**
 * Sticky leading columns for wide data tables. The table container already scrolls
 * horizontally; these keep the identifying column(s) pinned while the rest scrolls.
 * Backgrounds are opaque mixes so scrolled content never bleeds through, and they
 * track the row's hover/selected tint. Rows must carry the `group/row` class.
 */
const STICKY_BASE =
  'sticky z-10 overflow-hidden after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:z-20 after:w-px after:bg-border'

export const STICKY_ROW = 'group/row'

export function stickyHead(offset: 'left-0' | 'left-10' = 'left-0', className?: string) {
  return cn(STICKY_BASE, offset, 'z-20 bg-[color-mix(in_oklab,var(--muted)_40%,var(--background))]', className)
}

export function stickyCell(offset: 'left-0' | 'left-10' = 'left-0', className?: string) {
  return cn(
    STICKY_BASE,
    offset,
    'bg-background group-hover/row:bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))] group-data-[state=selected]/row:bg-muted',
    className,
  )
}

/** Leading checkbox column paired with a sticky name column at `left-10`. Width is fixed so `left-10` never sits over the next column. */
export function stickyCheckboxHead(className?: string) {
  return cn(stickyHead('left-0', 'w-10 min-w-10 max-w-10 after:hidden'), className)
}

export function stickyCheckboxCell(className?: string) {
  return cn(stickyCell('left-0', 'w-10 min-w-10 max-w-10 after:hidden'), className)
}
