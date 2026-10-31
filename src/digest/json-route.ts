import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import type { ReadNight } from './types.js';

/**
 * Registers the JSON digest route on the app.
 * GET /api/digest/:night returns the NightDigest for that night, or 404 if not found.
 */
export function registerDigestJson(
  app: Hono,
  config: RigConfig,
  readNight: ReadNight,
): void {
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = readNight(config.runsDir, night);

    if (digest === null) {
      return c.json({ error: 'not found' }, 404);
    }

    return c.json(digest);
  });
}
