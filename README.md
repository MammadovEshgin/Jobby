# vakansiya-bot

Telegram bot that aggregates Azerbaijani job vacancies hourly and notifies users based on their subscribed fields. It runs on Cloudflare Workers with TypeScript, grammY, D1, Cron Triggers, and static HTML scraping.

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

Working scrapers:

- `boss.az` (first 3 listing pages)
- `hellojob.az` (first 3 listing pages)
- `jobsearch.az`
- `smartjob.az`
- `jobs.glorri.az`

Skipped sources are documented in `progress.md`.

Search breadth:

- `Dar` (`strict`) only sends exact title matches.
- `Normal` matches title tokens and synonyms.
- `Geniş` also searches company, location, and description-like text when a scraper provides it.

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
/ixtisas backend developer
/ixtisaslar
/genislik
/axtar
```

Expected result: `/axtar` replies that search started, then sends a vacancy batch if new matching jobs are found, or says that no new matching vacancy was found.

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
