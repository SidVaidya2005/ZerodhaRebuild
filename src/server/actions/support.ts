'use server'

import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/types/domain'

/**
 * Bounds mirror the CHECK constraints in the support_messages migration. They
 * are duplicated on purpose: this validation gives a useful field-level error,
 * while the database's constraints are the ones that cannot be bypassed — the
 * publishable key is in the browser bundle, so anyone can insert directly.
 */
const supportMessageSchema = z.object({
  name: z.string().trim().min(1, 'Tell us what to call you.').max(100, 'That name is too long.'),
  email: z.email('That does not look like an email address.').max(254),
  category: z.enum(['account', 'orders', 'funds', 'technical'], {
    error: 'Pick one of the categories.',
  }),
  message: z
    .string()
    .trim()
    .min(1, 'The message is empty.')
    .max(2000, 'Keep it under 2000 characters.'),
  /**
   * Honeypot. Hidden from sight and from assistive technology, so a human never
   * fills it.
   *
   * Accepts *any* string on purpose. Rejecting it here would make the honeypot
   * fail as a field error keyed `website`, which tells a scraper precisely which
   * field caught it — and it made the explicit branch below unreachable, which
   * is how the mistake was found.
   */
  website: z.string().optional(),
})

export type SupportFormState = ActionResult<{ submitted: true }> | null

/**
 * The public contact form's only write path.
 *
 * Reads no session deliberately: an unauthenticated request runs as `anon`,
 * which is the role the RLS policy is written against, and the pgTAP suite
 * proves that role can insert and do nothing else.
 *
 * Takes the previous state as its first argument so it can be driven by
 * `useActionState`, which is also what lets the form work with JavaScript
 * disabled — the browser posts the FormData and React renders the returned
 * state on the server.
 */
export async function submitSupportMessage(
  _previous: SupportFormState,
  formData: FormData
): Promise<SupportFormState> {
  const parsed = supportMessageSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    category: formData.get('category'),
    message: formData.get('message'),
    website: formData.get('website'),
  })

  if (!parsed.success) {
    const fields: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (typeof key === 'string' && !fields[key]) fields[key] = issue.message
    }
    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Please check the form and try again.', fields },
    }
  }

  // A filled honeypot is a bot. Report success rather than an error: telling a
  // scraper which field gave it away just teaches it to skip that field.
  if (parsed.data.website) {
    return { ok: true, data: { submitted: true } }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('support_messages').insert({
    name: parsed.data.name,
    email: parsed.data.email,
    category: parsed.data.category,
    message: parsed.data.message,
  })

  if (error) {
    // Raw Postgres text is logged and goes nowhere near the response.
    console.error('[support.submitSupportMessage]', error)
    return {
      ok: false,
      error: { code: 'SUBMIT_FAILED', message: 'That did not send. Please try again in a moment.' },
    }
  }

  return { ok: true, data: { submitted: true } }
}
