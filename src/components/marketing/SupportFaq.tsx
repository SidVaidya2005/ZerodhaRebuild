import Link from 'next/link'
import type { ReactNode } from 'react'

import { OPENING_BALANCE } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'

import { Section } from './Section'

type Entry = {
  question: string
  answer: ReactNode
}

type Category = {
  name: string
  blurb: string
  entries: readonly Entry[]
}

/**
 * Answers are grounded in the context documents rather than invented — order
 * behaviour from `trading-contract.md`, price provenance from
 * `architecture.md`, the hosting sleep from `CLAUDE.md`.
 *
 * Anything already stated on /pricing or /legal is **linked, not restated**.
 * That is the same rule that keeps Home, About and Legal from duplicating each
 * other: one page owns each fact, so there is only ever one thing to correct.
 */
const CATEGORIES: readonly Category[] = [
  {
    name: 'Account',
    blurb: 'Signing in, and what you get when you do.',
    entries: [
      {
        question: 'Do I need a Zerodha account?',
        answer: (
          <>
            No. This is not connected to Zerodha in any way — see the{' '}
            <Link href="/legal" className="text-body underline underline-offset-4">
              disclaimer
            </Link>
            . All you need is a Google account to sign in with.
          </>
        ),
      },
      {
        question: 'Is there any KYC, PAN, or document upload?',
        answer:
          'None. There is nothing to verify, because there is no real account and no real money. You sign in with Google and the terminal is there.',
      },
      {
        question: 'How much do I start with?',
        answer: `Every account opens with ${formatCurrency(OPENING_BALANCE)} of simulated cash, credited the first time you sign in.`,
      },
      {
        question: 'Can I start over?',
        answer:
          'Yes. Resetting your account wipes every order, trade, holding and position and restores the opening balance exactly. There is no penalty and no limit — it is a simulator, and starting again is the point.',
      },
    ],
  },
  {
    name: 'Orders',
    blurb: 'What you can place, and why it did what it did.',
    entries: [
      {
        question: 'Which order types can I place?',
        answer: (
          <>
            Market and limit orders, in delivery (CNC) or intraday (MIS). Stop-loss, cover, bracket
            and GTT orders are out of scope, as are futures and options — the{' '}
            <Link href="/legal" className="text-body underline underline-offset-4">
              disclaimer
            </Link>{' '}
            lists what is deliberately missing.
          </>
        ),
      },
      {
        question: 'Why was my order rejected?',
        answer:
          'Almost always one of two reasons. A buy costing more than your available cash is rejected outright rather than partly filled. A delivery sell for more shares than you hold is rejected too — you cannot sell what you do not own.',
      },
      {
        question: 'Why has my limit order not filled?',
        answer:
          'A limit order waits until a refreshed price actually crosses your limit. Prices refresh on a schedule during market hours, so a fill can lag the moment the price touched your number on a real exchange. Outside market hours nothing refreshes and nothing fills.',
      },
      {
        question: 'What happens to an intraday position at the end of the day?',
        answer:
          'Anything still open at 3:20pm IST is closed automatically at the last traded price, and the resulting trade is marked as an auto square-off so you can tell it apart from an exit you made yourself.',
      },
      {
        question: 'Can I short sell?',
        answer:
          'In intraday only. You can sell first and buy back later within the same session. Short selling in delivery does not exist here, exactly as it does not at a real broker.',
      },
    ],
  },
  {
    name: 'Funds',
    blurb: 'Where the money goes, and why the number moved.',
    entries: [
      {
        question: 'Can I deposit or withdraw?',
        answer:
          'No, and there is deliberately no way to. This project contains no payment integration of any kind — no card, no UPI, no netbanking, simulated or otherwise. The balance is a number in a database row.',
      },
      {
        question: 'Why did my balance fall by more than the value of the trade?',
        answer: (
          <>
            Charges. Brokerage, STT, exchange and SEBI fees, stamp duty, GST and the depository fee
            are all applied the way a real broker applies them, which is the main reason a small
            winning trade can still lose money. Every rate and a worked example are on the{' '}
            <Link href="/pricing" className="text-body underline underline-offset-4">
              pricing page
            </Link>
            .
          </>
        ),
      },
      {
        question: 'What is used margin?',
        answer:
          'When you place an order, the money it needs is set aside immediately so you cannot spend it twice. It shows as used margin rather than available cash. Cancel the order and it comes straight back; let it fill and it turns into the cost of the trade.',
      },
      {
        question: 'Does this simulate leverage?',
        answer:
          'No. Both products require the full value of the trade. The difference between delivery and intraday here is when the position has to be closed, not how much you can borrow.',
      },
    ],
  },
  {
    name: 'Technical',
    blurb: 'How the thing actually works.',
    entries: [
      {
        question: 'Are the prices live?',
        answer: (
          <>
            No, and the app never claims they are. Prices come from a real market data provider but
            are polled on a schedule rather than streamed, so they are marked delayed. When no
            provider can be reached, a simulator fills in and is labelled as such. The full
            vocabulary is on the{' '}
            <Link href="/" className="text-body underline underline-offset-4">
              home page
            </Link>
            .
          </>
        ),
      },
      {
        question: 'Then why does the price keep moving?',
        answer:
          'Between refreshes the number is animated so the tape does not sit still. Those in-between figures are interpolated, not fetched. Anywhere a number actually drives a decision — an order ticket, a confirmation, any total — you are shown the real fetched value instead.',
      },
      {
        question: 'Why is the first page load sometimes slow?',
        answer:
          'It runs on free hosting that puts the server to sleep after about fifteen minutes without traffic, so the first request wakes it up. Subsequent pages are fast. Price refreshes keep running on a schedule regardless, because they do not depend on the web server being awake.',
      },
      {
        question: 'Can other users see my trades?',
        answer:
          'No. Per-user isolation is enforced by the database itself rather than by application code, so every query is scoped to the signed-in account before it runs. A bug in a page cannot leak another account.',
      },
    ],
  },
]

export function SupportFaq() {
  return (
    <Section
      heading="Common questions"
      lede="Grouped by what you are trying to do. If none of these covers it, there is a link at the bottom."
    >
      <div className="grid gap-6 md:grid-cols-2">
        {CATEGORIES.map((category) => (
          <section
            key={category.name}
            aria-label={category.name}
            className="rounded-xl border border-hairline bg-surface p-6"
          >
            <h3 className="text-title-sm font-semibold text-ink">{category.name}</h3>
            <p className="mt-1 text-caption text-muted-strong">{category.blurb}</p>

            <div className="mt-4 flex flex-col">
              {category.entries.map((entry) => (
                <details
                  key={entry.question}
                  className="group border-t border-hairline first:border-t-0"
                >
                  {/* Native disclosure: keyboard operation, focus and screen-reader
                      semantics all come from the browser. The only thing worth
                      adding is a focus ring, because defaults vary. */}
                  <summary className="flex cursor-pointer list-none items-start gap-3 rounded-sm py-3 text-body-sm font-medium text-body focus-visible:ring-2 focus-visible:ring-info/50 focus-visible:outline-none">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 font-numeric text-caption text-muted-strong transition-transform group-open:rotate-90"
                    >
                      &rsaquo;
                    </span>
                    <span>{entry.question}</span>
                  </summary>
                  <div className="pb-3 pl-6 text-body-sm text-body">{entry.answer}</div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Section>
  )
}
