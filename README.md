# Personal Dashboard

A set of small, self-contained HTML apps that share a top bar.

---

> "Make the entire dashboard look and feel exactly like a native iOS app:
>
> **App shell:**
> - Remove ALL browser UI feel — no visible scrollbars, no text selection, no context menus on long press
> - Add `-webkit-user-select: none` on all non-input elements
> - Add `-webkit-tap-highlight-color: transparent` everywhere
> - Smooth 60fps scrolling on all panels with `will-change: transform`
>
> **Navigation:**
> - Tab bar looks exactly like iOS tab bar — frosted glass background, icons above labels, active tab has colored icon
> - Tab switching has smooth horizontal slide animation like native iOS
> - Each tab remembers its scroll position when switching
>
> **Cards and components:**
> - All cards have subtle shadow and border like iOS cards
> - Buttons have native iOS press feedback — slight scale down on tap
> - All modals slide up from bottom like iOS sheets with drag-to-dismiss handle at top
> - All inputs look like native iOS inputs — no browser default styling
> - Toggle switches look like iOS toggles
> - Steppers look like iOS steppers
>
> **Typography:**
> - Use SF Pro font stack: `-apple-system, BlinkMacSystemFont`
> - Large titles like iOS (34px bold) for main headings
> - Section headers small uppercase like iOS settings
>
> **Colors:**
> - Deep black background `#000000` like native iOS dark mode
> - Cards slightly lighter `#1C1C1E` like iOS grouped table view
> - Separators `rgba(255,255,255,0.08)` like iOS
> - Accent color: electric blue `#0A84FF` like iOS default
>
> **PWA:**
> - Proper `manifest.json` with all icon sizes
> - Status bar style `black-translucent` for Dynamic Island
> - Splash screen matching app background
> - Service worker for full offline support
> - `apple-mobile-web-app-capable` meta tag
> - Prevent all rubber-banding except main scroll
> - `overscroll-behavior: none` on all tab panels"

---

## Deploy your own copy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FRowanThistlebrooke%2FYTdashh1)

One click → Vercel signs you in, copies the repo to your GitHub, and deploys it. ~30 seconds to a live URL.

## How to use

Open any `.html` file directly in your browser — no build step, no install.

| File | What it is |
|---|---|
| [index.html](index.html) | Goals tracker (Day Ring, Goal Ticker, To Do list) — the home page |
| [health.html](health.html) | Supplement / daily stack tracker |
| [po-water.html](po-water.html) | Water intake tracker |
| [finance.html](finance.html) | Finances |
| [gym.html](gym.html) | Progressive overload gym tracker |
| [topbar.js](topbar.js) | Shared top bar — auto-injected into pages that `<script src="topbar.js">` |

Each app stores its own state in browser `localStorage`. No accounts, no server.

## Building from scratch

[BUILD_DASHBOARD.md](BUILD_DASHBOARD.md) is the prompt I gave Claude to generate `index.html` — paste it into Claude if you want to rebuild that page yourself.
