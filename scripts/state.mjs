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
