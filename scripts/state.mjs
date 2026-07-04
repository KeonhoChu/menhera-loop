import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MAX_RETRIES = 5;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function dataDir(env = process.env) {
  return env.MENHERA_LOOP_DATA || path.join(os.homedir(), '.claude', 'menhera-loop');
}

export function emptyState() {
  return {
    retryCount: 0,
    falseCompletionClaims: 0,
    requirements: [],
    lastVerdict: null,
    updatedAt: null
  };
}

function stateFile(sessionId, env) {
  const safe = String(sessionId || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');
  return path.join(dataDir(env), 'sessions', `${safe}.json`);
}

export function loadState(sessionId, env = process.env) {
  try {
    const raw = fs.readFileSync(stateFile(sessionId, env), 'utf8');
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch {
    return emptyState();
  }
}

export function saveState(sessionId, state, env = process.env) {
  const file = stateFile(sessionId, env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = { ...emptyState(), ...state, updatedAt: new Date().toISOString() };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function resetState(sessionId, env = process.env) {
  return saveState(sessionId, emptyState(), env);
}

// Long-term trust survives sessions: passes earn it back slowly, empty
// completion claims burn it fast, and the streak counts consecutive
// first-try (zero-retry) gate passes. She remembers.
export function trustProfilePath(env = process.env) {
  return path.join(dataDir(env), 'trust-profile.json');
}

export function emptyTrustProfile() {
  return {
    trust: 100,
    streak: 0,
    passes: 0,
    blocks: 0,
    falseClaims: 0,
    lastOutcome: null,
    updatedAt: null
  };
}

export function loadTrustProfile(env = process.env) {
  try {
    const raw = fs.readFileSync(trustProfilePath(env), 'utf8');
    return { ...emptyTrustProfile(), ...JSON.parse(raw) };
  } catch {
    return emptyTrustProfile();
  }
}

export function saveTrustProfile(profile, env = process.env) {
  const file = trustProfilePath(env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = { ...emptyTrustProfile(), ...profile, updatedAt: new Date().toISOString() };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function clampTrust(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function recordGateOutcome({ outcome, firstTry = false, falseClaim = false }, env = process.env) {
  const profile = loadTrustProfile(env);
  if (outcome === 'pass') {
    profile.trust = clampTrust(profile.trust + (firstTry ? 5 : 2));
    profile.streak = firstTry ? profile.streak + 1 : 0;
    profile.passes += 1;
  } else if (outcome === 'block') {
    profile.trust = clampTrust(profile.trust - (falseClaim ? 5 : 2));
    profile.streak = 0;
    profile.blocks += 1;
    if (falseClaim) profile.falseClaims += 1;
  } else if (outcome === 'gave_up') {
    profile.trust = clampTrust(profile.trust - 10);
    profile.streak = 0;
  } else {
    return profile;
  }
  profile.lastOutcome = outcome;
  return saveTrustProfile(profile, env);
}

export function cleanupOldSessions(env = process.env, now = Date.now()) {
  const dir = path.join(dataDir(env), 'sessions');
  let removed = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return removed;
  }
  for (const entry of entries) {
    const file = path.join(dir, entry);
    try {
      if (now - fs.statSync(file).mtimeMs > SESSION_TTL_MS) {
        fs.unlinkSync(file);
        removed += 1;
      }
    } catch {
      // ignore races; cleanup is best-effort
    }
  }
  return removed;
}
