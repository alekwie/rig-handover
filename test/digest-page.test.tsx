import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { registerDigestPage } from '../src/digest/page-route.js';
import type { NightDigest, ReadNight } from '../src/digest/types.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

const stubDigest: NightDigest = {
  night: '2026-10-28',
  rows: [
    {
      job: 'digest/render',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      hasFailed: false,
      firstAt: '2026-10-29T05:41:09+01:00',
      lastAt: '2026-10-29T05:41:09+01:00',
    },
    {
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      hasFailed: false,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    },
    {
      job: 'lane/sync',
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      hasFailed: false,
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    },
    {
      job: 'notes/backup',
      owner: 'lane-07',
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      hasFailed: true,
      firstAt: '2026-10-29T04:00:01+01:00',
      lastAt: '2026-10-29T04:00:01+01:00',
    },
    {
      job: 'rig/rotate-logs',
      owner: 'lane-07',
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      hasFailed: false,
      firstAt: '2026-10-28T23:00:02+01:00',
      lastAt: '2026-10-28T23:00:02+01:00',
    },
  ],
  counts: { ok: 10, retry: 4, fail: 1 },
  invalidLines: 0,
};

const stubReadNight: ReadNight = (runsDir, night) => {
  if (night === '2026-10-28') {
    return stubDigest;
  }
  if (night === 'empty') {
    return { night: 'empty', rows: [], counts: { ok: 0, retry: 0, fail: 0 }, invalidLines: 0 };
  }
  if (night === 'invalid') {
    return { night: 'invalid', rows: [], counts: { ok: 0, retry: 0, fail: 0 }, invalidLines: 5 };
  }
  return null;
};

describe('digest page', () => {
  it('renders a digest with all rows and warnings', async () => {
    const app = new Hono();
    registerDigestPage(app, config, stubReadNight);

    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('digest · 2026-10-28');
    expect(html).toContain('fixtures/refresh');
    expect(html).toContain('lane/sync');
    expect(html).toContain('notes/backup');
    expect(html).toContain('rig/rotate-logs');
    expect(html).toContain('digest/render');
    expect(html).toContain('rook');
    expect(html).toContain('lane-07');
    expect(html).toContain('—'); // null owner
    expect(html).toContain('upstream 503');
    expect(html).toContain('quota exceeded');
  });

  it('marks rows with failed or retries >= 3 with warn class', async () => {
    const app = new Hono();
    registerDigestPage(app, config, stubReadNight);

    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();

    // fixtures/refresh has retries >= 3, notes/backup has hasFailed
    expect(html).toContain('<tr class="warn"><td>fixtures/refresh</td>');
    expect(html).toContain('<tr class="warn"><td>notes/backup</td>');
    expect(html).toContain('<tr class=""><td>digest/render</td>');
  });

  it('returns 404 for missing night', async () => {
    const app = new Hono();
    registerDigestPage(app, config, stubReadNight);

    const res = await app.request('/digest/invalid-night');
    expect(res.status).toBe(404);
  });

  it('shows nothing ran for empty digest', async () => {
    const app = new Hono();
    registerDigestPage(app, config, stubReadNight);

    const res = await app.request('/digest/empty');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('shows invalid lines summary', async () => {
    const app = new Hono();
    registerDigestPage(app, config, stubReadNight);

    const res = await app.request('/digest/invalid');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('5 invalid lines');
  });
});
