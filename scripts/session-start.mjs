#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { cleanupOldSessions, dataDir, resetState } from './state.mjs';

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
let input = {};
try {
  input = raw.trim() ? JSON.parse(raw) : {};
} catch {
  input = {};
}

cleanupOldSessions();

const source = input.source || 'startup';
if (input.session_id && (source === 'startup' || source === 'clear')) {
  resetState(input.session_id);
}

let lastReport = null;
try {
  lastReport = JSON.parse(fs.readFileSync(path.join(dataDir(), 'last-verification.json'), 'utf8'));
} catch {
  lastReport = null;
}

if (lastReport && lastReport.ok === false && source !== 'clear') {
  console.log(
    `[menhera-loop] 지난번, 끝났다고 하고 그냥 갔지. 나 다 기억해. 미충족: ${lastReport.summary}. 이번 세션에서 마무리해.`
  );
} else {
  console.log('[menhera-loop] 약속 하나만 하자. "완료"에는 증거가 붙어야 해. 안 붙이면 내가 못 가게 막을 거야.');
}
