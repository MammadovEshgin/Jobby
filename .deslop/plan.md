# Deslop plan

Branch `deslop/2026-09-11` from `master` @ `4b79f80` · check: `npm run check` · baseline 86/86 · complexity max 11 · erosion 6% · 273 functions
Excluded: `node_modules/`, `.wrangler/`, `.claude/`, `package-lock.json`, `tests/fixtures/` (recorded responses), `schema.sql`, `wrangler.toml`, `assets/`
Flags: audit on · structure on

Preflight cleared 2026-09-11: setup committed as `4b79f80`, branch `deslop/2026-09-11` created
from `master`. Baseline re-measured on the branch: check **pass** · 86/86 tests · 11 lint warnings
(the ratcheted `eslint-plugin-security` findings) · complexity max 11 · erosion 6%.

## Resume here (paused 2026-09-11)

Branch `deslop/2026-09-11`, 9 commits ahead of `master`. Working tree clean, `npm run check` green,
282/282 tests. Nothing is half-finished: the slice 5 audit worker was stopped before it wrote
anything, so slice 5's audit is simply not yet run.

Next command: `/clean-code:deslop repo` — it re-reads this file and picks up at the first row that
is not `done`.

Order of remaining work:
1. **Slice 5 audit** (not run). Three fixes are specified and already have characterization tests
   locking the wrong behaviour, so each fix turns a named test red:
   - `vacancies.ts:51` re-delivers a vacancy a board lists for over 60 days
     (test: "forgets a delivery for a vacancy the board is still listing")
   - `manual-search.ts` cooldown is check-then-act, so two concurrent `/axtar` both pass
     (test: "lets two overlapping searches through")
   - `snapshot.ts:102` has no non-negative-days guard; a negative window deletes every row
     (test: "empties the table when the window is negative")
2. **Slice 6** `src/utils` + `scripts` + `tests/fingerprint` — carries the queued finding that
   `utils/fetch.ts:24-33` retries three times with no backoff and retries non-retryable statuses;
   the 10 s timeout is per attempt, so one dead URL holds a scraper 30 s.
3. **Slice 7** `src/bot.ts` + `src/index.ts` — the highest-value slice left. Two confirmed bugs:
   the fail-open `bot.catch` (HIGH) and the group callback-data ownership hole (A01). Also where
   the six duplicated `ctx.from` guards become one middleware, and where the hand-rolled Telegram
   sender can join grammY.
4. **Slice 8** docs.
5. **Structure phase**, then Finish.

### Owed to the user before the run ends

Decisions that need their words or their product call, batched deliberately rather than guessed:
- A cap on followed fields per user, and a max field length (`/ixtisas` currently unbounded).
- Chunking or capping `/ixtisaslar` so a long list cannot exceed Telegram's 4096 limit.
- What `/axtar` should do for a user who has sent `/stop` (currently: burns the cooldown, searches,
  returns nothing, and on an empty snapshot drives a full live scrape every 10 seconds).
- `komek.ts:12` promises "bütün" (all) matching vacancies; the code caps at 60.

Orchestrator tasks for the Finish phase, not owned by any slice:
- `CODING_STANDARDS.md` pre-existing-findings list is stale (says 11 warnings, repo has 7) and
  `package.json`'s `--max-warnings 11` is 4 looser than reality.
- The complexity ratchet can close: `eslint.clean-code.mjs` is at `max: 11`, repo max is now 10.
- `lexicon.ts` `kind` is read only by the trust sweep in `tests/match.test.ts`; the earlier
  proposal to delete it as dead is now void.
- `README.md` command table omits `/komek`.

## Slices

| # | Slice | Files | Lines | CC max | Churn | Entry points | Tests | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | `src/scrapers` + `tests/scrapers` | 17 | 891 | 11 | 25 | 7 | direct (7/10 files) | done 6a52c7a · fix 6ad840e · net -71 src · CC max 11 → 10 · tests 14 → 58 |
| 2 | `src/matching` + `tests/match,normalize` | 6 | 1,355 | 6 | 8 | 0 | direct + strong (56) | done dc4c529 · fix 5f5b30a · net +2 prod · CC 6 → 6 · tests 56 → 71 |
| 3 | `src/pipeline` + `tests/pipeline,format` | 4 | 624 | 8 | 9 | 0 | direct (13) | done b02d51e · fix ac2dffa · net +5 prod · CC 8 → 7 · tests 13 → 28 |
| 4 | `src/commands` | 7 | 216 | 7 | 12 | 7 | none | done 2c45ffb · fix none (0 provable in scope) · net -2 prod · tests 0 → 33 |
| 5 | `src/db` | 4 | 411 | 5 | 8 | 1 | none | done 4370349 · fix 77eaf30 + c915667 · net -8 prod · tests 0 → 66 |
| 6 | `src/utils` + `scripts` + `tests/fingerprint` | 5 | 211 | 7 | 6 | 0 | partial (1/3) | done c4f3028 · fix 647e5ae · net -57 prod · CC 7 → 6 · tests 3 → 42 |
| 7 | `src/bot.ts` + `src/index.ts` | 2 | 149 | 4 | 6 | 2 | none | done a9ea89f · fix PENDING11 · CC 5 → 4 · tests 0 → 42 |
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

### Slice 4 — audit findings (0 fixed: every fix needed a new string, a product decision, or an
edit outside the slice)

**HIGH — `src/bot.ts:61`, fail-open error boundary. Fix in slice 7.**
`bot.catch` never runs under `webhookCallback`: grammY awaits `bot.handleUpdate` with no catch, and
only the long-polling `handleUpdates` consults `errorHandler`. So ANY handler rejection escapes to
`src/index.ts:31`, the Worker `fetch` rejects, Cloudflare answers 500, and Telegram redelivers the
update forever. Reproduced with a probe. Every finding below inherits its blast radius from this
one. Fix: `bot.errorBoundary` in `bot.ts`, or a try/catch in `index.ts`.

Needs a decision (each requires a new Azerbaijani string or a product limit):
- `ixtisaslar.ts:18` — a user with enough fields overflows Telegram's 4096 limit (1024 one-char
  fields, or 100 forty-char ones). The reply rejects, and via the bug above every `/ixtisaslar` from
  that user 500s and redelivers: they are locked out of their own list and the delete keyboard.
- `ixtisas.ts:37` — `/ixtisas <4035+ chars>`: `upsertUser` and `addField` land, THEN the echo reply
  rejects, so the field is stored with no confirmation and the redelivered update repeats both
  writes.
- `ixtisas.ts:31` — no per-user field cap and no max field length. One account can store unbounded
  `user_fields` rows, which are then recompiled and matched on every hourly run forever.
- `axtar.ts:15` — a user who sent `/stop` still passes the `fields.length` check, burns the
  cooldown, and runs a full search that returns nothing (`listActiveUsersWithFields` filters
  `is_active = 1`). When `vacancy_snapshot` is empty this falls through to a full live scrape of
  every board, so a deactivated account can drive one every 10 seconds with guaranteed zero output.
- `axtar.ts:45` — the notice `sendMessage` calls sit inside the try guarding `runManualSearch`, so a
  403 or 429 on the notice reports a search that COMPLETED as `manual_search_failed`.

Out of scope, for later slices:
- `axtar.ts:22` — `checkManualSearchLimit` and `recordManualSearch` are check-then-act with no
  atomicity; two interleaved `/axtar` both pass the cooldown. Fix is a conditional write in
  `src/db/manual-search.ts` (slice 5).
- `axtar.ts:31` — `recordManualSearch` lands before the ack; if the ack fails the search never
  starts but the cooldown is consumed.
- `bot.ts:41` — **A01.** `delete_field:<field>` callback data carries no owner id. `/ixtisaslar` in
  a group posts that keyboard; any member pressing a button deletes their OWN identically-named
  field and overwrites the requester's message. Slice 7.

Rulings requested and given:
- `/sil ***` empty-field query is **harmless**: `field` can never be `''` in `user_fields` (three
  writers all reject it), the DELETE is parameterised and scoped by `telegram_id`, matches 0 rows,
  and the reply is truthful. Cost is one wasted D1 write.
- The six `ctx.from` guards are **correct and complete**. `/komek` is the only command without one
  and the only one that never reads `ctx.from`. grammY dispatches `bot.command` only for `message`
  and `channel_post`; channel posts carry no `from`, which is exactly the guarded case.
- `argument.ts:3` `detect-non-literal-regexp` is **noise**: `command` is a string literal at both
  call sites, the pattern has no nested quantifier or alternation so it cannot ReDoS. Worth noting
  separately: grammY already computes this argument into `ctx.match`, so the helper is redundant
  with the framework.

Documentation drift confirmed independently by two workers:
- `CODING_STANDARDS.md:64-75` lists 11 pre-existing warnings; the repo has **7**. `--max-warnings 11`
  is 4 looser than reality and would silently admit four new warnings.
- `komek.ts:12` tells users `/axtar` returns "bütün" (all) matching vacancies; `runManualSearch`
  caps at 60. The same help list omits `/komek` itself.

### Slice 5 — found, not changed (from the worker)

- `vacancies.ts:51` and `manual-search.ts` — the two queued defects were LOCKED, not cleaned away.
  "forgets a delivery for a vacancy the board is still listing" and "lets two overlapping searches
  through" assert the current (wrong) outcome, so the audit's fix will turn them red.
- `snapshot.ts:102` `pruneSnapshotOlderThan` has no non-negative-days guard where `pruneOlderThan`
  does; a negative window puts the cutoff in the future and deletes every row. Locked as-is.
- **Untestable with this harness: the SQL text itself.** The fake D1 models each predicate rather
  than executing SQL, so a mutation inside a WHERE / ORDER BY / ON CONFLICT clause is invisible —
  that is the one surviving probe (`first_seen < ?` -> `<= ?`). Logic, bound parameters and row
  mapping are covered; the statements are not. Closing it needs a real D1 in the harness
  (`@cloudflare/vitest-pool-workers`), a harness change outside this slice. Every SQL literal was
  therefore left untouched, per hard rule 1.
- `snapshot.ts:41` — `ON CONFLICT` deliberately does not update `title`, `company` or `source`: the
  fingerprint derives from title+company so they cannot drift. Looks like an omission, is not.
- Proposal: `setActive(db, id, false)` is a boolean flag parameter; `activateUser` /
  `deactivateUser` would read better, but both call sites are outside the slice.
- Proposal: `pruneSnapshotOlderThan` carries a redundant qualifier, kept only because `run.ts`
  imports both prunes unqualified into one file.
- `UpsertUserInput`, `AddFieldInput`, `MarkSentInput`, `ManualSearchLimit` are exported with no
  outside importer, but each names a parameter or return type of an exported function, so
  un-exporting would make those signatures unnameable. Kept deliberately.

### Slice 5 — audit findings

Fixed (3, each proven red-first; the SQL predicates were additionally run on a real local D1,
Miniflare/workerd SQLite, because the fake D1 cannot see them — not run against remote D1):
- `vacancies.ts:59` **high** — a vacancy listed for over 60 days was re-sent to the same user.
  Chosen fix: refresh `first_seen` from `vacancy_snapshot.seen_at` inside `pruneOlderThan`, in one
  `db.batch` with the existing DELETE. The rejected alternative (prune only fingerprints absent
  from the snapshot) re-sends every still-listed old vacancy after any scraper outage longer than
  the snapshot's 14-day memory; a gap test fails under it. Bound: rows live only while delivered or
  seen within 60 days. Trade-off: a vacancy re-posted under the same title and company while
  continuously listed is never re-sent — consistent with precision-first. `first_seen` now means
  "later of delivery and last sighting"; renaming it is a schema change.
- `manual-search.ts:45` — new `claimManualSearch` does check-and-record in one conditional upsert
  (`ON CONFLICT … DO UPDATE … WHERE excluded.last_run_at - last_run_at >= ?`). Real D1: exactly 1
  of 10 concurrent claims won. `axtar.ts` switched to it in `c915667`, and `recordManualSearch` was deleted so the
  race cannot be rebuilt.
- `snapshot.ts:102` — shared `cutoffDaysAgo` guard in `time.ts` for both prunes; negative or NaN
  windows now refuse instead of deleting every row.

Reported, needs a decision:
- `users.ts:46` — `/ixtisas` on a user who sent `/stop` calls `upsertUser`, whose ON CONFLICT sets
  `is_active = 1`: notifications resume silently, though `/stop`'s reply says only `/start`
  re-enables them.
- `/stop` is a soft delete; D1 does enforce the declared foreign keys, but nothing deletes a users
  row, so a stopped user's username, fields and cooldown row are kept forever. Whether `/stop`
  should erase data is the owner's call.
- `users.ts:53` — no per-user field cap (same finding as slice 4).

Verified, no finding: all 15 statements in `src/db` are `prepare(literal).bind(...)`; the
`snapshot.ts:42` ON CONFLICT safely keeps the first title/company/source (real D1 confirmed).

### Slice 6 — found, not changed (from the worker)

- `fetch.ts:24-32` — the queued retry policy, now LOCKED by `tests/utils/fetch.test.ts`: three
  back-to-back attempts with no backoff, HTTP 400/403/404/429/500/503 all retried, 10 s timeout per
  attempt (a dead host costs 30 s), custom `timeoutMs` also per attempt. Audit candidate.
- `fetch.ts:32` — a non-Error rejection is replaced by `new Error("Fetch failed.")`, losing the
  original value. Locked.
- `fetch.ts:3` — no caller sets `FetchTextOptions.retries`; all five callers pass `timeoutMs: 10_000`,
  which equals the default. Left: an exported signature, and the retry fix may need it.
- `log.ts:2,7` — `{ event, ...data }` lets a `data.event` key silently overwrite the event name (not
  locked, looks like a bug); `logError` replaces a non-Error's text with "Unknown error" (locked).
- `scripts/set-webhook.ts` — **untestable as written**: importing it runs top-level await, reads
  `.dev.vars` and calls the live Telegram API. Not touched, not run. Line 49: a `.dev.vars` line
  without `=` yields a key missing its last character and the whole line as its value.
- `tests/fingerprint.test.ts` sits at the `tests/` root while every other test mirrors `src/`;
  structure phase.

Deleted with review: `dedupeVacanciesByFingerprint` had no production caller since `ab9eead`
(the dedupe that runs is `toCandidates` in `run.ts`, still tested) and zero references after
removal; its one test went with it. `fingerprint()` itself is byte-identical, and 10 golden hashes
computed independently with `node:crypto` now lock its output.

### Slice 6 — audit findings

Fixed (3, each proven red-first):
- `fetch.ts` retry policy. A 4xx other than 408/429 now fails after 1 request instead of 3
  (smartjob.az's steady 403 still reaches its caller as `FetchHttpError{status:403}`). 408/429/5xx
  retry after a jittered, growing pause (0.5-1 s, then 1-2 s). Network errors and timeouts retry at
  once. The whole call ends at `timeoutMs + 5 s` (15 s for every caller), so a dead host holds its
  board 15 s instead of 30 s. No caller needed a change; thrown types are unchanged.
- `log.ts` — a `data.event` key could overwrite the event name, so a log line could misreport what
  happened. No current caller passes one; fixed before one does.
- `scripts/set-webhook.ts` — a `.dev.vars` line without `=` produced a key missing its last
  character with the whole line as its value, which could override a real secret that set-webhook
  then registers with Telegram. The parser moved unchanged into a pure `scripts/dev-vars.ts` and
  now skips such lines. Proven against the pre-fix filter, not only against a missing import.
  The script was bundled with esbuild to check it, never run; `.dev.vars` never read.

**Needs a decision (added to the owner's list):**
- **Subrequest budget.** If every board fails in a retryable way, one scheduled run's scrape sends
  20 x 3 = 60 subrequests, before and after this fix. Cloudflare's documented per-invocation limit
  is 50 on the Free plan and 10,000 on Paid (developers.cloudflare.com/workers/platform/limits); D1
  calls and redirect hops count too. The repo does not say which plan this runs on. Options: lower
  `DEFAULT_RETRIES` to 1, or a per-run retry budget in `src/scrapers`.
- **Response body cap.** `response.text()` reads an untrusted body whole, in the one isolate that
  runs all seven boards and delivery. The largest recorded fixture is 396 KB. A byte cap is a new
  failure mode, so its size is a product call.
- Network-error and timeout retries still fire without a pause, so several pages of one board that
  time out together retry in the same instant. Kept deliberately; four existing tests assert it.

### Slice 7 — found, not changed (from the worker)

Scope was widened narrowly to `src/commands` + `tests/commands` for one reshape: the six copied
sender guards became `withSender` in `bot.ts` (type predicate; no `!`, `as` or `@ts-`; reply
byte-identical; `/komek` unaffected).

- HIGH fail-open error boundary and the delete-button ownership hole: locked by tests, fixed by the
  orchestrator directly in the next commits (no audit worker, to finish faster).
- `index.ts:19` — the bot is built per request with no `botInfo`, so grammY calls `getMe` on every
  webhook request BEFORE the secret check: every update costs an extra Telegram call, and any
  unauthenticated POST makes the Worker call Telegram with the real token. Needs a decision on
  where `botInfo` comes from. Locked by "asks Telegram who the bot is on every request, before
  checking the secret".
- Malformed percent-encoding in callback data throws `URIError`; with the fail-open boundary that
  was a 500-and-redelivery loop.
- `VakansiyaBot` type and the `VakansiyaBot/0.1` User-Agent still carry the pre-rename name.
- `src/bot.ts` and `src/commands/*` import each other (safe at call time); structure decision.

### Slice 7 — fixes (orchestrator, no audit worker)

- **HIGH, fail-open error boundary** — `index.ts` now catches around the webhook, logs `bot_error`
  with the handler's own error, and answers Telegram 200, so a failing handler no longer turns
  into a 500 that Telegram redelivers. `bot.catch` was removed: under a webhook grammY never calls
  it. Trade-off: if Telegram itself is unreachable during an update, that update is now dropped
  after logging instead of redelivered.
- **Delete-button ownership** — callback data is now `delete_field:<ownerId>:<field>`; a press
  from anyone but the owner is answered with no text and deletes and edits nothing. Buttons sent
  before this deploy use the old format and no longer match: pressing one does nothing until the
  user runs `/ixtisaslar` again. The owner id costs 3+ bytes of the 64-byte limit, so a field
  longer than ~48 encoded characters gets no button (it can still be removed with `/sil`).
- Proof: 6 tests went red against the pre-fix source, then green.
