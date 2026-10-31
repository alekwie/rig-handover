# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

## Morning digest

- `/` links the nights on disk with their ok / retry / fail event counts.
- `/digest/2026-10-28` shows one row per job, sorted by job name.
- `/api/digest/2026-10-28` returns the same rows and counts as JSON.

A missing night returns 404. An empty night says "nothing ran". Bad log lines are counted
without losing the rest of the night. Missing owners show as `—`; timestamps keep their
original offsets. Rows warn about three or more retries or any failure, even after recovery.

The server listens only on `127.0.0.1`. Reviewers get a static HTML copy, not access to the
running service. Never commit that copy: publish it only to an approved host, and remove the
lane marker from the same public link after review (ADR 0003).
