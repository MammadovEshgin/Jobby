# vakansiya-bot

A Telegram bot that collects job vacancies from Azerbaijani job boards every hour and sends each
user only the ones that match the positions they follow — in Azerbaijani, English or Russian.

Matching is concept-based, not keyword-based: a search for `music teacher` finds `Musiqi müəllimi`
and `Piano müəllimi`, but never `Fizika müəllimi`.

Runs on Cloudflare Workers (D1 + Cron Triggers), written in TypeScript with [grammY](https://grammy.dev).

## Commands

| Command | Description |
| --- | --- |
| `/start` | Registers the user and turns notifications on |
| `/ixtisas <text>` | Follows a position, e.g. `/ixtisas musiqi müəllimi` |
| `/ixtisaslar` | Lists followed positions, with inline delete buttons |
| `/sil <text>` | Stops following a position |
| `/axtar` | Searches now and returns every open match (up to 60, tightest first) |
| `/stop` | Turns notifications off |

The hourly run sends only vacancies the user has not received before; `/axtar` returns everything
that is currently open.

## How matching works

A vacancy is sent only when its title carries **every** idea the followed position carries. The rule
is one-directional: a title may add ideas, but it may never drop one.

```
music teacher      →  Musiqi müəllimi · Music Teacher · Piano müəllimi
music teacher      ✗  Fizika müəllimi        (shares "teacher", carries no "music")
backend developer  →  Java Developer         ("java" implies "backend")
backend developer  ✗  Frontend Developer
müəllim            →  every teacher          (no subject was asked for)
```

Three modules in `src/matching` implement it:

- **`lexicon.ts`** — concepts (`teacher`, `music`, `backend`, …), each listing its Azerbaijani,
  English and Russian spellings, plus the soft words (seniority, contract type, cities, boilerplate)
  that never decide a match.
- **`analyze.ts`** — turns a title or a followed position into the concepts it carries. Strips
  Azerbaijani suffixes (`müəllimlərinə` → `müəllim`) and reads multi-word terms (`ingilis dili`,
  `call center`) as single ideas.
- **`match.ts`** — requires every concept of the query to be present in the title, and scores
  tighter titles higher so the most relevant vacancy heads the message.

## Sources

About 900 listings per run, deduplicated by `sha256(title | company)`.

| Source | Method | Coverage |
| --- | --- | --- |
| hellojob.az | HTML, 4 listing pages | ~320 |
| busy.az | Public JSON API, 2 × 100 | ~200 |
| smartjob.az | HTML, `/vacancies` | ~100 |
| jobs.glorri.az | Public JSON API, 6 pages | ~105 |
| vakansiya.biz | HTML, 5 listing pages | ~100 |
| vakansiya.az | HTML, latest listings | ~60 |
| jobsearch.az | HTML, first page | ~30 |

Adding a source means implementing the `Scraper` interface in `src/scrapers` and registering it in
`src/scrapers/index.ts`. A source that fails is logged and skipped; the rest of the run continues.

## Architecture

```
Cron (hourly)  ──▶ scrape all sources ──▶ dedupe ──▶ vacancy_snapshot (D1)
                                                 └─▶ match per user ──▶ unsent only ──▶ Telegram

/axtar         ──▶ read vacancy_snapshot ──▶ match ──▶ all open matches ──▶ Telegram
```

```
src/
├── bot.ts              grammY bot, middleware, callback queries
├── index.ts            Worker entry: webhook fetch handler + cron handler
├── commands/           one file per Telegram command
├── db/                 D1 access: users, followed positions, sent ids, snapshot
├── matching/           lexicon, analyzer, matcher, normalizer
├── pipeline/           scrape → match → format → send
├── scrapers/           one file per job board
└── utils/              fetch with retry, fingerprints, structured logging
```

The snapshot table is what keeps `/axtar` responsive: the webhook must answer Telegram within
seconds, so a manual search reads the last scrape instead of hitting seven job boards inline, and
the reply is delivered from a background task.

## Getting started

Requires Node.js 20+ and a Cloudflare account.

```sh
npm install
cp .dev.vars.example .dev.vars     # BOT_TOKEN, WEBHOOK_SECRET
npx wrangler d1 create vakansiya-bot   # paste database_id into wrangler.toml
npm run db:apply:local
npm run dev
```

`BOT_TOKEN` comes from [@BotFather](https://t.me/BotFather); `WEBHOOK_SECRET` is any random string
that Telegram echoes back on every webhook call.

## Deployment

```sh
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npm run db:apply:remote
npm run deploy
npm run set-webhook -- https://<worker>.workers.dev
```

## Development

```sh
npm run typecheck
npm test
npm run tail        # live structured logs from production
```

Scraper tests run against saved fixtures in `tests/fixtures`, so the suite never depends on a live
job board. Pipeline tests use an in-memory D1 double.

## Operations

- Cron: `7 * * * *` — off the round hour to avoid Cloudflare's cron herd.
- Retention: sent-vacancy ids for 60 days, snapshot rows for 14 days, pruned in the 03:xx Baku run.
- Logs are single-line JSON: `scraper_complete`, `scraper_failed`, `scraper_page_skipped`,
  `pipeline_complete`, `pipeline_failed`, `manual_search_complete`, `manual_search_failed`,
  `delivery_failed`, `bot_error`.
