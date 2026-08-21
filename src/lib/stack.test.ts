import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { STACK } from './stack'

type Manifest = {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as Manifest

const INSTALLED: Record<string, string> = {
  ...manifest.dependencies,
  ...manifest.devDependencies,
}

/**
 * The guard behind /about's stack table. It runs in both directions on purpose:
 * checking only that listed versions are correct would let a newly installed
 * package sit on the page as "planned" forever.
 */
describe('stack table', () => {
  it('lists no duplicate layers', () => {
    const layers = STACK.map((entry) => entry.layer)
    expect(new Set(layers).size).toBe(layers.length)
  })

  it.each(STACK.filter((entry) => entry.status === 'installed'))(
    'installed row $layer matches package.json',
    (entry) => {
      // Narrowing for the type checker; the shape test below is what enforces it.
      expect(entry.pkg).not.toBeNull()
      const pkg = entry.pkg as string
      expect(INSTALLED[pkg], `${pkg} is marked installed but is not in package.json`).toBeDefined()
      expect(entry.version, `${pkg} version on /about is stale`).toBe(INSTALLED[pkg])
    }
  )

  it.each(STACK.filter((entry) => entry.status === 'planned'))(
    'planned row $layer is genuinely not installed yet',
    (entry) => {
      const pkg = entry.pkg as string
      expect(
        INSTALLED[pkg],
        `${pkg} is now installed — flip its stack.ts row to 'installed' and give it a version`
      ).toBeUndefined()
      expect(entry.version, `${pkg} is planned, so it must not claim a version`).toBeNull()
    }
  )

  it.each(STACK.filter((entry) => entry.status === 'external'))(
    'external row $layer names no package and no version',
    (entry) => {
      expect(entry.pkg).toBeNull()
      expect(entry.version).toBeNull()
    }
  )

  it('gives every non-external row a package name', () => {
    const missing = STACK.filter((entry) => entry.status !== 'external' && entry.pkg === null)
    expect(missing).toEqual([])
  })
})
