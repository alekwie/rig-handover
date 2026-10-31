import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunEvent, StatusCounts } from './types.js';

// Plan morning-digest §1 (issue #2): the one place a night's run log is parsed. Contract in types.ts.

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

export const readNight: ReadNight = (runsDir, night) => {
  if (night.length !== 10 || !NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    const code = err instanceof Error && 'code' in err ? err.code : undefined;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw err;
  }

  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  const byJob = new Map<string, RunEvent[]>();
  let invalidLines = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const event = parseEvent(line);
    if (!event) {
      invalidLines++;
      continue;
    }
    counts[event.status]++;
    const events = byJob.get(event.job);
    if (events) events.push(event);
    else byJob.set(event.job, [event]);
  }

  const rows = [...byJob]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([job, events]) => toRow(job, events));
  return { night, rows, counts, invalidLines };
};

// The edge: one trimmed line becomes a RunEvent, or null when it is not a valid one (types.ts).
function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job.trim() === '') return null;
  if (status !== 'ok' && status !== 'retry' && status !== 'fail') return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  const event: RunEvent = { at, job, status, owner: owner?.trim() ? owner : null };
  if (error?.trim()) event.error = error;
  return event;
}

// Time order: by instant; sort is stable, so equal instants keep file order.
function toRow(job: string, events: RunEvent[]): DigestRow {
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const first = events[0];
  const last = events[events.length - 1];
  return {
    job,
    owner: last.owner,
    runs: events.length,
    retries: events.filter((e) => e.status === 'retry').length,
    lastStatus: last.status,
    lastError: events.findLast((e) => e.error !== undefined)?.error ?? null,
    hasFailed: events.some((e) => e.status === 'fail'),
    firstAt: first.at,
    lastAt: last.at,
  };
}
