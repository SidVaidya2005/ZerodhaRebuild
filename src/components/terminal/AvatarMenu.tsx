'use client'

import { LogOut, Settings, User } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOut } from '@/server/actions/auth'

/**
 * Who is signed in, and the way out.
 *
 * The client ID sits here rather than on the dashboard, where F13 first put it:
 * it is identity, not portfolio data, and every terminal page should be able to
 * show which account is acting without each one loading it.
 *
 * Sign-out stays a real `<form>` posting to a Server Action rather than an
 * onClick handler, so it works with JavaScript disabled — the standard F07B set
 * and `signInWithGoogle` follows.
 */

type AvatarMenuProps = {
  name: string
  email: string
  clientId: string | null
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const letters = parts.map((part) => part[0] ?? '').join('')
  return letters.toUpperCase() || '?'
}

export function AvatarMenu({ name, email, clientId }: AvatarMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="size-9 rounded-full bg-surface-elevated p-0 text-body-sm font-semibold text-ink"
          aria-label={`Account menu for ${name}`}
        >
          {initials(name)}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-body-sm font-semibold text-ink">{name}</span>
          <span className="block truncate text-caption text-muted">{email}</span>
          {clientId ? (
            <span className="mt-1 block text-caption text-muted tabular-nums">
              Client ID {clientId}
            </span>
          ) : null}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings#profile">
            <User aria-hidden="true" />
            Profile
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          {/* A form, not an onClick — sign-out must work without JavaScript. */}
          <form action={signOut}>
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
