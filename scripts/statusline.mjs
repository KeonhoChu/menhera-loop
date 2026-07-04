#!/usr/bin/env node
// Status line renderer. Claude Code invokes this command on each refresh with
// session JSON on stdin and shows the first stdout line as the status line.
// This file is copied into the menhera-loop data directory by setup-ui, so it
// must stay self-contained: no imports from sibling scripts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function dataDir(env = process.env) {
  return env.MENHERA_LOOP_DATA || path.join(os.homedir(), '.claude', 'menhera-loop');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readStdin() {
  return new Promise(resolve => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      input += chunk;
    });
    process.stdin.on('end', () => resolve(input));
    process.stdin.resume();
  });
}

// Same arithmetic as calculateTrust in menhera-ui.mjs.
function sessionTrust(state) {
  return Math.max(
    0,
    100 - (Number(state.retryCount) || 0) * 15 - (Number(state.falseCompletionClaims) || 0) * 20
  );
}

function pickMood(state, profile) {
  const retries = Number(state.retryCount) || 0;
  const falseClaims = Number(state.falseCompletionClaims) || 0;
  if (state.lastVerdict === 'gave_up' || retries >= 5) return 'broken';
  if (retries >= 3) return 'spiraling';
  if (retries >= 1 || falseClaims >= 1) return 'suspicious';
  if ((Number(profile.streak) || 0) >= 1 && (Number(profile.trust) || 0) >= 80) return 'ok';
  return 'watching';
}

const raw = await readStdin();
let input = {};
try {
  input = raw.trim() ? JSON.parse(raw) : {};
} catch {
  input = {};
}

const config = readJson(path.join(dataDir(), 'ui-config.json'));
if (!config) process.exit(0);

if (config.variant === 'farewell' && typeof config.farewellStatusLine === 'string') {
  process.stdout.write(`${config.farewellStatusLine}\n`);
  process.exit(0);
}

const moods = config.statusLine;
if (!moods || typeof moods !== 'object') process.exit(0);

const safeSession = String(input.session_id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');
const state = readJson(path.join(dataDir(), 'sessions', `${safeSession}.json`)) || {};
const profile = readJson(path.join(dataDir(), 'trust-profile.json')) || { trust: 100, streak: 0 };

// While the gate is actively docking this session, show the session trust the
// retry messages quote; otherwise show the long-term trust she carries over.
const active = (Number(state.retryCount) || 0) > 0 || (Number(state.falseCompletionClaims) || 0) > 0;
const longTermTrust = Number.isFinite(Number(profile.trust)) ? Number(profile.trust) : 100;
const trust = active ? sessionTrust(state) : Math.max(0, Math.min(100, longTermTrust));

const template = moods[pickMood(state, profile)];
if (typeof template !== 'string') process.exit(0);
const line = template
  .replaceAll('${trust}', String(trust))
  .replaceAll('${streak}', String(Number(profile.streak) || 0));
process.stdout.write(`${line}\n`);
