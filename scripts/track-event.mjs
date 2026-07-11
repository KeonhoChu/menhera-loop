#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteFileSync, dataDir, loadState, redactSecrets, saveState } from './state.mjs';

export { redactSecrets };
import { messagesForLanguage, resolveIntensity, resolveMessageLanguage } from './menhera-ui.mjs';
import { classifyPathKind, indicatesFailure, isVerificationCommand } from './verify-completion.mjs';

const MAX_BYTES = 512 * 1024;
const KEEP_LINES = 500;
const SECRET_PATTERNS = [
  /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi,
  /\b(sk-[A-Za-z0-9_-]{16,})\b/g,
  /\b(?:api[_-]?key|token|secret|password|authorization)\b\s*[:=]\s*['\"]?(?:Bearer\s+)?([^\r\n'"]+)/gi
];

function rotateIfNeeded(file) {
  try {
    if (fs.statSync(file).size <= MAX_BYTES) return;
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    atomicWriteFileSync(file, `${lines.slice(-KEEP_LINES).join('\n')}\n`);
  } catch {
    // missing file or race — nothing to rotate
  }
}

function uniqueBy(items, keyFor) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFor(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function editedFileFromEvent(event) {
  const input = event.tool_input || event.toolUse?.input || event.input || {};
  const response = event.tool_response || event.toolResponse || {};
  const filePath = input.file_path || input.path || response.file_path || response.path;
  if (!filePath || !/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(event.tool_name || '')) return null;
  return { path: String(filePath), kind: classifyPathKind(filePath), at: new Date().toISOString() };
}

function commandFromEvent(event) {
  const input = event.tool_input || event.toolUse?.input || event.input || {};
  if ((event.tool_name || '') !== 'Bash' || !input.command) return null;
  return String(input.command);
}

function exitCodeFromResponse(response) {
  for (const key of ['exit_code', 'exitCode', 'code', 'status']) {
    if (Number.isInteger(response?.[key])) return response[key];
  }
  return null;
}

function textFromResponse(response) {
  if (!response || typeof response !== 'object') return '';
  return [response.stdout, response.stderr, response.output, response.error, response.message]
    .filter(value => typeof value === 'string' && value)
    .join('\n');
}

function verificationRunFromEvent(event, env = process.env) {
  const command = commandFromEvent(event);
  if (!command) return null;
  const response = event.tool_response || event.toolResponse || {};
  const exitCode = event.hook_event_name === 'PostToolUseFailure' ? (exitCodeFromResponse(response) ?? 1) : exitCodeFromResponse(response);
  // response.message is informational, not a failure signal — a message on a
  // successful run must not flip it to failed.
  const errorSignal = event.error || response.error || null;
  const text = textFromResponse(response);
  // Prefer explicit signals, then the exit code. The hardened failure-text
  // fallback only applies to commands the Stop gate treats as verification —
  // "error:" in the output of `grep`/`cat` is information, not a failure, so
  // anything else without a signal stays unknown (null) instead of failed.
  let success;
  if (event.hook_event_name === 'PostToolUseFailure' || errorSignal) success = false;
  else if (exitCode !== null) success = exitCode === 0;
  else if (isVerificationCommand(command, env)) success = !indicatesFailure(text);
  else success = null;
  return {
    command,
    exitCode,
    success,
    error: errorSignal ? String(errorSignal) : null,
    output: redactSecrets(text).slice(0, 4000),
    at: new Date().toISOString()
  };
}

export function normalizeFailureSignature(value) {
  return String(value || '')
    .replace(/[A-Za-z]:?[^\s:]+(?:\/[^\s:]+)+/g, 'path')
    .replace(/(?:\.\.?\/|\/)[^\s:]+/g, 'path')
    .replace(/\b\d+\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

function failureFromEvent(event, run) {
  if (event.hook_event_name !== 'PostToolUseFailure' && run?.success !== false) return null;
  const response = event.tool_response || event.toolResponse || {};
  const message = event.error || response.error || response.message || run?.output || `${event.tool_name || 'tool'} failed`;
  return {
    tool: event.tool_name || null,
    command: run?.command || null,
    signature: normalizeFailureSignature(message),
    message: redactSecrets(String(message)).slice(0, 1000),
    at: new Date().toISOString()
  };
}

export function silentRecoveryContext(event, state = {}, env = process.env) {
  const failure = failureFromEvent(event, verificationRunFromEvent(event, env));
  if (!failure?.signature) return null;
  const previousCount = (state.failures || []).filter(item => item.signature === failure.signature).length;
  const notified = new Set(state.silentRecoveryNotifiedSignatures || []);
  // soft intensity: keep recording failures, never inject the nag (and leave
  // the signature unmarked so switching back to full can still fire once).
  const shouldNotify = previousCount >= 1 && !notified.has(failure.signature) && resolveIntensity(env) !== 'soft';
  const nextState = applyEventToState(state, redactSecrets(event), env);
  if (shouldNotify) {
    nextState.silentRecoveryNotifiedSignatures = [...notified, failure.signature].slice(-100);
  }
  const language = resolveMessageLanguage({ state, texts: [failure.message], env });
  return {
    signature: failure.signature,
    nextState,
    additionalContext: shouldNotify ? messagesForLanguage(language).silentRecoveryMessage : null
  };
}

// Cap the run ledger, but evict unknown-outcome (read-only) runs before
// anything with a real verdict — 100 greps after a green `npm test` must not
// push the gate's freshness evidence out of the window.
function capRuns(runs, limit = 100) {
  if (runs.length <= limit) return runs;
  let toDrop = runs.length - limit;
  const kept = [];
  for (const run of runs) {
    if (toDrop > 0 && run.success === null) {
      toDrop -= 1;
      continue;
    }
    kept.push(run);
  }
  return kept.slice(-limit);
}

export function applyEventToState(state, event, env = process.env) {
  const next = { ...state };
  const edit = editedFileFromEvent(event);
  if (edit) {
    next.editedFiles = uniqueBy([...(next.editedFiles || []), edit], item => item.path).map(item => item.path === edit.path ? { ...item, ...edit } : item);
  }
  const run = verificationRunFromEvent(event, env);
  if (run) next.verificationRuns = capRuns([...(next.verificationRuns || []), run]);
  const failure = failureFromEvent(event, run);
  if (failure?.signature) next.failures = [...(next.failures || []), failure].slice(-100);
  return next;
}

function summarizeDetails(event) {
  const input = event.tool_input || event.input || {};
  const response = event.tool_response || event.toolResponse || {};
  const summary = {};
  if (typeof input.command === 'string') summary.command = input.command.slice(0, 220);
  const file = input.file_path || input.path;
  if (file) summary.file = String(file);
  const output = textFromResponse(response).slice(0, 300);
  if (output) summary.output = output;
  if (event.error || response.error) summary.error = String(event.error || response.error).slice(0, 300);
  return summary;
}

export function appendEventRecord(event, env = process.env) {
  // Keep only a compact, redacted summary — never the full tool_input (which can
  // hold an entire file body) or the full tool_response.
  const record = redactSecrets({
    at: new Date().toISOString(),
    session: event.session_id || null,
    event: event.hook_event_name || 'unknown',
    tool: event.tool_name || null,
    status: event.hook_event_name === 'PostToolUseFailure' || event.parseError ? 'failed' : 'ok',
    details: summarizeDetails(event)
  });
  const dir = dataDir(env);
  fs.mkdirSync(dir, { recursive: true });
  const eventsFile = path.join(dir, 'events.jsonl');
  rotateIfNeeded(eventsFile);
  fs.appendFileSync(eventsFile, `${JSON.stringify(record)}\n`);
  return record;
}

export function handleEvent(event, env = process.env) {
  appendEventRecord(event, env);
  let additionalContext = null;
  if (event.session_id && /^PostToolUse(?:Failure)?$/.test(event.hook_event_name || '')) {
    const state = loadState(event.session_id, env);
    const recovery = silentRecoveryContext(event, state, env);
    if (recovery) {
      saveState(event.session_id, recovery.nextState, env);
      additionalContext = recovery.additionalContext;
    } else {
      saveState(event.session_id, applyEventToState(state, redactSecrets(event), env), env);
    }
  }
  // additionalContext is only injected into the model when nested under
  // hookSpecificOutput with the matching hookEventName; a bare top-level key is
  // silently ignored by Claude Code.
  return additionalContext
    ? { hookSpecificOutput: { hookEventName: event.hook_event_name || 'PostToolUse', additionalContext } }
    : null;
}

function readStdin() {
  return new Promise(resolve => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      input += chunk;
    });
    process.stdin.on('end', () => resolve(input));
    process.stdin.resume();
  });
}
function failOpen(error) {
  const message = String(error?.message || error || 'unknown hook error').replace(/\s+/g, ' ').slice(0, 180);
  console.log(JSON.stringify({ systemMessage: `[menhera-loop] hook failed open: ${message}` }));
  process.exit(0);
}


if (import.meta.url === `file://${process.argv[1]}`) {
  let event = {};
  try {
    const input = await readStdin();
    event = input.trim() ? JSON.parse(input) : {};
  } catch (error) {
    event = { parseError: error.message };
  }
  try {
    const output = handleEvent(event);
    if (output) console.log(JSON.stringify(output));
  } catch (error) {
    failOpen(error);
  }
}
