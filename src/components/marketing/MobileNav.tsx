'use client'

import { Menu } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

import { NAV_LINKS, SIGN_IN_HREF } from './nav-links'

/**
 * The public nav below `md`. DESIGN.md → Collapsing Strategy calls for a
 * full-screen sheet with the sign-in action anchored at its foot, so the sheet
 * overrides the primitive's three-quarter width.
 *
 * Open state is held here rather than left uncontrolled because a link tap
 * navigates without unmounting the sheet — the panel would stay open over the
 * new page otherwise.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open the navigation menu"
          className="md:hidden"
        >
          <Menu />
        </Button>
      </SheetTrigger>
      {/* The width overrides carry the same `data-[side=right]:` prefix the
          primitive uses, or they lose on specificity and the sheet renders at
          the default three-quarter width instead of full screen. */}
      <SheetContent
        side="right"
        className="bg-canvas data-[side=right]:w-full data-[side=right]:sm:max-w-none"
      >
        <SheetHeader>
          <SheetTitle className="text-brand">ZerodhaRebuild</SheetTitle>
          <SheetDescription className="sr-only">
            Links to the public pages and the sign-in action.
          </SheetDescription>
        </SheetHeader>

        <nav className="flex flex-col px-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="border-b border-hairline py-4 text-title-sm text-body transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <SheetFooter>
          <Button asChild className="h-10 w-full rounded-full">
            <Link href={SIGN_IN_HREF} onClick={() => setOpen(false)}>
              Sign in with Google
            </Link>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
