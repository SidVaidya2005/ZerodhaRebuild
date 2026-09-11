import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    /**
     * The Google avatar on `/settings`, and the only external image this app
     * loads. Protocol and hostname are pinned; the path is left open because
     * Google serves avatars from several prefixes (`/a/`, `/a-/`) and pinning
     * one would silently fall back to initials for accounts on the others.
     *
     * This is the allowlist the default loader checks, so it is load-bearing
     * only while the component is optimized: `unoptimized` returns before the
     * loader runs, which would leave this entry doing nothing. `ProfileAvatar`
     * therefore does not set it.
     */
    remotePatterns: [{ protocol: 'https', hostname: 'lh3.googleusercontent.com' }],
  },
}

export default nextConfig
