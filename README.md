# Jobby

A Telegram bot that sweeps seven Azerbaijani job boards every hour and sends each user only the vacancies that match the positions they follow. Built on Cloudflare Workers + D1, with a bilingual concept matcher that knows `music teacher` and `Musiqi müəllimi` are the same job — and that `Fizika müəllimi` is not.

<p>
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript" />
  <img alt="grammY" src="https://img.shields.io/badge/grammY-1.30-26A5E4?logo=telegram" />
  <img alt="Database" src="https://img.shields.io/badge/D1-SQLite-003B57?logo=sqlite" />
  <img alt="Sources" src="https://img.shields.io/badge/sources-7%20job%20boards-blue" />
  <img alt="Tests" src="https://img.shields.io/badge/tests-86%20passing-brightgreen" />
  <img alt="License" src="https://img.shields.io/badge/license-Proprietary-red" />
</p>

---

## Highlights

- **Matching that discriminates** — a vacancy is sent only when its title carries *every* idea the followed position carries. `music teacher` finds `Musiqi müəllimi` and `Piano müəllimi`, never `Fizika müəllimi`, even though both are teachers. See [Matching Engine](#matching-engine).
- **Bilingual by construction** — each concept lists its Azerbaijani, English and Russian spellings, so one saved position matches postings in any of the three. Azerbaijani suffixes are stripped (`müəllimlərinə` → `müəllim`) and multi-word terms (`ingilis dili`, `call center`) read as single ideas.
- **Seven sources, ~900 listings per run** — HTML boards and private JSON APIs, deduplicated by `sha256(title | company)`. A board that blocks or breaks is logged and skipped; the run continues on the rest.
- **Never the same vacancy twice** — every delivery is fingerprinted per user, so the hourly run only ever sends what is new.
- **Instant manual search** — `/axtar` answers from the last scrape stored in D1 and runs past the webhook response, so it never stalls behind seven job boards.
- **Open beyond the front page** — a vacancy counts as open for 7 days after a source last listed it, so `/axtar` reaches postings that have already scrolled off the listing pages.
- **Serverless and free to run** — one Worker, one D1 database, one cron trigger. No servers, no queues, no polling.

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Cloudflare Workers |
| Language | TypeScript 5 (strict) |
| Bot framework | [grammY](https://grammy.dev) 1.30 (`grammy/web`) |
| Storage | Cloudflare D1 (SQLite) |
| Scheduling | Cron Triggers (`7 * * * *`) |
| Scraping | `node-html-parser` + public JSON APIs |
| Tests | Vitest (fixture-based, no live network) |
| Tooling | Wrangler, tsx |

## Bot Commands

| Command | What it does |
|---|---|
| `/start` | Registers the user and turns notifications on |
| `/ixtisas <text>` | Follows a position — `/ixtisas musiqi müəllimi` |
| `/ixtisaslar` | Lists followed positions, with inline delete buttons |
| `/sil <text>` | Stops following a position |
| `/axtar` | Searches now and returns every open match (up to 60, tightest first) |
| `/stop` | Turns notifications off |

The hourly run sends only vacancies a user has not received before. `/axtar` ignores that history and returns everything currently open.

## Quick Start

### Prerequisites

- Node.js 20+
- A Cloudflare account (Workers + D1)
- A bot token from [@BotFather](https://t.me/BotFather)

### Setup

```bash
git clone https://github.com/MammadovEshgin/Jobby.git
cd Jobby
npm install
cp .dev.vars.example .dev.vars        # BOT_TOKEN, WEBHOOK_SECRET
npx wrangler d1 create vakansiya-bot  # paste database_id into wrangler.toml
npm run db:apply:local
npm run dev
```

> `WEBHOOK_SECRET` is any long random string; Telegram echoes it back on every webhook call and the Worker rejects requests that do not carry it. See [`.dev.vars.example`](.dev.vars.example) — `.dev.vars` is gitignored and production values belong in `wrangler secret put`.

## Available Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run the Worker locally with `wrangler dev --local` |
| `npm test` | Vitest suite — 86 tests across 12 files |
| `npm run typecheck` | `tsc --noEmit` — strict TypeScript pass |
| `npm run deploy` | Publish the Worker to Cloudflare |
| `npm run set-webhook -- <url>` | Point Telegram at the deployed Worker |
| `npm run db:apply:local` / `:remote` | Apply `schema.sql` to the local or production D1 |
| `npm run tail` | Stream structured production logs |

## Project Structure

```
src/
├── index.ts          Worker entry: webhook fetch handler + cron handler
├── bot.ts            grammY bot, env middleware, callback queries
├── commands/         One file per Telegram command
├── matching/         lexicon, analyzer, matcher, normalizer
├── pipeline/         scrape → match → format → send
├── scrapers/         One file per job board, plus the registry
├── db/               D1 access: users, positions, sent ids, snapshot
└── utils/            Fetch with retry, fingerprints, structured logging

tests/                Vitest suites (matching, pipeline, scrapers, formatting)
tests/fixtures/       Saved board responses, so tests never hit the network
schema.sql            D1 schema (users, user_fields, sent_vacancies, vacancy_snapshot)
scripts/              set-webhook
```

## Matching Engine

The matcher lives in `src/matching` and answers one question: does this title carry every idea the user asked for? The rule is deliberately one-directional — a title may *add* ideas (seniority, a branch, a second subject), but it may never *drop* one.

```
music teacher      →  Musiqi müəllimi · Music Teacher · Piano müəllimi
music teacher      ✗  Fizika müəllimi        (shares "teacher", carries no "music")
backend developer  →  Java Developer         ("java" implies "backend")
backend developer  ✗  Frontend Developer
müəllim            →  every teacher          (no subject was asked for)
```

Three stages:

1. **[`lexicon.ts`](src/matching/lexicon.ts)** — ~130 concepts (`teacher`, `music`, `backend`, `driver`, …), each listing its Azerbaijani, English and Russian surface forms in root form, plus an `implies` hierarchy (`piano` → `music`, `react` → `frontend`, `doctor` → `medicine`). A separate soft-term list holds the words that must never decide a match: seniority, contract type, city names, salary boilerplate.
2. **[`analyze.ts`](src/matching/analyze.ts)** — turns raw text into the set of concepts it carries. Azerbaijani is agglutinative, so lookups walk prefixes down to a 4-character root instead of assuming a fixed suffix table, and multi-token phrases are matched longest-first. A word that matches no concept becomes a literal requirement rather than being dropped.
3. **[`match.ts`](src/matching/match.ts)** — requires every concept of the query to be present in the title, then scores: an exact title wins, otherwise tighter titles (fewer extra concepts, fewer tokens) rank above noisy ones, so the most relevant vacancy heads the message.

## Sources

| Source | Method | Per run |
|---|---|---|
| hellojob.az | HTML, 4 listing pages | ~320 |
| busy.az | JSON API, 2 × 100 | ~200 |
| jobs.glorri.az | JSON API, 6 pages | ~105 |
| smartjob.az | HTML, `/vacancies` | ~100 |
| vakansiya.biz | HTML, 5 listing pages | ~100 |
| vakansiya.az | HTML, latest listings | ~60 |
| jobsearch.az | HTML, first page | ~30 |

Adding a board means implementing the `Scraper` interface in `src/scrapers` and registering it in [`src/scrapers/index.ts`](src/scrapers/index.ts). Every scraper exports a pure `parse…(html)` function so it can be tested against a saved fixture.

## Architecture

```
Cron (hourly)  ──▶ scrape 7 boards ──▶ dedupe ──▶ vacancy_snapshot (D1)
                                              └─▶ match per user ──▶ unsent only ──▶ Telegram

/axtar         ──▶ read vacancy_snapshot ──▶ match ──▶ all open matches ──▶ Telegram
```

The snapshot table is what keeps `/axtar` responsive. A webhook has seconds to answer Telegram, and a Worker cancels unawaited work the moment it responds — so a manual search reads the last scrape instead of hitting seven boards inline, and delivers its reply from a background task that outlives the response.

## Testing

```bash
npm run typecheck && npm test
```

- `match.test.ts` — 52 cases: cross-language pairs, subject discrimination (`music` vs `physics` teacher), technology discrimination (`backend` vs `frontend`), noisy titles, Azerbaijani suffix forms, scoring order.
- `pipeline.test.ts` — the full run against an in-memory D1 double: filtering, no-resend on the next hour, snapshot reuse, live-scrape fallback, per-user delivery failures, the 60-result cap.
- `scrapers/*.test.ts` — each board parsed from a saved fixture, so a redesign shows up as a failing test rather than a silent zero.
- `format.test.ts`, `normalize.test.ts`, `fingerprint.test.ts` — Telegram HTML output and the 4096-character split, diacritic folding, deduplication.

## Deployment

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npm run db:apply:remote
npm run deploy
npm run set-webhook -- https://<worker>.workers.dev
```

## Operations

- **Cron:** `7 * * * *` — off the round hour, away from Cloudflare's cron herd.
- **Retention:** sent-vacancy ids 60 days, snapshot rows 14 days, pruned in the 03:xx Baku run.
- **Logs** are single-line JSON — `npm run tail`:

| Event | Meaning |
|---|---|
| `scraper_complete` / `scraper_failed` | Per-board result, count and duration |
| `scraper_page_skipped` | One listing page failed; the board still returned |
| `pipeline_complete` / `pipeline_failed` | Hourly run summary |
| `manual_search_complete` / `manual_search_failed` | `/axtar` outcome per user |
| `delivery_failed` | A chat rejected the message (blocked bot, rate limit) |
| `bot_error` | Unhandled error inside a command handler |

## License

Proprietary. © Eshgin Mammadov. All rights reserved.
