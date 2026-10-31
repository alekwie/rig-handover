import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';
import type { ReadNight, StatusCounts } from './digest/types.js';

/**
 * One night on the board: the night's date and its status counts (ok/retry/fail).
 */
export type NightSummary = {
  night: string;
  counts: StatusCounts;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

/**
 * Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
 * Returns night dates as strings for callers that need the filename list.
 */
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Read the status board: adapter, installed time, last heartbeat, and nights with their counts.
 * @param config rig configuration with adapter, installed, runsDir
 * @param readNight callback to read one night's digest; returns counts or null if night missing
 * @returns Status with nights as [{ night, counts }, ...], newest first
 *
 * If a night disappears between listing and reading (race condition), counts are zeroed.
 */
export function readStatus(config: RigConfig, readNight: ReadNight): Status {
  const nightList = nightsOnDisk(config.runsDir);
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightList.map((night) => {
      const digest = readNight(config.runsDir, night);
      return {
        night,
        counts: digest?.counts ?? { ok: 0, retry: 0, fail: 0 },
      };
    }),
  };
}
