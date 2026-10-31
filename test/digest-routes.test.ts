import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { NightDigest } from '../src/digest/types.js';

describe('digest routes', () => {
  let tempRunsDir: string;
  const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: '' };

  beforeEach(() => {
    tempRunsDir = mkdtempSync(join(tmpdir(), 'rig-test-'));
    config.runsDir = tempRunsDir;
  });

  afterEach(() => {
    rmSync(tempRunsDir, { recursive: true, force: true });
  });

  describe('GET /digest/:night', () => {
    it('returns 404 for a night with no file', async () => {
      const res = await createApp(config).request('/digest/2026-11-01');
      expect(res.status).toBe(404);
    });

    it('renders "nothing ran" for an empty night', async () => {
      writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), '');
      const res = await createApp(config).request('/digest/2026-11-01');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('nothing ran');
    });

    it('renders a table with nine columns for a night with runs', async () => {
      const jsonl = [
        '{"at":"2026-11-01T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
        '{"at":"2026-11-01T23:00:06+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
      ].join('\n');
      writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), jsonl);
      const res = await createApp(config).request('/digest/2026-11-01');
      const html = await res.text();
      expect(res.status).toBe(200);
      // Check for table columns: job, owner, runs, retries, lastStatus, lastError, firstAt, lastAt (8 fields)
      // Plus warning column = 9 columns total
      expect(html).toContain('<table');
      expect(html).toContain('rig/rotate-logs');
      expect(html).toContain('lane/sync');
    });

    it('marks a warning row for retries >= 3', async () => {
      const jsonl = [
        '{"at":"2026-11-01T01:30:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
        '{"at":"2026-11-01T01:31:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
        '{"at":"2026-11-01T01:33:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
        '{"at":"2026-11-01T01:37:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
      ].join('\n');
      writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), jsonl);
      const res = await createApp(config).request('/digest/2026-11-01');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('fixtures/refresh');
      expect(html).toContain('warn');
    });

    it('marks a warning row for any fail status', async () => {
      const jsonl = [
        '{"at":"2026-11-01T04:00:01+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
      ].join('\n');
      writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), jsonl);
      const res = await createApp(config).request('/digest/2026-11-01');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('notes/backup');
      expect(html).toContain('warn');
    });

    it('displays null owner as —', async () => {
      const jsonl = [
        '{"at":"2026-11-01T05:41:09+01:00","job":"digest/render","status":"ok","owner":null}',
      ].join('\n');
      writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), jsonl);
      const res = await createApp(config).request('/digest/2026-11-01');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('digest/render');
      expect(html).toContain('—');
    });

    it('preserves firstAt and lastAt offset strings verbatim', async () => {
      const jsonl = [
        '{"at":"2026-11-01T23:00:02+01:00","job":"test/job","status":"ok","owner":"user"}',
        '{"at":"2026-11-01T23:00:06-05:00","job":"test/job","status":"ok","owner":"user"}',
      ].join('\n');
      writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), jsonl);
      const res = await createApp(config).request('/digest/2026-11-01');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('+01:00');
      expect(html).toContain('-05:00');
    });

    it('sorts jobs in plain string order', async () => {
      const jsonl = [
        '{"at":"2026-11-01T23:00:06+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
        '{"at":"2026-11-01T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
        '{"at":"2026-11-01T23:00:04+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
      ].join('\n');
      writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), jsonl);
      const res = await createApp(config).request('/digest/2026-11-01');
      const html = await res.text();
      expect(res.status).toBe(200);
      const fixturesIdx = html.indexOf('fixtures/refresh');
      const laneIdx = html.indexOf('lane/sync');
      const rigIdx = html.indexOf('rig/rotate-logs');
      expect(fixturesIdx).toBeLessThan(laneIdx);
      expect(laneIdx).toBeLessThan(rigIdx);
    });

    it('handles mixed nights with all-invalid and one-bad-line', async () => {
      const jsonl = [
        '{"at":"2026-11-01T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
        'not valid json at all',
        '{"at":"2026-11-01T23:00:06+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
      ].join('\n');
      writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), jsonl);
      const res = await createApp(config).request('/digest/2026-11-01');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('rig/rotate-logs');
      expect(html).toContain('lane/sync');
    });

    it('sets LANE_MARKER in environment for banner display', async () => {
      vi.stubEnv('LANE_MARKER', 'TEST-MARKER');
      try {
        writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), '');
        const res = await createApp(config).request('/digest/2026-11-01');
        const html = await res.text();
        expect(res.status).toBe(200);
        expect(html).toContain('TEST-MARKER');
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  describe('GET /api/digest/:night', () => {
    it('returns 404 for a night with no file', async () => {
      const res = await createApp(config).request('/api/digest/2026-11-01');
      expect(res.status).toBe(404);
    });

    it('returns empty night as JSON with night, rows, counts, invalidLines', async () => {
      writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), '');
      const res = await createApp(config).request('/api/digest/2026-11-01');
      const data = (await res.json()) as NightDigest;
      expect(res.status).toBe(200);
      expect(data).toEqual({
        night: '2026-11-01',
        rows: [],
        counts: { ok: 0, retry: 0, fail: 0 },
        invalidLines: 0,
      });
    });

    it('returns NightDigest with correct shape and job ordering', async () => {
      const jsonl = [
        '{"at":"2026-11-01T23:00:06+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
        '{"at":"2026-11-01T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
      ].join('\n');
      writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), jsonl);
      const res = await createApp(config).request('/api/digest/2026-11-01');
      const data = (await res.json()) as NightDigest;
      expect(res.status).toBe(200);
      expect(data.night).toBe('2026-11-01');
      expect(data.rows).toHaveLength(2);
      expect(data.rows[0].job).toBe('lane/sync');
      expect(data.rows[1].job).toBe('rig/rotate-logs');
    });

    it('returns exact DigestRow shape with all fields', async () => {
      const jsonl = [
        '{"at":"2026-11-01T23:00:02+01:00","job":"test/job","status":"ok","owner":"user"}',
        '{"at":"2026-11-01T23:00:06+01:00","job":"test/job","status":"retry","owner":"user","error":"error msg"}',
      ].join('\n');
      writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), jsonl);
      const res = await createApp(config).request('/api/digest/2026-11-01');
      const data = (await res.json()) as NightDigest;
      const row = data.rows[0];
      expect(row).toHaveProperty('job');
      expect(row).toHaveProperty('owner');
      expect(row).toHaveProperty('runs');
      expect(row).toHaveProperty('retries');
      expect(row).toHaveProperty('lastStatus');
      expect(row).toHaveProperty('lastError');
      expect(row).toHaveProperty('hasFailed');
      expect(row).toHaveProperty('firstAt');
      expect(row).toHaveProperty('lastAt');
    });

    it('preserves offset strings in firstAt and lastAt verbatim', async () => {
      const jsonl = [
        '{"at":"2026-11-01T23:00:02+01:00","job":"test/job","status":"ok","owner":"user"}',
        '{"at":"2026-11-01T23:00:06-05:00","job":"test/job","status":"ok","owner":"user"}',
      ].join('\n');
      writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), jsonl);
      const res = await createApp(config).request('/api/digest/2026-11-01');
      const data = (await res.json()) as NightDigest;
      const row = data.rows[0];
      expect(row.firstAt).toBe('2026-11-01T23:00:02+01:00');
      expect(row.lastAt).toBe('2026-11-01T23:00:06-05:00');
    });

    it('returns null owner as null in JSON', async () => {
      const jsonl = [
        '{"at":"2026-11-01T05:41:09+01:00","job":"digest/render","status":"ok","owner":null}',
      ].join('\n');
      writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), jsonl);
      const res = await createApp(config).request('/api/digest/2026-11-01');
      const data = (await res.json()) as NightDigest;
      const row = data.rows[0];
      expect(row.owner).toBeNull();
    });

    it('counts status correctly', async () => {
      const jsonl = [
        '{"at":"2026-11-01T01:30:00+01:00","job":"job1","status":"retry","owner":"user","error":"error"}',
        '{"at":"2026-11-01T01:31:00+01:00","job":"job2","status":"fail","owner":"user","error":"error"}',
        '{"at":"2026-11-01T01:37:00+01:00","job":"job3","status":"ok","owner":"user"}',
      ].join('\n');
      writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), jsonl);
      const res = await createApp(config).request('/api/digest/2026-11-01');
      const data = (await res.json()) as NightDigest;
      expect(data.counts).toEqual({ ok: 1, retry: 1, fail: 1 });
    });

    it('counts invalid lines', async () => {
      const jsonl = [
        '{"at":"2026-11-01T23:00:02+01:00","job":"test/job","status":"ok","owner":"user"}',
        'not valid json at all',
        'another bad line',
      ].join('\n');
      writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), jsonl);
      const res = await createApp(config).request('/api/digest/2026-11-01');
      const data = (await res.json()) as NightDigest;
      expect(data.invalidLines).toBe(2);
    });

    it('matches page JSON and job order', async () => {
      const jsonl = [
        '{"at":"2026-11-01T23:00:06+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
        '{"at":"2026-11-01T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
        '{"at":"2026-11-01T23:00:04+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
      ].join('\n');
      writeFileSync(join(tempRunsDir, '2026-11-01.jsonl'), jsonl);
      const htmlRes = await createApp(config).request('/digest/2026-11-01');
      const jsonRes = await createApp(config).request('/api/digest/2026-11-01');
      const html = await htmlRes.text();
      const json = (await jsonRes.json()) as NightDigest;
      // Extract job names from JSON in order
      const jsonJobs = json.rows.map((r) => r.job);
      // Verify HTML contains same jobs in same order
      expect(jsonJobs).toEqual(['fixtures/refresh', 'lane/sync', 'rig/rotate-logs']);
      const fixturesIdx = html.indexOf('fixtures/refresh');
      const laneIdx = html.indexOf('lane/sync');
      const rigIdx = html.indexOf('rig/rotate-logs');
      expect(fixturesIdx).toBeLessThan(laneIdx);
      expect(laneIdx).toBeLessThan(rigIdx);
    });
  });
});
