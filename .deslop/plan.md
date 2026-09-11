# Deslop plan

Branch `deslop/2026-09-11` from `master` @ `4b79f80` · check: `npm run check` · baseline 86/86 · complexity max 11 · erosion 6% · 273 functions
Excluded: `node_modules/`, `.wrangler/`, `.claude/`, `package-lock.json`, `tests/fixtures/` (recorded responses), `schema.sql`, `wrangler.toml`, `assets/`
Flags: audit on · structure on

Preflight cleared 2026-09-11: setup committed as `4b79f80`, branch `deslop/2026-09-11` created
from `master`. Baseline re-measured on the branch: check **pass** · 86/86 tests · 11 lint warnings
(the ratcheted `eslint-plugin-security` findings) · complexity max 11 · erosion 6%.

## Slices

| # | Slice | Files | Lines | CC max | Churn | Entry points | Tests | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | `src/scrapers` + `tests/scrapers` | 17 | 891 | 11 | 25 | 7 | direct (7/10 files) | done 6a52c7a · fix 6ad840e · net -71 src · CC max 11 → 10 · tests 14 → 58 |
| 2 | `src/matching` + `tests/match,normalize` | 6 | 1,355 | 6 | 8 | 0 | direct + strong (56) | done dc4c529 · fix 5f5b30a · net +2 prod · CC 6 → 6 · tests 56 → 71 |
| 3 | `src/pipeline` + `tests/pipeline,format` | 4 | 624 | 8 | 9 | 0 | direct (13) | done b02d51e · fix ac2dffa · net +5 prod · CC 8 → 7 · tests 13 → 28 |
| 4 | `src/commands` | 7 | 216 | 7 | 12 | 7 | none | done PENDING5 · net -2 prod · tests 0 → 33 |
| 5 | `src/db` | 4 | 411 | 5 | 8 | 1 | none | pending |
| 6 | `src/utils` + `scripts` + `tests/fingerprint` | 5 | 211 | 7 | 6 | 0 | partial (1/3) | pending |
| 7 | `src/bot.ts` + `src/index.ts` | 2 | 149 | 4 | 6 | 2 | none | pending |
| 8 | `README.md`, `AGENTS.md`, `CODING_STANDARDS.md` | 3 | 298 | n/a | — | 0 | n/a | pending |

## Why this order

Tier 1 — has tests, leaf module, highest value. **Slice 1** carries every hotspot in the repo
(all three functions over budget, erosion 22% against 6% repo-wide), the most churn (25), and seven
untrusted-input entry points. It is imported only by `src/pipeline`, so it is safe to reshape first.
**Slice 2** has the strongest test lock in the repo (56 assertions) and is a leaf behind `match.ts`;
`lexicon.ts` is 756 lines of vocabulary data, so expect pass 11 (docs) and pass 2 (comments) to
dominate and pass 8 (hotspots) to be empty.

Tier 2 — has tests, but consumes the tiers above. **Slice 3** orchestrates the hourly run and imports
db, matching, scrapers and utils; cleaning it after its dependencies means its seams are already
settled.

Tier 3 — no test signal, so rule 1 applies: characterization tests at the public interface come
first, or the slice is reported untestable rather than cleaned. **Slice 4** goes first of these on
churn (12, the highest outside slice 1) and because all seven commands parse raw user message text.
**Slice 5** holds the only other untrusted sink (`manual-search.ts` takes user search terms into D1).

Tier 4 — shared and core, last, so everything cleaned above already uses their interfaces.
**Slice 6** merges three tiny siblings (`utils` 3 files, `scripts` 1 file) per the merge rule.
**Slice 7** is the Worker entry layer and the repo's most security-sensitive surface (webhook secret
check, `scheduled` fan-out); it is audited with everything beneath it already clean.

**Slice 8** is the docs slice, last by rule.

## Judgment calls

- **Slice 1 is 17 files, over the ~15 guideline.** Kept whole: it is 891 lines (well under the 1,500
  line limit) and splitting it would cut the module's shared seam (`index.ts`, `types.ts`,
  `dedupe.ts`) away from the seven parsers that use it, which is exactly the context a worker needs.
- **`tests/fixtures/` is excluded** as recorded responses. Pass 10 may still judge whether a fixture
  earns its place; it must not rewrite fixture bodies to make a test pass (hard rule 7).
- **`src/matching/lexicon.ts` has `max-lines` disabled** in `eslint.config.mjs` — it is a data table
  with zero functions. A worker must not "fix" it by splitting the word list.
- **Indirect coverage:** `analyze.ts`, `lexicon.ts` and `normalize.ts` are exercised through
  `match.test.ts`, not directly. `dedupe.ts` is used only on the fetch path, which no test enters —
  treat it as untested in slice 1.
- **Two ratchets are open** in `CODING_STANDARDS.md` (complexity ceiling 11 → target 10; lint
  `--max-warnings 11` → target 0). Slice 1 pass 8 should close the complexity ratchet. The eleven
  `eslint-plugin-security` warnings are the audit's candidate list, spread over slices 1, 2 and 4.

## Untested files (rule 1 applies before any cleanup)

`bot.ts`, `index.ts`, `commands/*` (7), `db/*` (4), `scrapers/dedupe.ts`, `scrapers/index.ts`,
`utils/fetch.ts`, `utils/log.ts`, `scripts/set-webhook.ts`

## Found, not changed

<!-- appended per slice as the run proceeds -->

### Slice 1 — found, not changed (from the worker)

- `src/scrapers/busy-az.ts:44`, `glorri-az.ts:69` — **behaviour changed on purpose.** Both parsers
  threw `TypeError` on the literal body `null`, violating the never-throw contract. The typed JSON
  boundary returns `[]` instead; `tests/scrapers/contract.test.ts` locks it for all seven parsers.
  Audit candidate.
- The three `security/detect-object-injection` findings in this slice are **gone, not suppressed** —
  they were `urls[index]` re-derivations inside the duplicated fan-outs. CODING_STANDARDS.md line
  references are now stale (that file is outside the slice).
- `src/scrapers/glorri-az.ts:31-56` — the one fan-out left un-merged; routing it through
  `fetchListingPages` would change operator-visible log output from an aggregate to per-page lines.
  Needs a decision.
- `src/scrapers/glorri-az.ts:48` — unreachable else branch, type-required today; disappears with the
  item above.
- `busy-az.ts:69` (`cityName`) and `glorri-az.ts:72` (`parseGlorriAzVacancies`) sit exactly at CC 10.
- `timeoutMs: 10_000` repeated in jobsearch-az, smartjob-az, vakansiya-az equals `fetchText`'s own
  `DEFAULT_TIMEOUT_MS` — three copies of a default.
- `tests/fixtures/hellojob-az.html` has no duplicate links, so hellojob's parse-level dedupe is
  covered by an inline test rather than the fixture.

### Slice 1 — audit findings

Fixed (behaviour changed, each proven red-first):
- `busy-az.ts:48`, `glorri-az.ts:76` — a 200 body of well-formed JSON whose listing field is not a
  list of job objects (`{"vacancies":5}`, `[null]`, `[7]`, numeric `job_title`) threw `TypeError`.
  For busy.az one such page discarded every other page, because `bodies.flatMap` unwinds. Fixed by
  `jsonList` in `json.ts` and a type guard in `cleanText`.
- `hellojob-az.ts:35`, `smartjob-az.ts:46`, `vakansiya-az.ts:33`, `vakansiya-biz.ts:43` — an anchor
  whose `href` is not a resolvable URL (`//`, `https://[`, a raw space) threw `TypeError: Invalid
  URL`, losing every other card on the page and, for multi-page boards, every other page. Fixed by
  `vacancyUrl` in the new `url.ts`.

Reported, not fixed:
- `glorri-az.ts:50-52` — else arm confirmed unreachable; dead code belongs to /deslop, not a fix.
- `pages.ts:38-40` — empty `urls` would report a config mistake as a board outage; no caller can
  produce it (all three pass module-level constants).
- `busy-az.ts:60` — busy.az is the only parser building its URL by concatenation, so a slug with a
  raw space or newline survives into the Telegram `<a href>`; needs a live sendMessage to confirm.
- `src/utils/fetch.ts:24-33` — three retries with no backoff, retrying non-retryable statuses; a
  steady 403 costs three requests and the 10 s timeout is per attempt. Out of scope (slice 6).
- `CODING_STANDARDS.md:61-71` — the ratchet and the three detect-object-injection entries are stale;
  in-slice eslint is now 0, repo-wide 8. Orchestrator closes this at the end of the run.

### Slice 2 — found, not changed (from the worker)

- `lexicon.ts` — `kind` on all 157 concepts, and `ConceptKind` behind it, are never read. Removal is
  behaviour-free, but Prettier then reflows ~1400 lines of the vocabulary table, which no reviewer
  can eyeball for vocabulary drift inside a refactor commit. Needs its own commit.
- `match.ts:51` — `matchTitle` has no production caller; it exists for the 65-test lock. Kept
  deliberately: deleting it means rewriting every test for no gain.
- `analyze.ts:260` — the `includes` dedup in `addConceptId` is an equivalent mutant; it only stops
  duplicate lexicon entries growing an array. Kept, untested.
- `analyze.ts:137` — the phrase-tie tiebreak has no pair in the lexicon that reaches it; mutant
  survives with no behaviour to lock.
- `normalize.ts:1-21` — `DIACRITICS` and the regex class are kept in sync by hand. Deriving one from
  the other needs `new RegExp`, which adds a `detect-non-literal-regexp` warning. Needs a decision.
- Probes 12/14: the two survivors are the two equivalent mutants above, both documented.

### Slice 2 — audit findings

Fixed (behaviour changed, each proven red-first):
- `match.ts:42` — **high.** A title carrying 21+ concepts the field does not (the aggregated
  `Satici, kassir, surucu, ... musiqi muellimi teleb olunur` listing, routine on these boards) scores
  negative, and `matchCompiled` compared `result.score > best.score` against a `NO_MATCH` sentinel of
  score 0, so a real match was thrown away as unmatched. Silent false negative: the user never sees
  the job. Now `!best.matched || result.score > best.score`.
- `normalize.ts:19` — a title whose letters arrive decomposed (NFD: `u` + U+0308 instead of `ü`) lost
  the combining mark as punctuation and split the word in two, so the NFD form of a title failed
  where the NFC form matched. `.normalize("NFC")` added. Same `normalize` backs `utils/fingerprint`,
  so NFD/NFC duplicates of one vacancy now collapse as well.

Reported, needs a decision (all three are vocabulary or contract calls, not code bugs):
- **`lexicon.ts` `dotnet` term `"c#"`** — `normalize("c#") === "c"`, so the index holds a one-letter
  term. `matchTitle("Surucu (B, C kateqoriyali)", "C#")` matches with score 848; so does
  `"Hepatit C uzre hekim"`. Mirror image: `"Surucu"` vs field `"surucu c"` is false while
  `"surucu b"` is true, contradicting the `ignores stray single letters` test. Fix is either
  dropping the term or keeping `#`/`+` in `normalize` — both change matching vocabulary.
- `normalize.ts:23` — invisible characters (soft hyphen U+00AD, ZWSP, ZWNJ) act as word separators,
  so `"Musiqi mu<shy>ellimi"` misses `music teacher`. Ruling that a zero-width space never separates
  words is a contract change.
- `normalize.ts:23` — full-width forms (`Ｍｕｓｉｃ`) match nothing; NFKC would fold them but also
  rewrites `1/2`, `No.` and ligatures across every title and field.

Assessed and dismissed: all six `eslint-plugin-security` findings in this slice are noise. The four
`detect-object-injection` in `analyze.ts` are `tokens[index]` reads with a counter the function
advances; `detect-possible-timing-attacks` compares two job-title words with no secret in the module;
`normalize.ts` was proven safe by enumerating the regex class against `DIACRITICS` keys at runtime
(empty difference, so no prototype key is reachable).

The three guards slice 2 removed were each verified unreachable rather than assumed: the diacritics
fallback by the same enumeration, `normalize`-in-`tokenize` by brute-forcing idempotence over every
Unicode code point, and the empty-token check by showing both requirement kinds are unsatisfiable
when a title has no tokens.

Unbounded work measured, no finding: `analyze` is linear (400k-char title 66ms); worst realistic
pipeline shape (50 users x 20 fields x 2000 candidates) is 107ms.

### Slice 3 — found, not changed (from the worker)

- `tests/pipeline.test.ts:11` — `vi.mock("../src/scrapers")` mocks an own module instead of
  injecting the seam. Fixing it means `runPipeline`/`runManualSearch` taking the scraper as a
  parameter, changing signatures used by `src/index.ts` and `src/commands/axtar.ts`. Proposal.
- `run.ts:27` — `PipelineResult.truncated` is only ever true on the manual path; the hourly run
  always reports `false`. Separating the result types ripples into `axtar.ts:53`. Proposal.
- `run.ts:132` — `deliver` serves two jobs: broadcast to every user, and reply to exactly one
  (`/axtar` passes a single-user list). `messagesSent` and `truncated` mean different things in
  each. Proposal.
- `run.ts:218` — the pipeline hand-rolls the Telegram `sendMessage` call while the rest of the bot
  uses grammY. Endpoint, HTML parse mode and retry rule are encoded twice. The `scheduled` handler
  has no bot instance, which explains it. Out of scope here; candidate for slice 7.
- `runPipeline({ pruneOld: true })` (the 3am branch) has no test: the fake D1 could only observe it
  by matching SQL text, which would couple the test to the statement. Left untested deliberately.

### Slice 3 — audit findings

Fixed (6, each proven red-first):
- `format.ts:67` **security** — a scraped `url` of `javascript:alert(...)` survived `scrapers/url.ts`
  (`new URL('javascript:…', base)` keeps the scheme) and reached the delivered
  `<a href="javascript:…">`. Now only an http(s) URL becomes a link (allowlist, not blocklist).
- `format.ts:32` — a 4023-char scraped URL (busy.az interpolates `slug` unbounded) produced a
  ~20,000-char message; Telegram answers 400, the throw drops that user's whole batch, and nothing
  is fingerprinted so it repeats every hour. URLs over 300 chars no longer become links.
- `run.ts:203` — when a batch spans three messages and Telegram rejects the second, the first
  message's vacancies were delivered but never recorded, so the next run sent them again.
  `formatVacancyMessages` now returns `{ text, vacancyCount }` and `deliver` records exactly the
  prefix that landed.
- `run.ts:203` — a D1 failure writing `sent_vacancies` for one user escaped `deliver` and
  `runPipeline`, so every later user got nothing that hour.
- `run.ts:60` — a D1 failure writing `vacancy_snapshot` threw before delivery, so a successful
  scrape delivered nothing.
- `run.ts:54` — a D1 failure on the nightly prune threw before scraping. This is also the first test
  to enter the `pruneOld: true` branch, and it asserts behaviour rather than SQL text.

**Reported, needs a decision — data integrity, and it re-sends vacancies:**
- `src/db/vacancies.ts:49` reached from `run.ts:123` — a vacancy a board keeps listing for more than
  60 days has its `sent_vacancies` row pruned (`first_seen` is fixed at first delivery) while
  `vacancy_snapshot.seen_at` is refreshed hourly, so the next run delivers it to the same user a
  second time. Fix belongs in `src/db` (slice 5): either prune only fingerprints absent from
  `vacancy_snapshot`, or refresh `first_seen` on each sighting.

Reported, not fixed:
- `run.ts:274` — the hand-rolled Telegram `fetch` has no timeout or `AbortSignal`; one hung
  connection stalls the hourly run for every user behind it. Belongs with the grammY consolidation.
- `format.ts:79` — a scraped URL with a raw space reaches the `href` verbatim; the fix validates
  with `new URL()` but renders the original string. Normalising would change an existing assertion
  and needs the live Bot API to settle.

Trade-off accepted: under a persistent D1 write outage the run now repeats a user's batch hourly
instead of stopping at the first user. That user was already going to see the duplicate, and
everyone behind them now gets delivered.

### Slice 4 — found, not changed (from the worker)

- The `ctx.from === undefined` guard and its reply string are copy-pasted in six command files. The
  real fix is one grammY middleware in `src/bot.ts`, outside this slice — proposal for slice 7.
  A shared constant alone would dedupe the string but leave six identical branches, so the
  half-measure was declined.
- `sil.ts:19` vs `ixtisas.ts:21` — `/ixtisas ***` is rejected with a message, but `/sil ***` queries
  D1 with an empty field. Characterized as-is; harmless today, but an asymmetry the audit should
  rule on since fixing it changes behaviour.
- `argument.ts:3` — the `detect-non-literal-regexp` warning moved here and is now one instead of
  two. Not suppressed.
- `axtar.ts:40` — `search()` takes the whole `BotContext` but needs only `ctx.env` and `ctx.api`.
- `README.md:54-59` — the command table omits `/komek`, which the bot's own help text advertises.
- Untestable: none. All seven command files reached the seam.
