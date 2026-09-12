/**
 * A failed page read is logged and then thrown, so the segment's `error.tsx`
 * catches it.
 *
 * Before F36 every terminal page logged its read errors and fell through to the
 * empty state, which meant a broken query and an empty account rendered the
 * same pixels — the pages' own comments named it as "exactly how a broken read
 * hides behind a plausible empty state". Logging alone is not a decision the
 * user can see. After this, an empty state means empty and a boundary means
 * broken.
 *
 * The thrown message is deliberately coarse — a tag and the relations that
 * failed. `code-standards.md` forbids a raw Postgres message reaching the UI,
 * and in production Next.js replaces the message with a digest anyway; the
 * detail belongs in the server log, which is the line above the throw.
 */

/**
 * PostgREST's answer to an offset past the end of a set, which is an ordinary
 * outcome rather than a fault: a bookmarked `?page=3` that outlives the rows it
 * pointed at. Both pagers in the app can produce it, so it is excluded here
 * once rather than at each call site — every one of which would otherwise have
 * to remember, and a page that forgot would throw a boundary at a user whose
 * only mistake was an old bookmark.
 */
const PAST_THE_END = 'PGRST103'

type ReadError = { code?: string; message?: string } | null

export function throwOnReadError(tag: string, reads: Record<string, ReadError>): void {
  const failed: string[] = []

  for (const [relation, error] of Object.entries(reads)) {
    if (!error || error.code === PAST_THE_END) continue
    console.error(`[${tag}] ${relation}`, error)
    failed.push(relation)
  }

  if (failed.length > 0) {
    throw new Error(`[${tag}] read failed: ${failed.join(', ')}`)
  }
}
