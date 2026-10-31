import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { registerDigestJson } from '../src/digest/json-route.js';
import type { NightDigest, ReadNight } from '../src/digest/types.js';

describe('digest JSON route', () => {
  it('returns the digest as JSON when night exists', async () => {
    const app = new Hono();
    const config = { adapter: 'test', installed: '2026-10-31T00:00:00Z', beatEverySeconds: 60, runsDir: 'runs' };

    const digest: NightDigest = {
      night: '2026-10-28',
      rows: [
        {
          job: 'fixtures/refresh',
          owner: 'alice',
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: 'upstream 503',
          hasFailed: false,
          firstAt: '2026-10-28T08:00:00+01:00',
          lastAt: '2026-10-28T08:15:00+01:00',
        },
      ],
      counts: { ok: 1, retry: 3, fail: 0 },
      invalidLines: 0,
    };

    const readNight: ReadNight = (runsDir, night) => {
      if (night === '2026-10-28') return digest;
      return null;
    };

    registerDigestJson(app, config, readNight);

    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(digest);
  });

  it('returns 404 JSON error when night does not exist', async () => {
    const app = new Hono();
    const config = { adapter: 'test', installed: '2026-10-31T00:00:00Z', beatEverySeconds: 60, runsDir: 'runs' };

    const readNight: ReadNight = () => null;

    registerDigestJson(app, config, readNight);

    const res = await app.request('/api/digest/2026-10-29');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'not found' });
  });

  it('returns digest with empty rows and counts when night has no events', async () => {
    const app = new Hono();
    const config = { adapter: 'test', installed: '2026-10-31T00:00:00Z', beatEverySeconds: 60, runsDir: 'runs' };

    const emptyDigest: NightDigest = {
      night: '2026-10-27',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      invalidLines: 0,
    };

    const readNight: ReadNight = (runsDir, night) => {
      if (night === '2026-10-27') return emptyDigest;
      return null;
    };

    registerDigestJson(app, config, readNight);

    const res = await app.request('/api/digest/2026-10-27');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(emptyDigest);
  });

  it('returns digest with invalidLines count', async () => {
    const app = new Hono();
    const config = { adapter: 'test', installed: '2026-10-31T00:00:00Z', beatEverySeconds: 60, runsDir: 'runs' };

    const digestWithInvalidLines: NightDigest = {
      night: '2026-10-26',
      rows: [
        {
          job: 'test-job',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          hasFailed: false,
          firstAt: '2026-10-26T10:00:00Z',
          lastAt: '2026-10-26T10:00:00Z',
        },
      ],
      counts: { ok: 1, retry: 0, fail: 0 },
      invalidLines: 2,
    };

    const readNight: ReadNight = (runsDir, night) => {
      if (night === '2026-10-26') return digestWithInvalidLines;
      return null;
    };

    registerDigestJson(app, config, readNight);

    const res = await app.request('/api/digest/2026-10-26');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(digestWithInvalidLines);
    expect(body.invalidLines).toBe(2);
  });
});
