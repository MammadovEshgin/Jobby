# vakansiya-bot

Telegram bot that aggregates Azerbaijani job vacancies hourly and notifies users based on their subscribed fields. It runs on Cloudflare Workers with TypeScript, grammY, D1, Cron Triggers, and static HTML scraping.

Matching is concept-based and bilingual: a search for `music teacher` finds `Musiqi müəllimi` but never `Fizika müəllimi`.

## Local Setup

```sh
npm install
copy .dev.vars.example .dev.vars
npx wrangler d1 create vakansiya-bot
npm run db:apply:local
npm run dev
```

Fill `.dev.vars` with local `BOT_TOKEN` and `WEBHOOK_SECRET`. For production, set secrets through Wrangler:

```sh
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
```

## Database

Apply schema locally and remotely:

```sh
npm run db:apply:local
npm run db:apply:remote
```

`wrangler.toml` must contain the D1 `database_id` returned by `npx wrangler d1 create vakansiya-bot`.

## Development

```sh
npm run typecheck
npm test
npm run dev
```

Working sources (~650 vacancies per run):

- `hellojob.az` (4 listing pages)
- `jobsearch.az`
- `smartjob.az` (`/vacancies` listing)
- `jobs.glorri.az` (public job API, 6 pages)
- `vakansiya.biz` (5 listing pages)

`boss.az` was removed: it now renders its listing client-side from a private API,
so neither `/vacancies` nor `/vacancies/new` returns job data to a plain fetch.

## Matching

A vacancy is sent only when its title carries **every** idea the saved field
carries, in any language. The pieces live in `src/matching`:

- `lexicon.ts` — concepts (`teacher`, `music`, `backend`, …), each listing its
  Azerbaijani, English and Russian spellings, plus the soft words (seniority,
  employment type, cities, boilerplate) that never decide a match.
- `analyze.ts` — turns a title or a saved field into the concepts it carries,
  stripping Azerbaijani suffixes (`müəllimlərinə` → `müəllim`) and reading
  multi-word terms (`ingilis dili`, `call center`) as single ideas.
- `match.ts` — requires every concept of the field to be present in the title,
  and scores tighter titles higher.

The rule is one-directional: a title may add ideas but never drop one.

- `music teacher` → `Musiqi müəllimi`, `Music Teacher`, `Piano müəllimi`
- `music teacher` ✗ `Fizika müəllimi` (shares `teacher`, has no `music`)
- `backend developer` → `Java Developer` (`java` implies `backend`)
- `backend developer` ✗ `Frontend Developer`
- `müəllim` → every teacher, because no subject was asked for

## Deploy

```sh
npm run deploy
npm run set-webhook -- https://<your-worker>.workers.dev
```

Current deployed Worker URL:

```text
https://vakansiya-bot.polyana-eam.workers.dev
```

## Smoke Test

In Telegram, open the bot and run:

```text
/start
/ixtisas musiqi müəllimi
/ixtisaslar
/axtar
```

Expected result: `/axtar` replies that the search started, then sends every open vacancy
that matches (up to 60, tightest match first), or says that nothing matched. The hourly
cron sends only vacancies that have not been delivered to that user before.

## Operations

The Worker logs structured JSON events:

- `scraper_complete`
- `scraper_failed`
- `pipeline_complete`
- `pipeline_failed`
- `bot_error`

Use:

```sh
npm run tail
```

Cron is configured for `7 * * * *`. Old sent-vacancy fingerprints are pruned daily during the Baku-local 03:xx run.
