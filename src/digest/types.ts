// Plan morning-digest §1 (issue #1): the contract for reading one night's run log. Types only,
// no runtime code, so the reader (#2) and the page, JSON, board and route-test workers (#3–#6)
// can build against it before the reader exists.
//
// The implementation lives in src/digest/reader.ts (#2):
//   export const readNight: ReadNight = (runsDir, night) => { ... };
// Import it, and these types, with the repo's .js specifiers, e.g. from src/app.tsx:
//   import { readNight } from './digest/reader.js';
//   import type { DigestRow, NightDigest } from './digest/types.js';
// Until #2 lands, code against `ReadNight` / `NightDigest` with hand-built values.
//
// Parse once, in the reader. Everything else uses its result as is: no re-parsing, re-counting,
// re-sorting or filtering, so the page, the JSON and the board never disagree (ADR 0001).
//   page   GET /digest/:night      null → 404 · rows [] → "nothing ran" · owner null → "—" ·
//                                  marks hasFailed || retries >= 3
//   JSON   GET /api/digest/:night  null → 404 (only the status is contract) · otherwise the
//                                  NightDigest as is, e.g. c.json(digest)
//   board  each night on disk links to /digest/<night>, beside counts.ok / .retry / .fail

/** A run-log line's `status`. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/**
 * One line of `runs/<night>.jsonl`, as written. The reader counts a line as valid when it parses
 * to a JSON object with:
 * - `at`: a string `Date.parse` reads (not NaN); kept verbatim, offset included
 * - `job`: a non-empty string
 * - `status`: a `RunStatus`
 * - `owner`: a string or `null`; missing or empty is read as `null` (missing data is never dropped)
 * - `error`: a string, or absent / `null` for none
 * Other keys are ignored. Lines that are empty after trimming (the final newline, a lone `\r`) are
 * skipped, not counted. Every other line that is not valid counts in `invalidLines`.
 * Every valid line belongs to the night, whatever its date: nights cross midnight.
 */
export type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/** Valid events per status: lines, not jobs. */
export type StatusCounts = Record<RunStatus, number>;

/**
 * One job's night. A job's events are taken in time order: by `Date.parse(at)`, equal instants in
 * file order. Its latest event is the last one in that order.
 *
 * E.g. 2026-10-28, fixtures/refresh (retry ×3, then ok): runs 4, retries 3, lastStatus 'ok',
 * lastError 'upstream 503', hasFailed false.
 */
export type DigestRow = {
  job: string;
  /** `owner` of the latest event. `null` is kept; render it as `—`. */
  owner: string | null;
  /** Valid events for the job: ok + retry + fail. */
  runs: number;
  /** Events with status `retry`. */
  retries: number;
  /** `status` of the latest event. */
  lastStatus: RunStatus;
  /** Latest non-empty `error` among the job's events, kept even if a later event recovered. */
  lastError: string | null;
  /** Any event was `fail`, even if a later one recovered: `lastStatus` alone would hide it. */
  hasFailed: boolean;
  /** `at` of the earliest event, verbatim: offset kept, never converted to UTC. */
  firstAt: string;
  /** `at` of the latest event, verbatim. */
  lastAt: string;
};

/** A night whose file exists. Plain JSON values only (no Date, no undefined). */
export type NightDigest = {
  /** The night asked for, `YYYY-MM-DD`. */
  night: string;
  /** One row per job, ascending by `job` in plain string order (`a < b`). Empty: nothing ran. */
  rows: DigestRow[];
  /** The night's valid events per status; they sum to the rows' `runs`. */
  counts: StatusCounts;
  /** Non-blank lines that were not a valid `RunEvent`. Counted, never thrown. */
  invalidLines: number;
};

/**
 * Reads `<runsDir>/<night>.jsonl`, synchronously like rig's other file reads.
 * - `null` when the file does not exist, or when `night` does not match /^\d{4}-\d{2}-\d{2}$/
 *   (then nothing is read, so a night can never point outside `runsDir`).
 * - Otherwise a `NightDigest`. An empty or all-invalid file gives `rows: []`.
 * - Bad lines never throw. Other read errors (e.g. permissions) do.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
