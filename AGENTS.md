# ZerodhaRebuild

A paper-trading platform with Zerodha/Kite's product model and the design system in `context/DESIGN.md`:
a public marketing site plus a live NSE terminal where
Google-authenticated users trade ~200 stocks with ₹1,00,000 of simulated cash. No real money anywhere.

## Instructions live in `CLAUDE.md`

This project's full agent instructions are in [`CLAUDE.md`](./CLAUDE.md) at the repo root, which points into `context/`.
**Read `CLAUDE.md` first.** This file is a pointer only and is deliberately not a copy — two copies drift.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
