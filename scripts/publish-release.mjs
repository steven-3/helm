#!/usr/bin/env node
// Mirrors a tagged Helm release from the private build repo to the public
// update-feed repo (steven-3/helm-releases): installers, updater .sig files,
// and latest.json — with latest.json's platform URLs rewritten to point at the
// public repo so the in-app updater can download without authentication.
//
// Usage:
//   node scripts/publish-release.mjs [vX.Y.Z]
//
// Defaults to v<package.json version>. Requires the GitHub CLI (`gh`) with
// access to BOTH repos. Run locally after the release workflow finishes.
//
// CI automation (optional): set RELEASE_PAT to a token with `contents:write`
// on steven-3/helm-releases and run this script in a workflow job with
// GH_TOKEN=$RELEASE_PAT — the default workflow GITHUB_TOKEN cannot write to
// another repository.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_REPO = 'steven-3/helm';
const TARGET_REPO = 'steven-3/helm-releases';

const scriptDir = dirname(fileURLToPath(import.meta.url));

function gh(args, options = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options });
}

function fail(message) {
  console.error(`publish-release: ${message}`);
  process.exit(1);
}

// --- resolve tag -----------------------------------------------------------
let tag = process.argv[2];
if (!tag) {
  const pkg = JSON.parse(readFileSync(join(scriptDir, '..', 'package.json'), 'utf8'));
  tag = `v${pkg.version}`;
}
if (!/^v\d+\.\d+\.\d+/.test(tag)) fail(`tag does not look like a version tag: ${tag}`);

console.log(`Mirroring ${SOURCE_REPO} ${tag} -> ${TARGET_REPO}`);

// --- download all assets from the private release --------------------------
const workDir = mkdtempSync(join(tmpdir(), 'helm-release-'));
try {
  gh(['release', 'download', tag, '--repo', SOURCE_REPO, '--dir', workDir]);

  const assets = readdirSync(workDir);
  if (assets.length === 0) fail(`release ${tag} on ${SOURCE_REPO} has no assets`);
  if (!assets.includes('latest.json')) {
    fail(
      `release ${tag} has no latest.json — did the workflow run with ` +
        'includeUpdaterJson + TAURI_SIGNING_PRIVATE_KEY?',
    );
  }

  // --- rewrite latest.json URLs to the public repo -------------------------
  const latestPath = join(workDir, 'latest.json');
  const latest = JSON.parse(readFileSync(latestPath, 'utf8'));
  if (!latest.platforms || typeof latest.platforms !== 'object') {
    fail('latest.json has no platforms map');
  }
  const sourcePrefix = `https://github.com/${SOURCE_REPO}/releases/download/`;
  // tauri-action emits API asset URLs (private-repo shape); map asset id -> filename.
  const apiAssetPrefix = `https://api.github.com/repos/${SOURCE_REPO}/releases/assets/`;
  const assetNameById = new Map(
    JSON.parse(
      gh(['api', `repos/${SOURCE_REPO}/releases/tags/${tag}`, '--jq', '{assets: [.assets[] | {id, name}]}']),
    ).assets.map((a) => [String(a.id), a.name]),
  );
  const targetPrefix = `https://github.com/${TARGET_REPO}/releases/download/`;
  for (const [platform, entry] of Object.entries(latest.platforms)) {
    if (typeof entry?.url !== 'string' || typeof entry?.signature !== 'string') {
      fail(`latest.json platform ${platform} is missing url/signature`);
    }
    let fileName;
    if (entry.url.startsWith(sourcePrefix)) {
      fileName = entry.url.slice(sourcePrefix.length).split('/').slice(1).join('/');
    } else if (entry.url.startsWith(apiAssetPrefix)) {
      fileName = assetNameById.get(entry.url.slice(apiAssetPrefix.length).split(/[/?#]/)[0]);
    }
    if (!fileName) {
      fail(`latest.json platform ${platform} url not resolvable to an asset of ${SOURCE_REPO}: ${entry.url}`);
    }
    entry.url = `${targetPrefix}${tag}/${fileName}`;
  }
  writeFileSync(latestPath, `${JSON.stringify(latest, null, 2)}\n`);
  console.log(`Rewrote latest.json URLs for ${Object.keys(latest.platforms).length} platform(s)`);

  // --- create (or reuse) the public release --------------------------------
  let releaseExists = true;
  try {
    gh(['release', 'view', tag, '--repo', TARGET_REPO], { stdio: ['ignore', 'ignore', 'ignore'] });
  } catch {
    releaseExists = false;
  }
  if (!releaseExists) {
    gh([
      'release',
      'create',
      tag,
      '--repo',
      TARGET_REPO,
      '--title',
      `Helm ${tag}`,
      '--notes',
      `Helm ${tag} installers and auto-update feed. Source and changelog live in the main repository.`,
    ]);
    console.log(`Created release ${tag} on ${TARGET_REPO}`);
  } else {
    console.log(`Release ${tag} already exists on ${TARGET_REPO} — updating assets`);
  }

  // --- upload everything (installers, .sig files, latest.json) -------------
  const uploads = assets.map((name) => join(workDir, name));
  gh(['release', 'upload', tag, ...uploads, '--repo', TARGET_REPO, '--clobber']);
  console.log(`Uploaded ${uploads.length} asset(s):`);
  for (const name of assets.sort()) console.log(`  ${name}`);
  console.log(
    `Done. Updater feed: https://github.com/${TARGET_REPO}/releases/latest/download/latest.json`,
  );
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
