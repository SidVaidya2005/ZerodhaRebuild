'use client'

import { Menu } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

/**
 * The watchlist's container. **F18 fills it**; F17 builds the frame it lives in.
 *
 * The panel is one component so the two breakpoints cannot diverge: the same
 * `<WatchlistPanel/>` renders inside a fixed rail at `md` and up, and inside a
 * `Sheet` below it — `DESIGN.md` → Responsive specifies a full-screen sheet
 * under 768px. F18 adds search, reorder and row actions inside the panel without
 * touching either shell.
 *
 * **The two shells are exported separately because they live in different parts
 * of the page.** The rail is a column beside `<main>`; the sheet's trigger is a
 * button in the nav bar. Exporting one component that rendered both put the
 * 288px rail inside the header's 64px flex row, where it was clipped to the
 * nav's height and pushed everything after it sideways.
 */

function WatchlistPanel() {
  return (
    <div className="flex h-full flex-col">
      <p className="px-4 py-3 text-caption font-medium tracking-wide text-muted">Watchlist</p>
      {/* The empty state, not a skeleton: nothing is loading. Ten symbols are
          seeded at signup, so this reads as "not built yet" rather than "you
          have nothing" — F18 replaces it with the real list and its own empty
          state for a genuinely cleared watchlist. */}
      <p className="px-4 text-body-sm text-muted">
        Your watchlist arrives with the next feature. Ten symbols are already seeded on your
        account.
      </p>
    </div>
  )
}

/**
 * The desktop rail. Sticky beneath the 64px nav and the full height of what is
 * left, so a long watchlist scrolls inside the rail rather than taking the page
 * with it.
 */
export function WatchlistRail() {
  return (
    <aside
      aria-label="Watchlist"
      className="hidden w-72 shrink-0 border-r border-hairline bg-surface md:sticky md:top-16 md:block md:h-[calc(100vh-4rem)] md:overflow-y-auto"
    >
      <WatchlistPanel />
    </aside>
  )
}

/** The mobile shell: a nav-bar trigger and the sheet it opens. */
export function WatchlistSheet() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open watchlist">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      {/* Full-bleed: DESIGN.md → Collapsing Strategy calls for a full-screen
          sheet under 768px, and the default left a strip of dimmed page beside
          it. The overrides must repeat `data-[side=left]:`, because the base
          class is `data-[side=left]:w-3/4` — tailwind-merge groups by variant,
          so a bare `w-full` lands in a different group and loses silently.
          The trigger is `md:hidden`, so this sheet only ever renders below the
          breakpoint and needs no width above it. */}
      <SheetContent
        side="left"
        className="p-0 data-[side=left]:w-full data-[side=left]:sm:max-w-none"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Watchlist</SheetTitle>
        </SheetHeader>
        <WatchlistPanel />
      </SheetContent>
    </Sheet>
  )
}
