import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

// runs/ holds real nights: read-only. Everything else is written to a temp runs dir.
const NIGHT = '2026-10-30';
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function readText(text: string) {
  writeFileSync(join(dir, `${NIGHT}.jsonl`), text);
  return readNight(dir, NIGHT);
}
const readLines = (...lines: string[]) => readText(lines.map((l) => `${l}\n`).join(''));
// One run-log line; a field set to undefined is left out.
const ev = (fields: Record<string, unknown> = {}) =>
  JSON.stringify({ at: '2026-10-30T23:00:00+01:00', job: 'a/job', status: 'ok', owner: 'rook', ...fields });
const nothingRan = (invalidLines: number) => ({
  night: NIGHT,
  rows: [],
  counts: { ok: 0, retry: 0, fail: 0 },
  invalidLines,
});

describe('readNight on the nights in runs/', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line, every row field', () => {
    expect(readNight('runs', '2026-10-28')).toStrictEqual({
      night: '2026-10-28',
      rows: [
        { job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null, hasFailed: false, firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00' },
        { job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503', hasFailed: false, firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00' },
        { job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held', hasFailed: false, firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00' },
        { job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded', hasFailed: true, firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00' },
        { job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok', lastError: null, hasFailed: false, firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00' },
      ],
      counts: { ok: 10, retry: 4, fail: 1 },
      invalidLines: 1,
    });
  });

  it('reads 2026-10-27: 4 jobs, no bad lines', () => {
    const digest = readNight('runs', '2026-10-27');
    expect(digest?.rows.map((r) => r.job)).toEqual(['fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
    expect(digest?.counts).toEqual({ ok: 7, retry: 0, fail: 0 });
    expect(digest?.invalidLines).toBe(0);
  });
});

describe('missing, empty and invalid nights', () => {
  it('returns null when the file or the runs dir does not exist', () => {
    writeFileSync(join(dir, 'file'), '');
    expect(readNight(dir, NIGHT)).toBeNull();
    expect(readNight(join(dir, 'nope'), NIGHT)).toBeNull();
    expect(readNight(join(dir, 'file'), NIGHT)).toBeNull();
  });

  it('reads an empty or blank-only file as nothing ran, without bad lines', () => {
    expect(readText('')).toStrictEqual(nothingRan(0));
    expect(readText('\n\r\n   \n\t\n')).toStrictEqual(nothingRan(0));
  });

  it('counts an all-invalid file and still returns the night', () => {
    expect(readLines('not json', '{"at":', '[]')).toStrictEqual(nothingRan(3));
  });

  it('counts lines that parse but are not a valid event, and keeps the rest', () => {
    const bad = [
      '[]', '"ok"', '42', 'null', 'true', '{}',
      ev({ at: undefined }), ev({ at: 'yesterday' }), ev({ at: '' }), ev({ at: 1793232000000 }),
      ev({ job: undefined }), ev({ job: '' }), ev({ job: 7 }),
      ev({ status: undefined }), ev({ status: 'OK' }), ev({ status: 'skipped' }),
      ev({ owner: 7 }), ev({ owner: false }), ev({ owner: {} }),
      ev({ error: 503 }), ev({ error: ['x'] }),
    ];
    const digest = readLines(ev({ job: 'good', status: 'retry' }), ...bad, ev({ job: 'good' }));
    expect(digest?.invalidLines).toBe(bad.length);
    expect(digest?.rows.map((r) => [r.job, r.runs])).toEqual([['good', 2]]);
    expect(digest?.counts).toEqual({ ok: 1, retry: 1, fail: 0 });
  });

  it('throws read errors other than a missing file', () => {
    mkdirSync(join(dir, `${NIGHT}.jsonl`));
    expect(() => readNight(dir, NIGHT)).toThrow();
  });
});

describe('rows', () => {
  it('gives one row per job, in plain string order, with counts summing to runs', () => {
    const digest = readLines(ev({ job: 'b' }), ev({ job: 'B', status: 'fail' }), ev({ job: 'a/x' }), ev({ job: 'b', status: 'retry' }), ev({ job: 'a' }), ev({ job: 'Z' }));
    expect(digest?.rows.map((r) => r.job)).toEqual(['B', 'Z', 'a', 'a/x', 'b']);
    expect(digest?.counts).toEqual({ ok: 4, retry: 1, fail: 1 });
    expect(digest?.rows.reduce((n, r) => n + r.runs, 0)).toBe(6);
  });

  it('reads a missing or empty owner as null, and takes the owner of the latest event', () => {
    const digest = readLines(
      ev({ job: 'missing', owner: undefined }),
      ev({ job: 'empty', owner: '' }),
      ev({ job: 'dropped', at: '2026-10-30T23:00:00+01:00', owner: 'rook' }),
      ev({ job: 'dropped', at: '2026-10-30T23:30:00+01:00', owner: null }),
      ev({ job: 'set', at: '2026-10-30T23:30:00+01:00', owner: 'lane-07' }),
      ev({ job: 'set', at: '2026-10-30T23:00:00+01:00', owner: null }),
    );
    expect(digest?.rows.map((r) => [r.job, r.owner])).toEqual([['dropped', null], ['empty', null], ['missing', null], ['set', 'lane-07']]);
    expect(digest?.invalidLines).toBe(0);
  });

  it('keeps a recovered failure and the latest non-empty error', () => {
    const digest = readLines(
      ev({ at: '2026-10-30T23:00:00+01:00', status: 'fail', error: 'disk full' }),
      ev({ at: '2026-10-30T23:05:00+01:00', status: 'retry', error: 'still full' }),
      ev({ at: '2026-10-30T23:10:00+01:00', status: 'ok', error: '' }),
      ev({ at: '2026-10-30T23:15:00+01:00', status: 'ok', error: null }),
    );
    expect(digest?.rows).toStrictEqual([
      { job: 'a/job', owner: 'rook', runs: 4, retries: 1, lastStatus: 'ok', lastError: 'still full', hasFailed: true, firstAt: '2026-10-30T23:00:00+01:00', lastAt: '2026-10-30T23:15:00+01:00' },
    ]);
    expect(digest?.counts).toEqual({ ok: 2, retry: 1, fail: 1 });
  });

  it('keeps a blank owner as missing and ignores blank errors and jobs', () => {
    const digest = readLines(
      ev({ owner: ' \t ', error: ' \t ' }),
      ev({ job: ' \t ' }),
    );
    expect(digest?.rows).toEqual([
      expect.objectContaining({ job: 'a/job', owner: null, lastError: null, runs: 1 }),
    ]);
    expect(digest?.invalidLines).toBe(1);
  });

  it('orders events by instant, not by file or string order, and keeps each offset verbatim', () => {
    const digest = readLines(
      ev({ at: '2026-10-29T02:45:00+01:00', status: 'ok', owner: 'rook' }), // 01:45Z, latest
      ev({ at: '2026-10-29T01:30:00Z', status: 'retry', error: 'again' }), // 01:30Z
      ev({ at: '2026-10-29T06:00:00+05:00', status: 'fail', owner: 'lane-07', error: 'boom' }), // 01:00Z, earliest
    );
    expect(digest?.rows).toStrictEqual([
      { job: 'a/job', owner: 'rook', runs: 3, retries: 1, lastStatus: 'ok', lastError: 'again', hasFailed: true, firstAt: '2026-10-29T06:00:00+05:00', lastAt: '2026-10-29T02:45:00+01:00' },
    ]);
  });

  it('takes equal instants in file order', () => {
    const digest = readLines(
      ev({ job: 'tie/a', at: '2026-10-29T01:00:00+01:00', status: 'retry', owner: 'first', error: 'first' }),
      ev({ job: 'tie/a', at: '2026-10-29T00:00:00Z', status: 'ok', owner: 'second' }),
      ev({ job: 'tie/b', at: '2026-10-29T00:00:00Z', status: 'ok', owner: 'first' }),
      ev({ job: 'tie/b', at: '2026-10-28T19:00:00-05:00', status: 'fail', owner: 'second', error: 'second' }),
    );
    expect(digest?.rows.map(({ job, owner, lastStatus, lastError, firstAt, lastAt }) => ({ job, owner, lastStatus, lastError, firstAt, lastAt }))).toEqual([
      { job: 'tie/a', owner: 'second', lastStatus: 'ok', lastError: 'first', firstAt: '2026-10-29T01:00:00+01:00', lastAt: '2026-10-29T00:00:00Z' },
      { job: 'tie/b', owner: 'second', lastStatus: 'fail', lastError: 'second', firstAt: '2026-10-29T00:00:00Z', lastAt: '2026-10-28T19:00:00-05:00' },
    ]);
  });

  it('reads CRLF, padded lines, extra keys and a last line without a newline', () => {
    const digest = readText(`  ${ev({ host: 'x', error: null })}  \r\n\r\n${ev({ status: 'retry', error: '' })}\r\n${ev({ at: '2026-10-30T23:01:00+01:00' })}`);
    expect(digest?.invalidLines).toBe(0);
    expect(digest?.rows).toEqual([expect.objectContaining({ runs: 3, retries: 1, lastStatus: 'ok', lastError: null, lastAt: '2026-10-30T23:01:00+01:00' })]);
  });
});

describe('night names', () => {
  it('returns null for a night that is not YYYY-MM-DD, without reading outside runsDir', () => {
    const runsDir = join(dir, 'runs');
    mkdirSync(runsDir);
    writeFileSync(join(dir, 'secret.jsonl'), `${ev()}\n`);
    writeFileSync(join(runsDir, `${NIGHT}.jsonl`), `${ev()}\n`);
    writeFileSync(join(runsDir, `${NIGHT}\n.jsonl`), `${ev()}\n`);
    expect(readNight(runsDir, NIGHT)?.rows).toHaveLength(1);
    for (const night of ['../secret', `../runs/${NIGHT}`, `${NIGHT}/../../secret`, join(dir, 'secret'), `${NIGHT}.jsonl`, `${NIGHT}\n`, ` ${NIGHT}`, '2026-10-3', '20261030', '']) {
      expect(readNight(runsDir, night)).toBeNull();
    }
  });
});
