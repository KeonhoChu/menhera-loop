#!/usr/bin/env node
// Subagent status line renderer. Claude Code invokes this command once per
// refresh tick with {columns, tasks} JSON on stdin and renders each
// {"id","content"} JSON line we print as the row body for that task.
// This file is copied into the menhera-loop data directory by setup-ui, so it
// must stay self-contained: no imports from sibling scripts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function configFile(env = process.env) {
  const dir = env.MENHERA_LOOP_DATA || path.join(os.homedir(), '.claude', 'menhera-loop');
  return path.join(dir, 'ui-config.json');
}

function loadTemplates() {
  try {
    const parsed = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
    if (parsed && typeof parsed.subagentStatusLine === 'object' && parsed.subagentStatusLine) {
      return parsed.subagentStatusLine;
    }
  } catch {
    // Missing or unreadable config: keep Claude's default rows.
  }
  return null;
}

function templateForStatus(templates, status) {
  const value = String(status || '').toLowerCase();
  if (/fail|error|cancel/.test(value)) return templates.failed;
  if (/complet|success|done|finish/.test(value)) return templates.completed;
  if (/wait|pend|queue|idle|block/.test(value)) return templates.waiting;
  return templates.running;
}

function truncateToColumns(text, columns) {
  if (!Number.isFinite(columns) || columns <= 0) return text;
  let used = 0;
  let out = '';
  for (const char of text) {
    used += char.codePointAt(0) > 0x7f ? 2 : 1;
    if (used > columns) break;
    out += char;
  }
  return out;
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

const raw = await readStdin();
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const templates = loadTemplates();
const tasks = Array.isArray(input?.tasks) ? input.tasks : [];
if (!templates || tasks.length === 0) process.exit(0);

const lines = [];
for (const task of tasks) {
  if (!task || task.id === undefined || task.id === null) continue;
  const template = templateForStatus(templates, task.status);
  if (typeof template !== 'string') continue;
  const agent = String(task.name || task.label || task.type || 'agent');
  const content = truncateToColumns(template.replaceAll('${agent}', agent), Number(input.columns));
  lines.push(JSON.stringify({ id: task.id, content }));
}
if (lines.length > 0) process.stdout.write(`${lines.join('\n')}\n`);
