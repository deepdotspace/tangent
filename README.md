# Tangent

Find the line. A Wikipedia speed-running game: race from one article to another in the fewest clicks, clicking only the links inside each page. Everyone gets the same daily line, par stays hidden until you finish, and there is no signup to play.

**Live: [tangent.app.space](https://tangent.app.space)** · MIT · Built on the [DeepSpace SDK](https://docs.deep.space)

## Quick start

Deploy your own copy in three commands:

```sh
npm install
npx deepspace login     # one-time, opens a browser tab
npx deepspace deploy    # -> <name>.app.space
```

Auth, the database, real-time sync, Durable Objects, file storage, and hosting all come from DeepSpace, so there is nothing else to configure. Your subdomain is the `name` field in `wrangler.toml`; change it for your own deployment. After the first deploy, seed the curated puzzles:

```sh
SEED_BASE=https://<name>.app.space npx tsx scripts/curation/seed.ts
```

Run it locally instead:

```sh
npm install
npx deepspace login
npx deepspace dev       # http://localhost:5173
```

## Commands

| Command | What it does |
|---|---|
| `npx deepspace dev` | Local dev server (Vite + Worker, HMR on `:5173`) |
| `npx deepspace deploy` | Deploy to `<name>.app.space` |
| `npx deepspace test` | Playwright smoke + API/E2E specs |
| `npm run type-check` | `tsc --noEmit` |

## Modes

- **Daily.** One shared puzzle a day; everyone races the same line. Build a streak.
- **Solo.** Practice a curated line against par, the true shortest path.
- **Series.** A themed gauntlet of five lines, back to back.
- **Quick Race.** Live multiplayer in real time; rooms fill with ghosts of past runs so they are never empty.
- **Chaos.** Quick Race with power-ups and sabotage.
- **Ranked (beta).** One-on-one duels with a Glicko-2 skill rating and tiers.
- **Private rooms.** Share a code and race friends, no signup.

## How it works

A DeepSpace app on Cloudflare Workers, server-authoritative from end to end.

- **Anti-cheat by construction.** The worker fetches each Wikipedia article, extracts the legal in-article links, and serves a sanitized, link-rewritten body. The legal-move set never reaches the browser: every move is validated on the server against the frozen link set of the article you are actually on, so the page cannot be edited nor a request forged to cheat. The optimal solution and par live in a server-only collection and are revealed only when you finish.
- **Honest par.** Par is the true minimum-click distance, computed offline by breadth-first search over the exact link graph the runtime enforces (`scripts/curation`), so a displayed par is never unbeatable.
- **Live races on a Durable Object.** One room per race at a fixed tick rate with a single authoritative clock; first to arrive is decided by true server arrival order, and ranked settles a Glicko-2 rating on the server at match end.

Pairs, runs, daily challenges, streaks, leaderboards, and ratings live in DeepSpace record collections with per-collection access rules, so the client only ever reads what it should.

## Layout

```
src/
  pages/        file-routed React pages
  components/   UI and game components
  game/         live-race engine, client hooks, constants
  server/       article pipeline (anti-cheat), daily, streaks
  actions/      server actions (async race, matchmaking, ranked, seed)
  schemas/      collection schemas and RBAC
worker.ts       Hono worker: routes, websockets, Durable Objects
scripts/        offline puzzle build (BFS par and per-target distance maps)
```
