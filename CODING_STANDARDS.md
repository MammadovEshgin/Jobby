# Coding Standards

Rules for this repo that differ from the `clean-code` skill's defaults, plus rules that came from
real mistakes. Where this file is silent, the skill applies. Every line here is loaded into every
review, so keep it short and delete lines once tooling enforces them.

## Stack

- Language and runtime: TypeScript on Cloudflare Workers (`wrangler`), D1 for storage, grammY for
  the Telegram bot. Node 20+ for the tooling only.
- Formatter: Prettier (`npm run format`; runs automatically on every edit, never hand-format)
- Linter: ESLint flat config (complexity 11, depth 3, params 4, typed `no-unsafe-*`, dead code,
  `eslint-plugin-security`; see `eslint.config.mjs` and `eslint.clean-code.mjs`)
- Typecheck: `tsc --noEmit` over `tsconfig.json` (src + tests) and `scripts/tsconfig.json`
- Tests: Vitest (`npm test`), parser tests drive real fixture HTML/JSON from `tests/fixtures/`
- Dead code: `npx knip` (unused files, exports, dependencies)
- Check everything: `npm run check` (run before calling any change done)
- Fast gates: `npm run check:fast` (lint and typecheck; the stop hook runs this)

## Conventions that differ from the skill

- Scrapers are parse-only: every `parse<Source>Vacancies` takes a response body string and returns
  `RawVacancy[]`. Fetching lives in `fetchText`, so parsers stay synchronous and testable.
- A scraper never throws on bad input. Unparseable or non-matching markup returns `[]`; one dead
  source must not take the hourly run down with it.
- Console output is one JSON object per line. Prefer `src/utils/log.ts` (`logInfo` / `logError`);
  `bot.catch` in `src/bot.ts` builds its own because it also records the stack. `console.log` is
  linted out everywhere except `src/utils/log.ts`; `warn` and `error` are allowed.
- Lexicon terms are stored in their shortest canonical form. Azerbaijani is agglutinative and the
  analyzer strips suffixes by walking prefixes, so an inflected entry is unreachable.

## Boundaries

- Untrusted input enters at two places: scraped HTML/JSON from the job boards, and Telegram webhook
  updates. Both are parsed into typed shapes before anything else touches them.
- Database: D1 prepared statements with bound parameters only (`db.prepare(sql).bind(...)`); no
  string-built SQL.
- The webhook is authenticated by `WEBHOOK_SECRET` via grammY's `secretToken`; no handler runs
  before that check.
- Secrets (`BOT_TOKEN`, `WEBHOOK_SECRET`) arrive through the Worker `Env` binding. Nothing reads
  `process.env` outside `scripts/`.

## Layout

`src/index.ts` is the only Worker entry point: it wires the `fetch` handler to the grammY bot and
the `scheduled` handler to the hourly pipeline. `src/commands/` holds one file per Telegram command,
`src/scrapers/` one file per job board plus `index.ts` as the fan-out, `src/matching/` the concept
lexicon and the matcher, `src/db/` the D1 queries, `src/pipeline/` the hourly run and message
formatting, `src/utils/` fetch, fingerprinting and logging. Tests mirror `src/` under `tests/`, with
recorded responses in `tests/fixtures/`. `scripts/` holds one-off operator tooling and has its own
tsconfig (Node types, not Workers types).

## Ratchets

Thresholds temporarily above the skill's budget. Delete the line when the target is reached.

- complexity: ceiling 11, target 10. Three parsers sit at 11 — `parseJobSearchAzVacancies`
  (`src/scrapers/jobsearch-az.ts:25`), `parseSmartJobAzVacancies` (`src/scrapers/smartjob-az.ts:42`),
  `parseVakansiyaAzVacancies` (`src/scrapers/vakansiya-az.ts:26`). Each is one field-extraction
  chain; splitting the field guards out drops them under 10.
- lint warnings: `--max-warnings 11`, target 0. These are the pre-existing
  `eslint-plugin-security` findings below. Lower the number as each is closed; never raise it.

## Pre-existing security findings

Listed for `/audit`, not suppressed. The lint gate holds the count at 11 so no new one can appear.

- `security/detect-object-injection` (7): `src/matching/analyze.ts:51,55,56,122`,
  `src/matching/normalize.ts:21`, `src/scrapers/busy-az.ts:54`, `src/scrapers/hellojob-az.ts:41`,
  `src/scrapers/vakansiya-biz.ts:42`. Each is an array or record read keyed by a loop counter or an
  internal id, not by user input — but the rule cannot see that, so confirm before closing.
- `security/detect-non-literal-regexp` (2): `src/commands/ixtisas.ts:41`, `src/commands/sil.ts:25`.
  The pattern is built from a hardcoded command name, not from the message text.
- `security/detect-possible-timing-attacks` (1): `src/matching/analyze.ts:74`. A word-equality
  check in the matcher; no secret is involved.

## Rules from mistakes

- 2026-09-11: `Response.json()` in workers-types is generic. Write `await response.json<T>()`, not
  `(await response.json()) as T` — the assertion is a no-op the linter rejects.
- 2026-09-11: `export` only what another module imports. Three exports (`conceptKind`,
  `SNAPSHOT_MAX_AGE_SECONDS`, `scrapers`) had no caller outside their own file; `npm run knip`
  catches this.
- 2026-09-11: The `scheduled` handler must not be `async` when its body only calls
  `ctx.waitUntil()` — awaiting nothing while claiming a Promise return hides the fire-and-forget.
