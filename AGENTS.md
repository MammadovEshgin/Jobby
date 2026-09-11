# Jobby

Telegram bot on Cloudflare Workers that aggregates Azerbaijani job vacancies hourly and notifies
users about the positions they follow.

## Code quality

- Standards: `CODING_STANDARDS.md` (overrides the clean-code skill where they differ).
- Before calling a change done, run `npm run check` and fix what it reports. Hooks lint every edit,
  run the fast gates before you stop, and block a red commit.
- Before committing, run `/finish` (interrogate, deslop, test audit, audit, gates, fresh-context
  review, findings applied). Existing code: `/deslop <path>`, or `/deslop repo` for the whole
  codebase.
- When a correction is given, add one dated line to `CODING_STANDARDS.md` so the review enforces it
  next time.
