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

Open [index.html](index.html) in your browser — no build step, no install. It's a single-page shell with a bottom tab bar; every feature is a self-contained **module** that the shell lazy-loads into an `<iframe>` the first time you open its tab.

Each module stores its own state in browser `localStorage`. No accounts, no server.

## Architecture

```
index.html              — app shell: topbar, bottom tab bar, quick-add sheet, settings
shared/
  shared.css            — CSS variables, topbar, tab bar, modals (loaded by every module)
  shell.js              — tab switching + lazy iframe loader, water widget, settings
  supabase.js           — Supabase client config (cloud sync)
  sync.js               — cloud-sync helper (initCloudSync), loaded by every module
  groq.js               — Groq API helper (AI features)
  profile.js            — user profile / goals helpers
modules/<name>/
  index.html            — standalone page that loads the module (this is what the iframe points at)
  <name>.html           — the module's markup fragment
  <name>.css            — the module's styles
  <name>.js             — the module's logic
```

The shell maps each bottom-bar tab to a module:

| Tab | Module(s) | What it is |
|---|---|---|
| **Main** | `main` + `life-calendar` | Day Ring, Goal Ticker, To Do list, calendar |
| **Health** | `health` (embeds `food` + `water` + `supplements`) | Whoop, nutrition, water, daily stack |
| **Training** | `training` (loads `gym` + `endurance`) | Progressive-overload gym + endurance tracker |
| **Others** | `bible` (with `thoughts` + `grades`) | Thoughts, Bible reading plan, School grades |
| **Finance** (topbar) | `finance` | Net worth, subscriptions, orders, wishlist |

Cloud sync is wired through `shared/sync.js` (`initCloudSync`), which every module's wrapper page loads alongside `supabase.js`.

### Adding a new module

1. Create `modules/<name>/` with `<name>.html`, `<name>.css`, `<name>.js`, and an `index.html` wrapper (copy an existing one — it loads the shared deps, the module CSS, then fetches the fragment and the JS).
2. Add a tab button in `index.html` and an entry in `TAB_MODULE` in `shared/shell.js`.

Functions called from inline `onclick=` handlers must be global (top-level `function foo(){}` or `window.foo = …`) — the module runs in its own iframe document, so there's no cross-module collision.

## Deploy

Push to any static host (GitHub Pages, Vercel, Netlify, Cloudflare Pages). There's no build step — the repo root is the web root, and `index.html` is the entry point.
