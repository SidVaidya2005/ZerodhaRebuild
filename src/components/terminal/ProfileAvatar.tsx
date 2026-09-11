'use client'

import Image from 'next/image'
import { useState } from 'react'

import { initials } from '@/lib/profile/initials'

/**
 * The Google avatar, with the monogram beneath it.
 *
 * **A Client Component for one reason: `onError`.** Google's avatar URLs are
 * signed and do expire, so an account that signed in months ago can hold a URL
 * that now 403s. A Server Component could only choose between the image and the
 * monogram at render time, which would leave a broken-image glyph on screen for
 * exactly the accounts most likely to have one. The boundary is scoped to the
 * avatar rather than the card so the rest of `/settings` stays server-rendered.
 *
 * **It goes through the optimizer, and that is what makes `remotePatterns` mean
 * something.** `next/image` checks the host against that allowlist inside its
 * default loader, and `unoptimized` returns before the loader is ever called —
 * so an unoptimized remote image is an `<img>` pointing anywhere, with the
 * config entry beside it doing nothing. Optimizing also outlives the URL: Google
 * avatar links are signed and expire, and a cached copy survives that.
 */
export function ProfileAvatar({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false)

  if (src === null || failed) {
    return (
      <span
        aria-hidden
        className="flex size-16 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-title-sm font-semibold text-ink"
      >
        {initials(name)}
      </span>
    )
  }

  return (
    <Image
      src={src}
      alt=""
      aria-hidden
      width={64}
      height={64}
      onError={() => setFailed(true)}
      className="size-16 shrink-0 rounded-full bg-surface-elevated object-cover"
    />
  )
}
