import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const usage = `Usage:
  node scripts/pages-preview.mjs put /absolute/private/page.html --repo OWNER/REPO --account LOGIN --log /absolute/private/requests.jsonl
  node scripts/pages-preview.mjs take-down --repo OWNER/REPO --account LOGIN --log /absolute/private/requests.jsonl

Requires gh authentication and preview-pages.yml on the default branch.
put replaces the SAME public Pages root. Human approval is required first.
take-down disables Pages; it does not delete the repository.
HTML is passed through a temporary encrypted Actions secret, never git or logs.
The secret and Pages artifacts are deleted after a successful deployment.
Do not run concurrently. Never put the log or HTML in a tracked directory.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.length === 0) {
  console.log(usage);
  process.exit(0);
}
const command = args.shift();
assert.ok(command === 'put' || command === 'take-down', usage);
const file = command === 'put' ? args.shift() : undefined;
const options = {};
while (args.length) {
  const flag = args.shift();
  assert.ok(['--repo', '--account', '--log'].includes(flag), usage);
  assert.ok(args.length && !args[0].startsWith('--'), usage);
  assert.ok(!(flag in options), `Duplicate ${flag}`);
  options[flag] = args.shift();
}
const repo = options['--repo'];
const account = options['--account'];
const log = options['--log'];
assert.match(repo ?? '', /^[\w.-]+\/[\w.-]+$/);
assert.ok(account && log && isAbsolute(log), usage);
assert.ok(!file || isAbsolute(file), 'Use an absolute private HTML path');
const secret = 'RIG_PREVIEW_HTML_B64';
const workflow = 'preview-pages.yml';
const endpoint = `repos/${repo}`;
const hash = (data) => createHash('sha256').update(data).digest('hex');
const record = (entry) => appendFileSync(
  log, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, { mode: 0o600 },
);
function gh(arguments_, { input, allow404 = false } = {}) {
  record({ request: { tool: 'gh', arguments: arguments_, ...(input ? {
    stdin: '[withheld HTML]', bytes: Buffer.byteLength(input), sha256: hash(input),
  } : {}) } });
  const result = spawnSync('gh', arguments_, { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  record({ response: {
    status: result.status, stdout: result.stdout, stderr: result.stderr,
    ...(result.error ? { error: result.error.message } : {}),
  } });
  if (allow404 && result.status !== 0 && /HTTP 404/.test(result.stderr ?? '')) return null;
  assert.equal(result.status, 0, `gh ${arguments_.join(' ')} failed; see the private log`);
  return result.stdout.trim();
}
const api = (path, options) => {
  const result = gh(['api', path], options);
  return result === null ? null : JSON.parse(result);
};
assert.equal(api('user').login, account, 'Wrong active GitHub account; do not switch silently');
const repository = api(endpoint);
assert.equal(repository.full_name.toLowerCase(), repo.toLowerCase());
assert.equal(repository.owner.login.toLowerCase(), account.toLowerCase(), 'Use a human-owned repository');
const defaultBranch = repository.default_branch;
const pagesPath = `${endpoint}/pages`;

async function verify(url, expected) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) });
    const body = Buffer.from(await response.arrayBuffer());
    record({ verification: {
      url, status: response.status, contentType: response.headers.get('content-type'),
      bytes: body.length, sha256: hash(body),
    } });
    if (expected === null ? response.status === 404 :
      response.status === 200 && response.headers.get('content-type')?.includes('text/html') && body.equals(expected)) return;
    if (attempt < 29) await delay(10000);
  }
  throw new Error(`Public URL did not reach the expected state: ${url}`);
}
function removeArtifacts() {
  const runs = api(`${endpoint}/actions/workflows/${workflow}/runs?per_page=100`, { allow404: true });
  for (const run of runs?.workflow_runs ?? []) {
    const artifacts = api(`${endpoint}/actions/runs/${run.id}/artifacts?per_page=100`);
    for (const artifact of artifacts.artifacts) {
      if (artifact.name === 'github-pages' && !artifact.expired) {
        gh(['api', '--method', 'DELETE', `${endpoint}/actions/artifacts/${artifact.id}`]);
      }
    }
  }
}
function removeSecret() {
  if (api(`${endpoint}/actions/secrets/${secret}`, { allow404: true })) {
    gh(['secret', 'delete', secret, '--repo', repo]);
  }
}

if (command === 'take-down') {
  const pages = api(pagesPath);
  assert.equal(pages.build_type, 'workflow', 'Refuse to change a branch-published site');
  gh(['api', '--method', 'DELETE', pagesPath]);
  removeSecret();
  removeArtifacts();
  await verify(pages.html_url, null);
  console.log(`Taken down and verified HTTP 404: ${pages.html_url}`);
} else {
  const html = readFileSync(file);
  const encoded = html.toString('base64');
  assert.ok(encoded.length <= 48000, 'Capture is too large for the temporary Actions secret');
  assert.ok(html.toString('utf8').toLowerCase().startsWith('<!doctype html>'), 'Expected an HTML capture');
  assert.ok(!/<script\b/i.test(html.toString('utf8')), 'This repository forbids client scripts');
  api(`${endpoint}/contents/.github/workflows/${workflow}?ref=${encodeURIComponent(defaultBranch)}`);
  let pages = api(pagesPath, { allow404: true });
  if (!pages) {
    pages = JSON.parse(gh(['api', '--method', 'POST', pagesPath, '-f', 'build_type=workflow']));
  }
  assert.equal(pages.build_type, 'workflow', 'Refuse to change a branch-published site');
  assert.ok(!pages.cname, 'Refuse to replace a custom-domain site');
  const requestId = randomUUID();
  gh(['secret', 'set', secret, '--repo', repo], { input: encoded });
  try {
    const dispatch = gh(['workflow', 'run', workflow, '--repo', repo, '--ref', defaultBranch, '-f', `request_id=${requestId}`]);
    let runId = dispatch.match(/\/actions\/runs\/(\d+)/)?.[1];
    for (let attempt = 0; !runId && attempt < 12; attempt += 1) {
      const runs = api(`${endpoint}/actions/workflows/${workflow}/runs?per_page=30`);
      runId = runs.workflow_runs.find((run) => run.display_title === `Preview upload ${requestId}`)?.id;
      if (!runId) await delay(5000);
    }
    assert.ok(runId, 'Dispatch sent, but no matching run found; inspect before dispatching again');
    console.log(`Deployment run: https://github.com/${repo}/actions/runs/${runId}`);
    gh(['run', 'watch', String(runId), '--repo', repo, '--compact', '--exit-status', '--interval', '15']);
    const deployed = api(pagesPath);
    await verify(deployed.html_url, html);
    removeArtifacts();
    console.log(`Published and byte-verified: ${deployed.html_url}`);
  } finally {
    removeSecret();
  }
}
