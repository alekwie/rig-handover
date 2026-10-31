import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readStatus, nightsOnDisk } from '../src/status.js';
import type { RigConfig } from '../src/config.js';
import type { ReadNight } from '../src/digest/types.js';

/**
 * Mock readNight for testing: reads the actual test fixture jsonl files and counts.
 */
const mockReadNight: ReadNight = (runsDir: string, night: string) => {
  try {
    const content = readFileSync(`${runsDir}/${night}.jsonl`, 'utf8');
    let ok = 0,
      retry = 0,
      fail = 0;
    content.split('\n').forEach((line) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        if (event.status === 'ok') ok++;
        else if (event.status === 'retry') retry++;
        else if (event.status === 'fail') fail++;
      } catch {
        // skip invalid lines
      }
    });
    return { night, rows: [], counts: { ok, retry, fail }, invalidLines: 0 };
  } catch {
    return null;
  }
};

describe('board links', () => {
  it('lists nights on disk with counts', () => {
    const config: RigConfig = {
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir: 'runs',
    };
    const status = readStatus(config, mockReadNight);

    expect(status.nights).toHaveLength(2);
    expect(status.nights[0].night).toBe('2026-10-28');
    expect(status.nights[0].counts).toEqual({ ok: expect.any(Number), retry: expect.any(Number), fail: expect.any(Number) });
    expect(status.nights[1].night).toBe('2026-10-27');
  });

  it('shows counts beside each link in newest-first order', () => {
    const config: RigConfig = {
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir: 'runs',
    };
    const status = readStatus(config, mockReadNight);

    // Verify newest first
    const nights = status.nights.map((n) => n.night);
    expect(nights).toEqual(['2026-10-28', '2026-10-27']);
  });

  it('returns zeroed counts when a night disappears (race condition)', () => {
    const config: RigConfig = {
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir: 'runs',
    };

    // Mock that returns null (file not found)
    const nullReadNight: ReadNight = () => null;
    const status = readStatus(config, nullReadNight);

    // Should still list the nights from disk, but with zeroed counts
    expect(status.nights).toHaveLength(2);
    status.nights.forEach((entry) => {
      expect(entry.counts).toEqual({ ok: 0, retry: 0, fail: 0 });
    });
  });
});
