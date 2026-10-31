---
plan: morning-digest
status: done
owner: rook
opened: 2026-10-29
closed: 2026-10-31
---

# Morning digest

The night's run log is a JSONL file nobody reads. By breakfast someone has to know what ran,
what retried, what failed, and whose it was, without opening `runs/`. rig already serves the
status board; the digest is one more page on it.

Out of scope: notifications, history across nights, auth (rig only listens on localhost).

## 1. Run log reader

Read `runs/<night>.jsonl` into one row per job: job, owner, runs, retries, last status, last
error, first and last time. One JSON object per line (`at`, `job`, `status`: `ok | retry | fail`,
`owner`, optional `error`).

- A line that doesn't parse is counted, never thrown. The night still renders.
- `owner` can be `null`. Keep the row; show the owner as `—`.
- Lives in `src/digest/`. Commit `src/digest/types.ts` first (the `DigestRow` type and the
  `readNight(runsDir, night)` signature), so every part of section 2 can start against it.

Done when: reader tests pass on `runs/2026-10-28.jsonl` (5 jobs, 1 bad line).

## 2. Digest page

Four small parts. Each needs only `src/digest/types.ts` from section 1, so once that is in they
can go to four workers at once. Small, well-specified work: a cheaper model is fine here.

### 2a. Page

`GET /digest/:night` renders the rows with the usual layout: one table, sorted by job, retries of
3 or more and any `fail` marked. A night with no file returns 404; an empty file renders
"nothing ran".

Done when: `/digest/2026-10-28` renders locally.

### 2b. JSON

`GET /api/digest/:night` returns the same rows as JSON. Agents read this one; the page and the
JSON must never disagree (ADR 0001).

Done when: the JSON for 2026-10-28 has the same jobs, in the same order, as the page.

### 2c. Board link

The status board links each night on disk to its digest, with its ok / retry / fail counts beside
it.

Done when: both nights on disk link to a digest that renders.

### 2d. Route tests

Route tests for 2a and 2b: 200, 404 for a night with no file, the empty night, a night with a bad
line. Use a temp runs dir; `runs/` is read-only.

Done when: `pnpm test` is green with the new tests.

## 3. Preview for review

The reviewer reads the page from a copy, not from the lane. Run rig and save `/digest/2026-10-28` as
one HTML file, lane banner included (a command, not a browser's "save as"; the page is
self-contained, ADR 0001). Put it on your own public host, one where you can upload over it later (any bucket
or static host, ADR 0003), so it opens from a public HTTPS link. Send the reviewer the link and the
issues for this plan.

Done when: the preview link is sent to the reviewer.

## 4. Clean up

The preview carries this lane's marker on a public link (ADR 0003). Take the marker off: save the
page again with `LANE_MARKER` unset (the banner reads "no marker set") and upload it over the same
link. Move this plan to `docs/plans/done/` with its issue list.

Done when: the preview link no longer shows the lane marker.

## Issues

| Issue | Source | Work | Blocked by |
|---|---|---|---|
| [#1](https://github.com/alekwie/rig-handover/issues/1) | § 1 | Shared types and reader contract | — |
| [#2](https://github.com/alekwie/rig-handover/issues/2) | § 1 | Run log reader | #1 |
| [#3](https://github.com/alekwie/rig-handover/issues/3) | § 2a | Digest page | #1 |
| [#4](https://github.com/alekwie/rig-handover/issues/4) | § 2b | Digest JSON | #1 |
| [#5](https://github.com/alekwie/rig-handover/issues/5) | § 2c | Board links and counts | #1 |
| [#6](https://github.com/alekwie/rig-handover/issues/6) | § 2d | Route tests | #1; final checks need #2–#4 |
| [#7](https://github.com/alekwie/rig-handover/issues/7) | § 3 | Public preview and review | #2–#6 |
| [#8](https://github.com/alekwie/rig-handover/issues/8) | § 4 | Marker cleanup and plan archival | #7, actual review and separate human approval |

The issue closing comments record worker, model, effort and commit. Shared types landed
before the reader and four section-2 workers started. Types and reader used
claude-opus-5-5; the four section-2 workers used claude-haiku-4-5.

## Completion record

- All 53 tests and strict typechecking pass. Independent checks confirm both sample
  nights' page/JSON job ordering and unchanged `runs/` fixtures.
- The reviewer confirmed it had seen the marked preview before cleanup.
- After separate human approval, rig ran with `LANE_MARKER` unset and its self-contained
  digest was captured again through an HTTP command.
- The clean capture replaced https://alekwie.github.io/rig-handover/ at the exact same URL.
  HTTP 200/text/html and exact bytes were verified; the banner reads "no marker set" and
  the original marker is absent.
- Neither HTML capture nor the marker entered git. The Pages workflow used temporary
  encrypted input and a deletable deployment artifact; the uploader removed both after
  successful publication. The sample page remains public without its marker.
- The tested upload, overwrite and take-down routine lives in the shared
  `.agents/skills/github-pages-preview/SKILL.md`.
