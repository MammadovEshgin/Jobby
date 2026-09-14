# Coding Standards

Rules for this repo that differ from the `clean-code` skill's defaults, plus rules that came from
real mistakes. Where this file is silent, the skill applies. Every line here is loaded into every
review, so keep it short and delete lines once tooling enforces them.

## Stack

- Language and runtime: TypeScript on Cloudflare Workers (`wrangler`), D1 for storage, grammY for
  the Telegram bot. Node 20+ for the tooling only.
- Formatter: Prettier (`npm run format`; runs automatically on every edit, never hand-format)
- Linter: ESLint flat config (complexity 10, depth 3, params 4, typed `no-unsafe-*`, dead code,
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
- Console output is one JSON object per line, through `src/utils/log.ts` (`logInfo` / `logError`).
  `console.log` is linted out everywhere else; `warn` and `error` are allowed.
- A failing bot handler is caught in `src/index.ts`, logged as `bot_error`, and answered 200.
  grammY never calls `bot.catch` under a webhook, so do not rely on it.
- Lexicon terms are stored in their shortest canonical form. Azerbaijani is agglutinative and the
  analyzer strips suffixes by walking prefixes, so an inflected entry is unreachable.
- Precision beats recall: a vacancy offered to a user who follows nothing like it is a bug, not a
  threshold to tune. Fix it with a failing test that locks the property (see the technology versus
  non-technology sweep in `tests/matching/match.test.ts`), not only the reported title.
- `fingerprint()` output is stored in D1 as the identity of every delivered vacancy. Changing it by
  one byte re-sends everything to everyone; `tests/utils/fingerprint.test.ts` holds golden hashes.

## Boundaries

- Untrusted input enters at two places: scraped HTML/JSON from the job boards, and Telegram webhook
  updates. Both are parsed into typed shapes before anything else touches them.
- Database: D1 prepared statements with bound parameters only (`db.prepare(sql).bind(...)`); no
  string-built SQL.
- The webhook is authenticated by `WEBHOOK_SECRET` via grammY's `secretToken`; no handler runs
  before that check.
- Secrets (`BOT_TOKEN`, `WEBHOOK_SECRET`) arrive through the Worker `Env` binding. Nothing reads
  `process.env` outside `scripts/`.
- Only an `http:` or `https:` URL from a board becomes a link in a delivered message.
- An inline button that changes a user's data carries its owner's id; a press from anyone else
  changes nothing.

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

- lint warnings: `--max-warnings 7`, target 0. These are the pre-existing `eslint-plugin-security`
  findings below. Lower the number as each is closed; never raise it.

## Pre-existing security findings

Listed for `/audit`, not suppressed. Each was assessed as noise during the 2026-09 cleanup; the
lint gate holds the count so no new one can appear.

- `security/detect-object-injection` (5): `src/matching/analyze.ts:53,57,58,132` read an array at a
  counter the function itself advances; `src/matching/normalize.ts:37` reads a diacritics map whose
  keys were enumerated against its regex class, so no prototype key is reachable.
- `security/detect-non-literal-regexp` (1): `src/commands/argument.ts:3` builds the pattern from a
  hardcoded command name; it has no nested quantifier, so it cannot backtrack badly.
- `security/detect-possible-timing-attacks` (1): `src/matching/analyze.ts:76` compares two
  job-title words; no secret is involved.

## Rules from mistakes

- 2026-09-11: `Response.json()` in workers-types is generic. Write `await response.json<T>()`, not
  `(await response.json()) as T` — the assertion is a no-op the linter rejects.
- 2026-09-11: `export` only what another module imports; `npm run knip` catches the rest.
- 2026-09-11: The `scheduled` handler must not be `async` when its body only calls
  `ctx.waitUntil()` — awaiting nothing while claiming a Promise return hides the fire-and-forget.
- 2026-09-11: Punctuation can be the name. Stripping it turned `c#` into the letter `c`, and every
  title with a stray C matched users following C#. `normalize` folds `c#`, `c++` and `f#` first.
- 2026-09-11: Check-then-write across two D1 round trips is a race. Enforce a limit inside one
  conditional write (`claimManualSearch`), and delete the separate write so it cannot be rebuilt.
