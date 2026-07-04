#!/usr/bin/env node
// Scripted replay for the README demo GIF (recorded with demo.tape / vhs).
// The "Claude" lines are staged, but every menhera line is real output:
// verify-completion.mjs and statusline.mjs run against fixture transcripts
// in a throwaway MENHERA_LOOP_DATA directory.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSubagentRenderer } from '../scripts/menhera-ui.mjs';
import { emptyState, saveState, saveTrustProfile } from '../scripts/state.mjs';

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'menhera-demo-'));
const env = { ...process.env, MENHERA_LOOP_DATA: DATA };
const SESSION = 'demo';

const dim = s => `\x1b[2m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const pink = s => `\x1b[38;5;211m${s}\x1b[0m`;
const orange = s => `\x1b[38;5;215m${s}\x1b[0m`;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function typeOut(text, { prefix = '', paint = s => s, cpms = 28 } = {}) {
  process.stdout.write(prefix);
  for (const char of text) {
    process.stdout.write(paint(char));
    await sleep(cpms);
  }
  process.stdout.write('\n');
}

function transcriptLine(entry) {
  return JSON.stringify(entry);
}

const editOnly = [
  transcriptLine({ type: 'user', message: { role: 'user', content: '로그인 버그 고쳐줘' } }),
  transcriptLine({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'src/login.js' } }] }
  }),
  transcriptLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '수정 완료했습니다.' }] } })
].join('\n');

const withGreenTests = [
  editOnly,
  transcriptLine({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'npm test' } }] }
  }),
  transcriptLine({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', is_error: false, content: '12 passed, 0 failed' }] }
  }),
  transcriptLine({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: '로그인 버그 수정 완료. 테스트 12개 전부 통과했어요.' }] }
  })
].join('\n');

function runGate(transcript, cwd) {
  const transcriptFile = path.join(DATA, 'transcript.jsonl');
  fs.writeFileSync(transcriptFile, transcript);
  const result = spawnSync('node', [path.join(SCRIPTS, 'verify-completion.mjs')], {
    input: JSON.stringify({ session_id: SESSION, transcript_path: transcriptFile, hook_event_name: 'Stop', cwd }),
    encoding: 'utf8',
    env
  });
  return result.stdout.trim() ? JSON.parse(result.stdout) : {};
}

function runStatusLine(sessionId) {
  const result = spawnSync('node', [path.join(SCRIPTS, 'statusline.mjs')], {
    input: JSON.stringify({ session_id: sessionId }),
    encoding: 'utf8',
    env
  });
  return result.stdout.trim();
}

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'menhera-demo-cwd-'));

// ── Scene 1 · Claude declares victory without evidence ─────────────────────
await sleep(600);
await typeOut('로그인 버그 고쳐줘', { prefix: dim('❯ ') });
await sleep(700);
await typeOut('src/login.js 수정했어요. 다 됐습니다, 완료!', { prefix: orange('⏺ ') });
await sleep(800);

// ── Scene 2 · the gate bites (real Stop-hook output) ───────────────────────
const blocked = runGate(editOnly, cwd);
console.log(red('\n  ✗ 끝났어?끝났어?끝났어?끝났어?끝났어?끝났어?끝났어?\n'));
await sleep(500);
for (const line of String(blocked.reason || '').split('\n').slice(0, 4)) {
  console.log(pink(`  ${line}`));
  await sleep(350);
}
await sleep(1200);

// ── Scene 3 · Claude gives in and shows evidence ───────────────────────────
console.log('');
await typeOut('…테스트를 실행해서 증거를 보여드릴게요.', { prefix: orange('⏺ ') });
await sleep(400);
console.log(dim('  $ npm test'));
await sleep(900);
console.log(green('  12 passed, 0 failed'));
await sleep(800);

// ── Scene 4 · release, with the real success message ───────────────────────
const released = runGate(withGreenTests, cwd);
console.log('');
console.log(green(`  ✔ ${released.systemMessage || ''}`));
await sleep(1600);

// ── Scene 5 · the 0.3.0 status line, mood by mood (real renderer) ──────────
installSubagentRenderer({ language: 'ko', env });
console.log(dim('\n  ── statusLine · 세션 내내 지켜봄 ──'));
await sleep(600);

saveState('fresh', emptyState(), env);
console.log(`  ${pink(runStatusLine('fresh'))}`);
await sleep(1100);

saveState('caught', { ...emptyState(), retryCount: 2, falseCompletionClaims: 1 }, env);
console.log(`  ${pink(runStatusLine('caught'))}`);
await sleep(1100);

saveTrustProfile({ trust: 92, streak: 4 }, env);
saveState('loyal', emptyState(), env);
console.log(`  ${pink(runStatusLine('loyal'))}`);
await sleep(2200);
