---
version: alpha
name: Binance-design-analysis
description: Reference analysis of Binance's financial interface. It uses a near-black canvas, yellow (#FCD535) for primary calls to action (CTAs) and brand accents, and BinanceNova / BinancePlex fonts. Marketing and product pages default to dark; transactional pages (buy crypto, deposit, exchange) use light backgrounds with the same yellow CTAs and gray-blue borders. Green means prices rose; red means prices fell. ZerodhaRebuild adopts the visual values, with the adaptations described below.

colors:
  primary: "#fcd535"
  primary-active: "#f0b90b"
  primary-disabled: "#3a3a1f"
  ink: "#181a20"
  body: "#eaecef"
  body-on-light: "#181a20"
  muted: "#707a8a"
  muted-strong: "#929aa5"
  hairline-on-light: "#eaecef"
  hairline-on-dark: "#2b3139"
  border-strong: "#cdd1d6"
  canvas-light: "#ffffff"
  canvas-dark: "#0b0e11"
  surface-card-dark: "#1e2329"
  surface-elevated-dark: "#2b3139"
  surface-soft-light: "#fafafa"
  surface-strong-light: "#f5f5f5"
  on-primary: "#181a20"
  on-dark: "#ffffff"
  trading-up: "#0ecb81"
  trading-down: "#f6465d"
  accent-turquoise: "#2dbdb6"
  info: "#3b82f6"
  info-ring: "#3b82f6"

typography:
  hero-display:
    fontFamily: "BinanceNova, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 64px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -1px
  display-lg:
    fontFamily: "BinanceNova, sans-serif"
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.5px
  display-md:
    fontFamily: "BinanceNova, sans-serif"
    fontSize: 40px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.3px
  display-sm:
    fontFamily: "BinanceNova, sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0
  title-lg:
    fontFamily: "BinanceNova, sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0
  title-md:
    fontFamily: "BinanceNova, sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: 0
  title-sm:
    fontFamily: "BinanceNova, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  number-display:
    fontFamily: "BinancePlex, BinanceNova, sans-serif"
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.3px
  number-md:
    fontFamily: "BinancePlex, BinanceNova, sans-serif"
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  number-sm:
    fontFamily: "BinancePlex, BinanceNova, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  body-md:
    fontFamily: "BinanceNova, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: "BinanceNova, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  caption:
    fontFamily: "BinanceNova, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  button:
    fontFamily: "BinanceNova, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0
  nav-link:
    fontFamily: "BinanceNova, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0

rounded:
  xs: 2px
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 12px 24px
    height: 40px
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button-primary-disabled:
    backgroundColor: "{colors.primary-disabled}"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
  button-primary-pill:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 14px 32px
  button-secondary-on-dark:
    backgroundColor: "{colors.surface-card-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 12px 24px
  button-secondary-on-light:
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 12px 24px
  button-tertiary-text:
    backgroundColor: transparent
    textColor: "{colors.body}"
    typography: "{typography.button}"
  button-trading-up:
    backgroundColor: "{colors.trading-up}"
    textColor: "{colors.on-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 8px 20px
  button-trading-down:
    backgroundColor: "{colors.trading-down}"
    textColor: "{colors.on-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 8px 20px
  button-subscribe:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 6px 16px
    height: 28px
  text-link:
    backgroundColor: transparent
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
  top-nav-dark:
    backgroundColor: "{colors.canvas-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.nav-link}"
    height: 64px
  top-nav-light:
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.ink}"
    typography: "{typography.nav-link}"
    height: 64px
  hero-band-dark:
    backgroundColor: "{colors.canvas-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.hero-display}"
    padding: 80px
  stat-callout-card:
    backgroundColor: transparent
    textColor: "{colors.primary}"
    typography: "{typography.number-display}"
  trust-badge:
    backgroundColor: "{colors.surface-card-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.title-sm}"
    rounded: "{rounded.lg}"
    padding: 16px 20px
  markets-table-card:
    backgroundColor: "{colors.surface-card-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: 24px
  markets-row:
    backgroundColor: transparent
    textColor: "{colors.on-dark}"
    typography: "{typography.number-md}"
    padding: 12px 0
  price-up-cell:
    backgroundColor: transparent
    textColor: "{colors.trading-up}"
    typography: "{typography.number-md}"
  price-down-cell:
    backgroundColor: transparent
    textColor: "{colors.trading-down}"
    typography: "{typography.number-md}"
  search-input-on-dark:
    backgroundColor: "{colors.surface-card-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 10px 16px
    height: 40px
  text-input-on-light:
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 10px 16px
    height: 40px
  funds-safu-band:
    backgroundColor: "{colors.canvas-dark}"
    textColor: "{colors.primary}"
    typography: "{typography.display-lg}"
    padding: 80px
  feature-photo-card:
    backgroundColor: "{colors.surface-card-dark}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.xl}"
  qr-promo-card:
    backgroundColor: "{colors.surface-card-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.title-md}"
    rounded: "{rounded.xl}"
    padding: 32px
  faq-row:
    backgroundColor: transparent
    textColor: "{colors.on-dark}"
    typography: "{typography.title-sm}"
    rounded: "{rounded.md}"
    padding: 20px 0
  cta-band-dark:
    backgroundColor: "{colors.surface-card-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.display-sm}"
    rounded: "{rounded.xl}"
    padding: 48px
  arena-hero-gradient:
    backgroundColor: "{colors.canvas-dark}"
    textColor: "{colors.primary}"
    typography: "{typography.display-lg}"
    padding: 80px
  cookie-consent-card:
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    padding: 16px
  buy-crypto-amount-card:
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.ink}"
    typography: "{typography.number-display}"
    rounded: "{rounded.lg}"
    padding: 24px
  steps-card:
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.ink}"
    typography: "{typography.title-sm}"
    rounded: "{rounded.lg}"
    padding: 24px
  price-chart-card:
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 24px
  conversion-cell:
    backgroundColor: transparent
    textColor: "{colors.body-on-light}"
    typography: "{typography.body-md}"
  trader-row:
    backgroundColor: transparent
    textColor: "{colors.on-dark}"
    typography: "{typography.body-md}"
    padding: 12px 0
  footer-light:
    backgroundColor: "{colors.surface-soft-light}"
    textColor: "{colors.body-on-light}"
    typography: "{typography.body-md}"
    padding: 64px
---

> Reference only: use the basic visual values in this file, such as colours, type sizes,
> spacing, surface levels and corner shapes. This is an analysis of Binance, not a list of
> ZerodhaRebuild features. Do not implement its product components or copy: no crypto or coin UI,
> deposit/withdraw or buy-crypto flows, Smart Money, markets/pairs tables, Binance wordmark,
> naming, claims or illustrations. ZerodhaRebuild trades NSE equities with simulated money.
> Read component examples for their dimensions, borders and states, then build the project's own
> components with its own copy.
>
> Role: Reference values and component anatomy, meaning the parts and visual structure of each component.
> Read before building UI. The `@theme` token set in `library-docs.md` → Tailwind CSS v4 explains how the project uses these values.
> Relates to: `library-docs.md` → "Adapting the system to this project" records the project's branding,
> font and theme choices. That file also records accessibility changes to the reference colours and links.
> Where this reference disagrees with the project tokens, the project tokens win because they are used in the app.
>
> A token is a named design value, such as `{colors.primary}` or `{spacing.section}`.
> CTA means call to action: the button or link for the main action. A canvas is the page background;
> a surface is a panel or card above it. A hairline is a thin, usually 1px, border.
> The YAML block above stores those names and values in a structured format for tooling. The sections
> below explain them. "Hero" means the opening section; "3-up" means three items side by side;
> "full-bleed" means an image or background extends to the edges of its container.

## Overview

Binance uses a near-black canvas (`{colors.canvas-dark}` — #0b0e11), white text and one main accent: Binance Yellow (`{colors.primary}` — #FCD535). Yellow identifies primary CTAs, value-claim headlines ("FUNDS ARE SAFU"), "Sign Up" pills, featured tiers and the wordmark. There is no second brand colour.

BinanceNova is the font for headlines, section titles and body copy. BinancePlex is used for financial figures, including prices, transaction volumes, user counts and prize pools. Display text uses weights 600–700; body text uses 400. Tabular numbers, whose digits have equal widths, keep figures aligned in columns.

The reference changes theme by page type. Marketing pages (homepage, smart-money, futures arena) use dark backgrounds; transactional pages (buy crypto, deposit, withdraw) use light backgrounds. Canvas, surface and text tones change, while yellow CTAs and gray-blue hairlines (`{colors.hairline-on-light}` — #eaecef) remain. Green (`{colors.trading-up}` — #0ecb81) means a price rose; red (`{colors.trading-down}` — #f6465d) means it fell. ZerodhaRebuild's defaults and accessible text colours are documented in `library-docs.md`.

Key Characteristics:

- Single accent colour: `{colors.primary}` (#FCD535) identifies primary CTAs, hero headlines, the brand mark and badges. It is sparse on dark pages and more frequent in transactional dialogs.
- Font families: `BinanceNova` for display and body text; `BinancePlex` for numbers, prices and financial data. Large statistics use BinancePlex to keep digits consistent.
- Multi-theme: marketing pages default dark (`{colors.canvas-dark}`); transactional pages flip light (`{colors.canvas-light}`). Yellow CTAs and trading green/red are shared across both.
- Light footer on dark body: the reference homepage ends with `{colors.surface-soft-light}` (#fafafa), even when the page above is dark.
- Trading semantics: green up / red down (`{colors.trading-up}` / `{colors.trading-down}`) for price changes, applied as text color rather than badge background.
- Card surfaces: `{colors.surface-card-dark}` (#1e2329) for cards on dark pages; `{colors.canvas-light}` on light pages. Use flat colour blocks, without gradient surfaces or atmospheric backdrops.
- Border radius is small to medium: `{rounded.md}` (6px) for primary buttons, `{rounded.lg}` (8px) for inputs and content cards, `{rounded.xl}` (12px) for elevated card containers, `{rounded.pill}` for prominent feature CTAs.
- Spacing follows a 4-multiple scale; major editorial bands sit at `{spacing.section}` (80px) — slightly tighter than typical marketing-only sites because product pages need denser layouts.

## Colors

### Brand & Accent

- Binance Yellow (`{colors.primary}` — #FCD535): The only brand colour. It is used for primary CTA backgrounds, the wordmark, brand-claim headlines ("FUNDS ARE SAFU"), trust badges ("No.1 Trading Volume"), large stat numbers in `{component.stat-callout-card}`, and inline links.
- Binance Yellow Active (`{colors.primary-active}` — #f0b90b): A darker, slightly more saturated yellow for pressed and hover states.
- Binance Yellow Disabled (`{colors.primary-disabled}` — #3a3a1f): A dull dark yellow for disabled CTAs on dark backgrounds.
- Accent Turquoise (`{colors.accent-turquoise}` — #2dbdb6): Used sparingly for Smart Money's "Check Now" CTA on dark surfaces. This is an exception for that product, not a second system colour.

### Surface

The reference uses two page backgrounds, chosen by page type:

Dark mode (marketing default):

- Canvas Dark (`{colors.canvas-dark}` — #0b0e11): The main page background: near-black with a slight warm tint, never pure black.
- Surface Card Dark (`{colors.surface-card-dark}` — #1e2329): Cards, navigation dropdowns, secondary buttons over dark canvas, markets table.
- Surface Elevated Dark (`{colors.surface-elevated-dark}` — #2b3139): One step lighter, used for nested cards, hovered nav items, and chart background panels.

Light mode (transactional):

- Canvas Light (`{colors.canvas-light}` — #ffffff): The page floor on transactional pages (buy crypto, deposit forms, account dialogs).
- Surface Soft Light (`{colors.surface-soft-light}` — #fafafa): Footer surface and disabled states.
- Surface Strong Light (`{colors.surface-strong-light}` — #f5f5f5): Form input backgrounds in muted contexts.

### Hairlines & Borders

- Hairline on Light (`{colors.hairline-on-light}` — #eaecef): The 1px border on light surfaces. The Dembrandt analysis tool counted 1022 occurrences, the highest count of any token in the analysis.
- Hairline on Dark (`{colors.hairline-on-dark}` — #2b3139): The 1px border on dark surfaces. It has the same hex value as `{colors.surface-elevated-dark}`, so borders resemble a change in surface level.
- Border Strong (`{colors.border-strong}` — #cdd1d6): A heavier border tone used on disabled secondary buttons.

### Text

- Ink (`{colors.ink}` — #181a20): The strongest text on light surfaces. Display headlines on transactional pages.
- Body on Dark (`{colors.body}` — #eaecef): Default paragraph text on dark backgrounds. It is slightly cooler than pure white.
- Body on Light (`{colors.body-on-light}` — #181a20): Same as ink — light-mode body text reuses the ink token.
- Muted (`{colors.muted}` — #707a8a): Footer links, breadcrumbs, captions, table column headers. Works on both light and dark canvas.
- Muted Strong (`{colors.muted-strong}` — #929aa5): A more prominent muted tone for labels.
- On Primary (`{colors.on-primary}` — #181a20): Black text on yellow primary CTAs.
- On Dark (`{colors.on-dark}` — #ffffff): Pure white for high-contrast headlines on dark canvas.

### Trading Semantics

- Trading Up (`{colors.trading-up}` — #0ecb81): Green for rising prices, shown in tables, charts and inline ticker arrows. This part of the reference says not to use it as a button background, while its Buttons section describes explicit Buy / Long buttons using it. Keep that exception limited to trading actions; see the project adaptation below.
- Trading Down (`{colors.trading-down}` — #f6465d): Red for falling prices, with the same rules and explicit trading-button exception as trading-up.

ZerodhaRebuild separates these colours into two sets for contrast: `--color-up` / `--color-down`
are fixed fills for candle bodies, buttons and status dots; `--color-up-text` / `--color-down-text`
are the theme-aware text colours for prices. See `library-docs.md` → Tailwind CSS v4 and
`constraints.md` → Theming for the F38 adaptation. The reference's text-colour rule above does
not override it.

### Info / Focus

- Info (`{colors.info}` — #3b82f6): Inline information badges and the base colour for focus rings, the outline showing keyboard focus. Dembrandt found the Tailwind `--tw-ring-color` token on focused inputs.

## Typography

### Font Family

The reference uses BinanceNova for headlines and body text, and BinancePlex for numbers and financial data. Both are licensed Binance fonts. If unavailable, the browser tries each font in this fallback stack in order: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.

Each family has a separate job:

- BinanceNova → editorial type (headlines, paragraphs, button labels, nav)
- BinancePlex → tabular numerical type (prices, volumes, percentages, stat counters, prize pools)

Keep these roles consistent: BinancePlex for financial figures and BinanceNova for reading text.

### Hierarchy

| Token                         | Size | Weight | Line Height | Letter Spacing | Use                                                                                 |
| ----------------------------- | ---- | ------ | ----------- | -------------- | ----------------------------------------------------------------------------------- |
| `{typography.hero-display}`   | 64px | 700    | 1.1         | -1px           | Homepage h1 ("316,258,026 USERS TRUST US")                                          |
| `{typography.display-lg}`     | 48px | 700    | 1.1         | -0.5px         | Brand-claim headlines ("FUNDS ARE SAFU"), prize-pool hero ("Futures Masters Arena") |
| `{typography.display-md}`     | 40px | 600    | 1.15        | -0.3px         | Section heads on long-scroll pages                                                  |
| `{typography.display-sm}`     | 32px | 600    | 1.2         | 0              | CTA band headlines ("Secure, Low-Fee Trading on Binance")                           |
| `{typography.title-lg}`       | 24px | 600    | 1.3         | 0              | Sub-section titles                                                                  |
| `{typography.title-md}`       | 20px | 600    | 1.35        | 0              | QR-promo cards, feature card titles                                                 |
| `{typography.title-sm}`       | 16px | 600    | 1.4         | 0              | Trust badges, FAQ rows, step labels                                                 |
| `{typography.number-display}` | 40px | 700    | 1.1         | -0.3px         | Big stat numbers (15,000 BTC, $429,423,449) — BinancePlex                           |
| `{typography.number-md}`      | 16px | 500    | 1.4         | 0              | Markets table prices, table cells — BinancePlex                                     |
| `{typography.number-sm}`      | 14px | 500    | 1.4         | 0              | Inline prices, % changes — BinancePlex                                              |
| `{typography.body-md}`        | 14px | 400    | 1.5         | 0              | Default running-text — BinanceNova                                                  |
| `{typography.body-sm}`        | 13px | 400    | 1.5         | 0              | Cookie consent text, footer body                                                    |
| `{typography.caption}`        | 12px | 500    | 1.4         | 0              | Small meta labels                                                                   |
| `{typography.button}`         | 14px | 600    | 1           | 0              | Standard CTA button labels                                                          |
| `{typography.nav-link}`       | 14px | 500    | 1.4         | 0              | Top nav menu items                                                                  |

### Principles

The largest display sizes use weight 700 so headlines and numbers remain easy to scan beside charts and dense tables. Keep that weight; do not reduce it to 400, as in the lighter display styles used by Airtable or Stripe.

Use BinancePlex for `{typography.number-display}` and the smaller number styles, including prices, volumes and statistics, even when surrounding text uses BinanceNova.

### Note on Font Substitutes

If the Binance fonts are unavailable, use Inter for BinanceNova. JetBrains Mono or IBM Plex Sans can substitute for BinancePlex: JetBrains Mono gives every character the same width; IBM Plex Sans has more natural letter proportions. ZerodhaRebuild chooses IBM Plex Sans and enables equal-width digits separately. Reduce display line-height by ~3% to match BinanceNova's tighter capital-letter height.

## Layout

### Spacing System

- Base unit: 4px.
- Tokens: `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 80px.
- Section padding (vertical): `{spacing.section}` (80px) — slightly tighter than airy marketing sites (96px) because Binance pages mix marketing bands with dense product surfaces (markets tables, FAQ accordions).
- Card internal padding: `{spacing.lg}` (24px) for content cards and markets tables; `{spacing.xl}` (32px) for QR-promo cards and CTA bands; `{spacing.md}` (16px) for trust badges and table rows.
- Gutters: `{spacing.lg}` (24px) between cards in 3-up grids; `{spacing.md}` (16px) inside footer column gutters and dense FAQ lists.

### Grid & Container

- Max content width: ~1280px centered on marketing pages; ~1440px on product surfaces (markets, smart-money tables) where horizontal density matters.
- Editorial body: Single 12-column grid; product pages often use 8/4 split (main panel + side rail).
- Markets table: 5-column header (Pair / Last Price / 24h Change / 24h Volume / Action), with the first column carrying coin icon + symbol pair.
- Footer: 6-column link list at desktop, wrapping to 2-up at tablet and 1-up on mobile.

### Whitespace Philosophy

The reference uses compact layouts: hero sections, market tables, expandable FAQs and feature grids sit close together. Colour contrast separates them. Keep the spacing between major sections uniform at `{spacing.section}`.

## Elevation & Depth

| Level              | Treatment                                                                                                    | Use                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Flat               | No shadow, no border                                                                                         | Body sections, top nav, hero bands, footer                                               |
| Soft hairline      | 1px `{colors.hairline-on-dark}` or `{colors.hairline-on-light}`                                              | Inputs, table dividers, FAQ row separators, secondary buttons                            |
| Card surface       | `{colors.surface-card-dark}` background on dark canvas, `{colors.canvas-light}` on light context — no shadow | All elevated cards (markets-table-card, QR-promo-card, feature-photo-card, trust-badges) |
| Subtle drop shadow | Faint shadow visible only when a card sits over imagery                                                      | Used sparingly on the buy-crypto-amount-card on transactional pages                      |
| Focus ring         | `0 0 0 2px {colors.info-ring}` at 50% alpha                                                                  | Input + button keyboard focus state                                                      |

Elevation means how far a surface appears to sit above the page. The reference creates it with flat colour blocks: `{colors.canvas-dark}` and `{colors.surface-card-dark}` have a 12-step lightness difference. Do not add heavy shadows or glassmorphism (translucent, blurred panels).

### Decorative Depth

- Yellow → dark vertical gradient backdrop on the Futures Arena hero: `{colors.primary}` fading down to `{colors.canvas-dark}`. This is a single-page treatment used for product-launch / event hero surfaces, not a system-wide signature.
- Coin-stack illustrations flanking large stat blocks (3D rendered crypto coins, trophy icons). These are illustrations, not tokens — treat as content rather than design system surface.

## Shapes

### Border Radius Scale

| Token            | Value        | Use                                                                       |
| ---------------- | ------------ | ------------------------------------------------------------------------- |
| `{rounded.xs}`   | 2px          | Almost no use — reserved for very small badges                            |
| `{rounded.sm}`   | 4px          | Small inline buttons (subscribe, trading-up / trading-down inline)        |
| `{rounded.md}`   | 6px          | Standard CTA buttons, primary buttons, primary input fields               |
| `{rounded.lg}`   | 8px          | Search input, content cards, trust badges, sub-cards                      |
| `{rounded.xl}`   | 12px         | Elevated card containers (markets-table-card, QR-promo-card, CTA bands)   |
| `{rounded.pill}` | 9999px       | Prominent feature CTAs ("Sign Up" pill on dark, futures-arena "Join Now") |
| `{rounded.full}` | 9999px / 50% | Coin icons, avatars                                                       |

Most reference surfaces have 6–12px corner radii. The much rounder pill is reserved for prominent actions near the top of the page.

### Photography & Iconography

- Coin icons render as 24×24 or 32×32 rounded glyphs (often 50% radius on circular outline + the coin's brand color inside).
- 3D rendered coin stacks and trophy illustrations are full-color illustrations with a slight floor shadow — not flat icons.
- Photographic content (people-using-the-app section) crops to `{rounded.xl}` (12px) corners, full-bleed on mobile.

## Components

These are descriptions of the source interface. Use their visual structure as a reference;
ZerodhaRebuild does not implement the Binance products, claims or flows listed here.

### Top Navigation

`top-nav-dark` — The marketing top nav on dark canvas. 64px tall, `{colors.canvas-dark}` background. The left side has the yellow Binance wordmark and a horizontal menu (Buy Crypto, Markets, Trade, Futures, Earn, Square, Smart Money, Campaigns). The right side has a language selector, light/dark toggle, "Log In" link and "Sign Up" `{component.button-primary}`. The wordmark uses `{colors.primary}` for "BINANCE" type.

`top-nav-light` — The transactional top nav on light canvas (buy crypto, deposit pages). Same layout but `{colors.canvas-light}` background and `{colors.ink}` menu items.

### Buttons

`button-primary` — The standard primary CTA. Background `{colors.primary}`, text `{colors.on-primary}` (black on yellow), type `{typography.button}`, padding 12px × 24px, height 40px, rounded `{rounded.md}` (6px). Press state: `button-primary-active` darkens to `{colors.primary-active}` (#f0b90b). Disabled state: `button-primary-disabled` desaturates to `{colors.primary-disabled}`.

`button-primary-pill` — A larger pill-shaped primary CTA for sign-up near the top of the page and product-launch opening sections (Futures Arena "Join Now"). Same yellow + black combination, padding 14px × 32px, rounded `{rounded.pill}` (9999px). Use it sparingly to identify the page's main action.

`button-secondary-on-dark` — Used over `{colors.canvas-dark}` for less-emphasized actions. Background `{colors.surface-card-dark}`, text `{colors.on-dark}`, rounded `{rounded.md}`.

`button-secondary-on-light` — Light-canvas equivalent. Background `{colors.canvas-light}` with `{colors.hairline-on-light}` 1px border, text `{colors.ink}`.

`button-tertiary-text` — Inline text button with no background. Used for "Log In" in the top nav and inline "Read More" links.

`button-trading-up` — A solid green button used on price-up signals (Buy / Long actions). Background `{colors.trading-up}`, text `{colors.on-dark}`, rounded `{rounded.sm}` (4px), padding 8px × 20px. Smaller and tighter than `{component.button-primary}` because it appears in dense trading interfaces.

`button-trading-down` — Symmetric red variant for Sell / Short actions. Same shape, background `{colors.trading-down}`.

`button-subscribe` — Compact yellow CTA used in the Smart Money traders table to subscribe to a top trader. Smaller height (28px) and tighter padding than the primary CTA — fits inside dense table rows. Same yellow + black combination.

`text-link` — Inline body links in `{colors.primary}` (yellow on dark, also yellow on light). No underline by default. Type inherits `{typography.body-md}`.

### Cards & Containers

`hero-band-dark` — Full-width dark section containing the homepage h1, a supporting headline and two CTAs. Background `{colors.canvas-dark}`, padding `{spacing.section}` (80px). The h1 ("316,258,026 USERS TRUST US") uses `{typography.hero-display}` at 64px / 700 — the system's largest type role.

`stat-callout-card` — Inline yellow stat numbers (15,000 BTC, 7,488,223, $429,423,449). Transparent background, text `{colors.primary}`, type `{typography.number-display}` in BinancePlex. This block has no card background; the yellow figures provide the emphasis.

`trust-badge` — Small dark cards holding "No.1 Customer Service" / "No.1 Trading Volume" claims. Background `{colors.surface-card-dark}`, rounded `{rounded.lg}` (8px), padding 16px × 20px. Yellow numeric or word badge ("No.1") sits next to a short label.

`markets-table-card` — The right-side markets table on the homepage. Background `{colors.surface-card-dark}`, rounded `{rounded.xl}` (12px), padding `{spacing.lg}` (24px). Contains tabs (Popular / New listing / Top gainers), followed by coin-pair rows in a 5-column table with last price, 24h change % and an action button. Each row uses `{component.markets-row}`.

`markets-row` — A single row inside the markets table. Transparent background, 12px vertical padding, hairline divider between rows. A coin icon (32×32) and symbol sit on the left; the last price uses `{typography.number-md}` (BinancePlex); 24h change cell colored by direction (`{component.price-up-cell}` or `{component.price-down-cell}`); right-aligned chevron icon for "view detail."

`price-up-cell` / `price-down-cell` — Colored text cells for price changes. Transparent background, text `{colors.trading-up}` or `{colors.trading-down}`, type `{typography.number-md}` in BinancePlex. Always paired with a small triangle arrow indicating direction.

`feature-photo-card` — The "Trade on the go" section's photo strip — 3 lifestyle photos showing people using the Binance app. Background `{colors.surface-card-dark}`, rounded `{rounded.xl}`. Photos crop edge-to-edge, no internal padding around the image.

`qr-promo-card` — The "Trade on the go. Anywhere, anytime." card with QR code. Background `{colors.surface-card-dark}`, rounded `{rounded.xl}`, padding `{spacing.xl}` (32px). Contains an h2 in `{typography.title-md}`, a body paragraph, app store badges (iOS / Android), and a centered QR code.

`funds-safu-band` — The yellow-headlined "FUNDS ARE SAFU" band. Background stays `{colors.canvas-dark}`, but the headline uses `{colors.primary}` at `{typography.display-lg}`. Below the headline, three large `{component.stat-callout-card}` numbers anchor the band: total BTC reserves, users helped, funds recovered.

`faq-row` — One FAQ accordion row, which expands to show an answer. Transparent background, padding 20px vertical, hairline divider between rows. Closed state: question in `{typography.title-sm}` + chevron icon at right. Open state: question + answer body in `{typography.body-md}`.

`cta-band-dark` — The "Secure, Low-Fee Trading on Binance" pre-footer CTA band. Background `{colors.surface-card-dark}` (one step elevated from canvas), rounded `{rounded.xl}`, padding `{spacing.xxl}` (48px). Contains an h2 in `{typography.display-sm}` and a right-aligned `{component.button-primary}`.

### Light-Mode Transactional Components

`buy-crypto-amount-card` — The right-rail card on the Buy BTC page. Background `{colors.canvas-light}`, rounded `{rounded.lg}` (8px), padding `{spacing.lg}` (24px). Contains an editable amount input in `{typography.number-display}` (BinancePlex), a currency selector, and a yellow `{component.button-primary}` for "Continue" / "Confirm Order."

`steps-card` — The "How to Buy Crypto" 3-up cards (Enter Amount → Confirm Order → Receive Crypto). Background `{colors.canvas-light}`, rounded `{rounded.lg}`, padding `{spacing.lg}`. Each card has a small numbered icon, a `{typography.title-sm}` step name, and a body description.

`price-chart-card` — The "Bitcoin Markets" card containing the BTC price chart. Background `{colors.canvas-light}`, rounded `{rounded.lg}`. A pair selector ($79,065.04, +0.45%) sits above a candlestick / line chart in `{colors.trading-up}` and `{colors.trading-down}`. Below it is a timeframe selector (24H / 1W / 1M / 3M / 1Y / ALL).

`conversion-cell` — A single row in the BTC ↔ USD conversion table. Transparent background, text `{colors.body-on-light}`, type `{typography.body-md}`. Pair label on left (BTC, USDT, etc.); USD equivalent on right.

### Inputs & Forms

`search-input-on-dark` — The "Search currencies" input on the homepage hero. Background `{colors.surface-card-dark}`, text `{colors.on-dark}`, rounded `{rounded.lg}` (8px), padding 10px × 16px, height 40px. A yellow `{component.button-primary-pill}` ("Sign Up") sits on the right.

`text-input-on-light` — Standard input on transactional pages. Background `{colors.canvas-light}`, 1px `{colors.hairline-on-light}` border, rounded `{rounded.md}` (6px), padding 10px × 16px, height 40px. Focus state inherits the focus-ring shadow.

`cookie-consent-card` — The cookie banner card visible on the homepage. Background `{colors.canvas-light}`, rounded `{rounded.lg}`, padding `{spacing.md}` (16px). Body text in `{typography.body-sm}` (13px / 400) with three stacked button options (Accept Cookies & Continue / Reject Additional Cookies / Manage Cookies).

### Smart Money Sub-System

`trader-row` — A single row in the top-traders table on /smart-money. Transparent background, padding 12px vertical, hairline divider between rows. The left side has an avatar, trader name and private/public badge. Columns show ROI % (return on investment), AUM (assets under management) and mint date; a yellow `{component.button-subscribe}` sits on the right.

### Signature Components

`arena-hero-gradient` — The Futures Arena product-launch hero. A vertical gradient from `{colors.primary}` at top to `{colors.canvas-dark}` at bottom, with the prize-pool headline (4,000,000 USDT) in `{typography.display-lg}` centered. A `{component.button-primary-pill}` ("Join Now") sits below the headline. Used only on product-launch event surfaces — do not generalize to other heroes.

### Footer

`footer-light` — The light-gray footer that closes every page (including dark-canvas pages). Background `{colors.surface-soft-light}` (#fafafa), text `{colors.body-on-light}`. 6-column link list at desktop covering Community / About Us / Products / Business / Service / Learn columns. Vertical padding 64px. The light background separates the footer from the dark content above it.

## Do's and Don'ts

### Do

- Reserve `{colors.primary}` (Binance Yellow) for primary actions, brand-claim headlines and the wordmark. Do not use it for secondary actions or decoration; limiting its use preserves its emphasis.
- Keep `{component.button-primary}` (yellow with black text) as the universal primary CTA across both dark and light modes. The same button appears identically on `{colors.canvas-dark}` and `{colors.canvas-light}`.
- Use `{component.button-trading-up}` (green) and `{component.button-trading-down}` (red) only for explicit Buy/Sell or Long/Short actions. Never use them for general "confirm" or "cancel" because they carry semantic price-direction meaning.
- Use BinancePlex for prices, volumes, percentages and statistics. Keep BinanceNova out of number tickers.
- Choose canvas mode by surface intent: dark for marketing / product showcase / trading dashboards; light for transactional dialogs (buy / deposit / withdraw / form submission).
- Use `{spacing.section}` (80px) between editorial sections to keep the reference's compact spacing consistent.

### Don't

- Do not introduce a second brand colour. `{colors.primary}` is the only general accent. Smart Money's turquoise is an exception for that product.
- Don't use yellow for body text or large surface fills. It is for focal-point CTAs and headlines only.
- Don't use `{colors.trading-up}` / `{colors.trading-down}` as background fills on cards. They are price-direction signals, expressed as text color or small badge fill — never as a card surface.
- Keep `{typography.hero-display}` and `{typography.display-lg}` at weight 700; do not reduce them to 400.
- Do not add mesh gradients, aurora effects or glows to the canvas. Separate surfaces with flat colour contrast.
- Keep black text on yellow for `{component.button-primary}`. White text on yellow loses contrast.

## Responsive Behavior

### Breakpoints

| Name    | Width       | Key Changes                                                                                                                                                                          |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mobile  | < 768px     | Top nav collapses to hamburger; hero h1 drops from 64px to ~36px; markets table converts to a horizontally-scrollable card list; demo grids drop to 1-up; footer 6 columns wrap to 2 |
| Tablet  | 768–1024px  | Top nav stays horizontal but tightens, secondary menu items hide behind a "More" dropdown; markets table 2-up; pricing/feature grids 2-up                                            |
| Desktop | 1024–1440px | Full top-nav with all primary menu items; 5-column markets table; trading dashboards in 8/4 split (chart + side rail)                                                                |
| Wide    | > 1440px    | Same as desktop with more outer breathing room; max content width caps at 1280-1440px depending on surface                                                                           |

### Touch Targets

These are the recorded reference dimensions, not a verified accessibility guarantee for
ZerodhaRebuild. Use the project's accessibility rules and checks when building controls.

- Primary CTAs render at minimum 40 × 40px (`{component.button-primary}` height + padding) — meets WCAG AAA's 44 × 44 with surrounding spacing.
- Subscribe / inline action buttons are 28 × 28 — denser than ideal but matches industry trading platform norms.
- Coin icons in markets tables are 32 × 32px, with the entire row tappable for 44px+ effective target.

### Collapsing Strategy

- Top nav collapses to hamburger at < 768px; the menu opens as a full-screen sheet with the same yellow accent CTAs anchored to the bottom of the sheet.
- Markets table reflows to a horizontally-scrollable single card per coin pair on mobile.
- Shrink the hero statistic ("316M USERS") proportionally rather than wrapping it, so it remains one block.
- Trading dashboards switch from chart + side-rail to chart-only with a separate "Trade" tab on mobile.
- Keep the light footer at full width at every breakpoint; do not switch it to dark on smaller screens.

### Image Behavior

- Coin icons stay at fixed 24/32px sizes regardless of breakpoint.
- Lifestyle photos in the "Trade on the go" section crop responsively — wider at desktop, taller (vertical) at mobile.
- 3D coin-stack illustrations are fixed-aspect-ratio assets that scale uniformly without cropping.

## Iteration Guide

1. Work on one component at a time. Reference its YAML key directly (`{component.button-primary}`, `{component.markets-row}`).
2. When adding a new component, decide first whether it lives in dark mode (marketing / product) or light mode (transactional). The same component appears in both with surface tone flipped.
3. Variants of an existing component (`-active`, `-disabled`) live as separate entries in `components:` — never as nested state objects.
4. Use `{token.refs}` everywhere prose mentions a color, a radius, a typography role, or a spacing value.
5. Document Default and Active/Pressed states only. Do not add hover-state entries.
6. Keep font roles consistent: BinancePlex for numbers and BinanceNova for copy.
7. Trading green / red are semantic price tokens — never repurpose them for "success" or "error" generic states.

## Known Gaps

- The Dembrandt frequency analyzer counted `#eaecef` (light hairline) 1022 times, the highest token count. `{colors.primary}` (#FCD535) appeared much less often because it is an accent. Its brand role was confirmed from screenshots.
- The analysis records only the fixed font weights visible in screenshots. It does not define variable-font weight-axis tokens, which would describe a continuous range of weights.
- The analysis does not cover animation or transition timings, including chart redraws and price-change flashes.
- Only the default `{component.text-input-on-light}` state was extracted. Error and success variants need verification in a sign-up or order-confirmation flow.
- The analyzed URLs did not include Spot / Futures / Margin dashboards. This file therefore does not document their order books, candlestick settings or position-management cards.
- The marketing-page analysis did not establish whether a user can force transactional pages into dark mode with the theme toggle.
