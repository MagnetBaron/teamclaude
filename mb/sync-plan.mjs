#!/usr/bin/env node
/**
 * Magnet Baron overlay: keep teamclaude routing valid as seats and plans change.
 *
 * Does not exclusive-pin models to alias names (max / premium-1 / …). Those
 * names never match the email TeamClaude stores after login, and they go stale
 * when a seat loses Fable. Per-model quota routing is automatic; this script
 * only:
 *   - refreshes OAuth tokens that are about to expire
 *   - probes /api/oauth/usage (zero spend) for a Fable weekly bucket
 *   - blocks *fable* when no logged-in seat can serve it (avoids hung pipelines)
 *   - unblocks Fable when any seat reports that bucket again
 *   - drops exclusive routes whose account names are not in the live fleet
 *   - sets fleet defaults that survive plan changes
 *
 * Tokens are never printed.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const FABLE_GLOB = '*fable*';
const PLACEHOLDER_NAMES = new Set(['max', 'premium-1', 'premium-2', 'standard-1']);

const { atomicConfigUpdate, loadConfig, getConfigPath } = await import(join(repoRoot, 'src/config.js'));
const { fetchProfile, fetchUsage, refreshAccessToken, isTokenExpiringSoon } = await import(join(repoRoot, 'src/oauth.js'));

function git(args) {
  return spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' });
}

function ffPullClone() {
  const origin = git(['pull', '--ff-only', 'origin', 'master']);
  if (origin.status === 0) {
    const out = (origin.stdout || '').trim();
    if (out && !/Already up to date/i.test(out)) console.log(`[mb-sync-plan] origin: ${out.split('\n')[0]}`);
  } else {
    const err = (origin.stderr || origin.stdout || '').trim().split('\n').pop();
    if (err) console.log(`[mb-sync-plan] origin pull skipped: ${err}`);
  }

  const fetch = git(['fetch', '--no-tags', 'upstream', 'master']);
  if (fetch.status !== 0) {
    const err = (fetch.stderr || '').trim().split('\n').pop();
    if (err) console.log(`[mb-sync-plan] upstream fetch skipped: ${err}`);
    return;
  }
  const merge = git(['merge', '--no-edit', 'upstream/master']);
  if (merge.status === 0) {
    const out = (merge.stdout || '').trim();
    if (out && !/Already up to date/i.test(out)) console.log(`[mb-sync-plan] upstream: ${out.split('\n').slice(-1)[0]}`);
  } else {
    git(['merge', '--abort']);
    console.log('[mb-sync-plan] upstream merge conflict — left clone unchanged; resolve in MagnetBaron/teamclaude');
  }
}

function liveAccountNames(accounts) {
  return new Set((accounts || []).map((a) => a.name).filter(Boolean));
}

function dropStaleExclusiveRoutes(config) {
  const known = liveAccountNames(config.accounts);
  const before = Array.isArray(config.routes) ? config.routes : [];
  const kept = [];
  for (const route of before) {
    const names = Array.isArray(route.accounts) ? route.accounts : [];
    if (!names.length) {
      kept.push(route);
      continue;
    }
    const missing = names.filter((n) => !known.has(n));
    const placeholders = names.filter((n) => PLACEHOLDER_NAMES.has(n));
    if (placeholders.length || missing.length === names.length) {
      console.log(`[mb-sync-plan] dropped stale route "${route.name || '(unnamed)'}" (accounts not in fleet)`);
      continue;
    }
    kept.push(route);
  }
  config.routes = kept;
}

function applyFleetDefaults(config) {
  if (config.distributeSessions !== true) config.distributeSessions = true;
  if (!config.quotaProbeSeconds) config.quotaProbeSeconds = 300;
  if (!config.holdSeconds) config.holdSeconds = 120;
  if (config.autoUpdate === false) {
    // Keep operator opt-out; only set the default when unset.
  }
  if (config.switchThreshold == null) config.switchThreshold = 0.98;
}

function setBlocked(config, glob, on) {
  const list = Array.isArray(config.blockedModels) ? config.blockedModels.slice() : [];
  const has = list.includes(glob);
  if (on && !has) list.push(glob);
  if (!on && has) {
    config.blockedModels = list.filter((p) => p !== glob);
    return;
  }
  config.blockedModels = list;
}

async function inspectAccount(account) {
  if (account.type === 'apikey') {
    return { name: account.name, kind: 'apikey', fable: 'unknown' };
  }
  if (!account.refreshToken && !account.accessToken) {
    return { name: account.name, kind: 'oauth', fable: 'unknown', error: 'no token' };
  }

  if (account.refreshToken && isTokenExpiringSoon(account.expiresAt)) {
    try {
      const next = await refreshAccessToken(account.refreshToken);
      if (next?.accessToken) {
        account.accessToken = next.accessToken;
        if (next.refreshToken) account.refreshToken = next.refreshToken;
        if (next.expiresAt) account.expiresAt = next.expiresAt;
      }
    } catch (err) {
      return { name: account.name, kind: 'oauth', fable: 'unknown', error: `refresh failed: ${err.message}` };
    }
  }

  const profile = await fetchProfile(account.accessToken);
  const usage = await fetchUsage(account.accessToken);
  const email = (!profile?.error && profile?.email) || null;
  const orgName = (!profile?.error && profile?.orgName) || account.orgName || null;
  const tier = !profile?.error
    ? (profile.hasClaudeMax ? 'Max' : profile.hasClaudePro ? 'Pro' : 'subscription')
    : 'unknown';

  let fable = 'unknown';
  if (!usage?.error) {
    fable = usage.sevenDayFable ? 'yes' : 'no';
  }

  return {
    name: account.name,
    kind: 'oauth',
    email,
    orgName,
    tier,
    fable,
    error: profile?.error || usage?.error || null,
  };
}

async function notifyServer(config) {
  const port = config?.proxy?.port;
  if (!port) return;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/teamclaude/reload`, {
      method: 'POST',
      headers: { 'x-api-key': config.proxy?.apiKey || '' },
    });
    if (res.ok) console.log('[mb-sync-plan] reloaded running proxy');
  } catch {
    /* proxy not running */
  }
}

ffPullClone();

const existing = await loadConfig();
if (!existing) {
  console.log(`[mb-sync-plan] no config at ${getConfigPath()} — run teamclaude login first`);
  process.exit(0);
}

const reports = [];
const updated = await atomicConfigUpdate(async (config) => {
  applyFleetDefaults(config);
  dropStaleExclusiveRoutes(config);

  for (const account of config.accounts || []) {
    reports.push(await inspectAccount(account));
  }

  const fableYes = reports.filter((r) => r.fable === 'yes').length;
  const fableNo = reports.filter((r) => r.fable === 'no').length;
  const fableUnknown = reports.filter((r) => r.fable === 'unknown').length;

  if (fableYes > 0) {
    setBlocked(config, FABLE_GLOB, false);
    console.log(`[mb-sync-plan] Fable served by ${fableYes} seat(s) — *fable* unblocked`);
  } else if (fableNo > 0 && fableUnknown === 0) {
    setBlocked(config, FABLE_GLOB, true);
    config.routes = (config.routes || []).filter((r) => {
      const match = Array.isArray(r.match) ? r.match : [r.match];
      const onlyFable = match.length && match.every((g) => String(g).toLowerCase().includes('fable'));
      if (onlyFable) {
        console.log(`[mb-sync-plan] dropped Fable route "${r.name || '(unnamed)'}" — no seat can serve it`);
        return false;
      }
      return true;
    });
    console.log('[mb-sync-plan] no seat reports a Fable bucket — blocked *fable*');
  } else {
    console.log(`[mb-sync-plan] Fable status inconclusive (yes=${fableYes} no=${fableNo} unknown=${fableUnknown}) — blocklist unchanged`);
  }
});

console.log(`[mb-sync-plan] config ${getConfigPath()}`);
console.log(`[mb-sync-plan] seats ${reports.length}`);
for (const r of reports) {
  const bits = [
    r.name,
    r.tier,
    r.orgName ? `org=${r.orgName}` : null,
    `fable=${r.fable}`,
    r.error ? `note=${r.error}` : null,
  ].filter(Boolean);
  console.log(`  - ${bits.join('  ')}`);
}
console.log(`[mb-sync-plan] blockedModels=${JSON.stringify(updated.blockedModels || [])}`);
console.log(`[mb-sync-plan] routes=${(updated.routes || []).length}  probe=${updated.quotaProbeSeconds}s  hold=${updated.holdSeconds}s  distributeSessions=${updated.distributeSessions}`);

await notifyServer(updated);
