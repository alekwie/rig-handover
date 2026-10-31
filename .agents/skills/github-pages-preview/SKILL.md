---
name: github-pages-preview
description: Publish, overwrite, or take down a private static HTML capture on an approved GitHub Pages site without committing the HTML. Uses this repository's artifact-only Actions workflow and existing gh authentication; not for branch-based sites or running the rig server publicly.
---

# GitHub Pages preview

Use the existing [uploader](../../../scripts/pages-preview.mjs) and
[manual workflow](../../../.github/workflows/preview-pages.yml). Their source stays here;
do not copy this skill into harness-specific folders.

## Authorization and capture

- Confirm the human-owned repository, active GitHub login, exact public URL and private
  capture file. Explain the page, audience, reason and overwrite/disable options before
  obtaining publication approval. Authentication is not approval.
- For the morning-digest plan, wait for the actual review and obtain separate approval
  before removing the marker. Regenerate through rig with `LANE_MARKER` unset; verify
  `no marker set` and absence of the original marker before uploading over the SAME URL.
- Keep HTML, proofs and request logs outside the tracked checkout. Never put the HTML or
  marker in git, issues, workflow inputs, command arguments or chat attachments.
- The workflow must already be committed on the default branch. It uses a temporary
  encrypted Actions secret, a deletable Pages artifact and no source checkout.

## Run from the repository root

Read `node scripts/pages-preview.mjs --help` and the relevant `gh ... --help` first.
Node and gh are sufficient; do not install hosting tools or create another account.
The uploader refuses the wrong active account, branch-published sites, custom-domain
sites and captures above its secret-size limit. Do not run two uploads concurrently.

Publish or replace an approved capture:

```sh
node scripts/pages-preview.mjs put /absolute/private/page.html \
  --repo OWNER/REPO --account LOGIN --log /absolute/private/pages-requests.jsonl
```

The command enables workflow-based Pages if absent, uploads the HTML through stdin to a
short-lived secret, dispatches one uniquely identified workflow and waits. It checks the
public root URL byte-for-byte and for HTTP 200/text/html, deletes this workflow's Pages
artifacts, and deletes the temporary secret. Its final output contains the verified URL.
No capture content is printed or written to the request log.

Disable the approved site:

```sh
node scripts/pages-preview.mjs take-down \
  --repo OWNER/REPO --account LOGIN --log /absolute/private/pages-requests.jsonl
```

This deletes the Pages configuration, removes the preview secret/artifacts and waits for
HTTP 404 at the original URL. It does not delete the repository. A later `put` can recreate
the same URL. This is a separate action from replacing a reviewed marked page.

## Failure and evidence

Inspect the private request log if any step fails. The site may already be published even
if verification or cleanup fails. Check the recorded workflow run and current Pages state
before another dispatch; do not retry a mutating operation blindly. CDN propagation checks
are bounded. Stop and report if the expected state does not appear.

The put/take-down routine was exercised on 2026-10-31 on `alekwie/rig-handover` using
harmless HTML: publication was byte-verified and removal returned HTTP 404. Use the
actual returned URL and private request/reply log as evidence, not an assumed URL.
