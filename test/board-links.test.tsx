import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { readStatus } from '../src/status.js';
import { StatusBoard } from '../src/views/status.js';
import type { RigConfig } from '../src/config.js';
import type { ReadNight, NightDigest } from '../src/digest/types.js';

describe('board links', () => {
  let runsDir: string;

  // Create temp runs dir with fixture files
  const setupFixtures = () => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    // 2026-10-28 has 10 ok, 4 retry, 1 fail
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '');
    // 2026-10-27 has 7 ok, 0 retry, 0 fail
    writeFileSync(join(runsDir, '2026-10-27.jsonl'), '');
  };

  const cleanup = () => {
    if (runsDir) {
      rmSync(runsDir, { recursive: true, force: true });
    }
  };

  afterEach(() => {
    cleanup();
  });

  /**
   * Typed ReadNight stub that returns known counts without parsing.
   * Maps fixture filenames to expected counts from the real data.
   */
  const stubReadNight: ReadNight = (runsDir: string, night: string): NightDigest | null => {
    const knownCounts: Record<string, { ok: number; retry: number; fail: number }> = {
      '2026-10-28': { ok: 10, retry: 4, fail: 1 },
      '2026-10-27': { ok: 7, retry: 0, fail: 0 },
    };

    const counts = knownCounts[night];
    if (!counts) return null;

    return {
      night,
      rows: [],
      counts,
      invalidLines: 0,
    };
  };

  it('renders links to digest pages with correct counts in newest-first order', async () => {
    setupFixtures();
    const config: RigConfig = {
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir,
    };

    const status = readStatus(config, stubReadNight);

    // Create a tiny Hono route to render the board
    const app = new Hono();
    app.get('/', (c) => c.html(<StatusBoard status={status} />));

    const res = await app.request('/');
    const html = await res.text();

    // Verify newest-first order
    const pos2026_10_28 = html.indexOf('2026-10-28');
    const pos2026_10_27 = html.indexOf('2026-10-27');
    expect(pos2026_10_28).toBeLessThan(pos2026_10_27);

    // Verify links to digest pages
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('href="/digest/2026-10-27"');

    // Verify exact counts appear with night
    expect(html).toContain('2026-10-28');
    expect(html).toMatch(/2026-10-28.*ok 10.*retry 4.*fail 1/s);

    expect(html).toContain('2026-10-27');
    expect(html).toMatch(/2026-10-27.*ok 7.*retry 0.*fail 0/s);
  });

  it('returns zeroed counts when readNight returns null (race condition)', async () => {
    setupFixtures();
    const config: RigConfig = {
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir,
    };

    // Stub that always returns null
    const nullReadNight: ReadNight = () => null;
    const status = readStatus(config, nullReadNight);

    // Create a tiny Hono route to render the board
    const app = new Hono();
    app.get('/', (c) => c.html(<StatusBoard status={status} />));

    const res = await app.request('/');
    const html = await res.text();

    // Should still list nights, but with zeroed counts
    expect(html).toContain('2026-10-28');
    expect(html).toContain('2026-10-27');
    expect(html).toMatch(/2026-10-28.*ok 0.*retry 0.*fail 0/s);
    expect(html).toMatch(/2026-10-27.*ok 0.*retry 0.*fail 0/s);
  });
});
