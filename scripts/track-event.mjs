#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './state.mjs';

const MAX_BYTES = 512 * 1024;
const KEEP_LINES = 500;

function rotateIfNeeded(file) {
  try {
    if (fs.statSync(file).size <= MAX_BYTES) return;
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    fs.writeFileSync(file, `${lines.slice(-KEEP_LINES).join('\n')}\n`);
  } catch {
    // missing file or race — nothing to rotate
  }
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
});
process.stdin.on('end', () => {
  let event = {};
  try {
    event = input.trim() ? JSON.parse(input) : {};
  } catch (error) {
    event = { parseError: error.message };
  }
  const record = {
    at: new Date().toISOString(),
    session: event.session_id || null,
    event: event.hook_event_name || 'unknown',
    tool: event.tool_name || null,
    status: event.hook_event_name === 'PostToolUseFailure' || event.parseError ? 'failed' : 'ok'
  };
  try {
    const dir = dataDir();
    fs.mkdirSync(dir, { recursive: true });
    const eventsFile = path.join(dir, 'events.jsonl');
    rotateIfNeeded(eventsFile);
    fs.appendFileSync(eventsFile, `${JSON.stringify(record)}\n`);
  } catch {
    // best-effort logging; never fail the hook
  }
});
process.stdin.resume();
